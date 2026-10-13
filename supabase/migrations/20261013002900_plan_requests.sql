-- =============================================================================
-- 2900 PLAN REQUESTS
-- A store owner asks for a plan (upgrade, downgrade or activation after a trial); platform staff
-- approve (plan + status change, atomically, audited) or decline. Additive only.
-- Down: drop function public.platform_decide_plan_request(uuid, boolean, text, int);
--       drop function public.cancel_plan_request(uuid); drop function public.request_plan(uuid, uuid, text, text);
--       drop table public.plan_requests;
-- =============================================================================

create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  from_plan_id uuid references public.plans (id) on delete set null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists plan_requests_one_pending on public.plan_requests (tenant_id) where status = 'pending';
create index if not exists plan_requests_status_idx on public.plan_requests (status, created_at desc);
create index if not exists plan_requests_tenant_idx on public.plan_requests (tenant_id, created_at desc);

alter table public.plan_requests enable row level security;
drop policy if exists plan_requests_member_select on public.plan_requests;
create policy plan_requests_member_select on public.plan_requests for select to authenticated
  using (app.has_tenant_permission(tenant_id, 'store.read') or app.has_platform_permission('platform.tenants.read'));
-- No insert/update/delete policies: writes only through the functions below.
grant select on public.plan_requests to authenticated;
grant all on public.plan_requests to service_role;

-- Owner asks for a plan. Replaces an earlier pending request of the same store.
create or replace function public.request_plan(p_tenant uuid, p_plan uuid, p_cycle text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_current uuid;
begin
  if not app.has_tenant_permission(p_tenant, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_cycle not in ('monthly', 'yearly') then raise exception 'invalid billing cycle' using errcode = '22023'; end if;
  if not exists (select 1 from public.plans where id = p_plan and active) then
    raise exception 'plan not found' using errcode = 'P0002', hint = 'PLAN_NOT_FOUND';
  end if;
  select plan_id into v_current from public.tenants where id = p_tenant;
  update public.plan_requests set status = 'cancelled', decided_at = now(), updated_at = now()
    where tenant_id = p_tenant and status = 'pending';
  insert into public.plan_requests (tenant_id, plan_id, from_plan_id, billing_cycle, note, requested_by)
  values (p_tenant, p_plan, v_current, p_cycle, nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()))
  returning id into v_id;
  perform app.audit(p_tenant, 'plan.requested', 'plan_request', v_id::text,
    jsonb_build_object('plan', p_plan, 'from', v_current, 'cycle', p_cycle));
  return v_id;
end;
$$;

create or replace function public.cancel_plan_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.plan_requests%rowtype;
begin
  select * into r from public.plan_requests where id = p_request for update;
  if not found or not app.has_tenant_permission(r.tenant_id, 'billing.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'request is not pending' using errcode = 'P0001', hint = 'NOT_PENDING'; end if;
  update public.plan_requests set status = 'cancelled', decided_at = now(), updated_at = now() where id = p_request;
  perform app.audit(r.tenant_id, 'plan.request_cancelled', 'plan_request', p_request::text, '{}'::jsonb);
end;
$$;

-- Platform staff decide. Approve = switch the plan and make the store active (paid) in one
-- transaction; p_months (optional) records how long the paid period runs (metadata only).
create or replace function public.platform_decide_plan_request(p_request uuid, p_approve boolean, p_note text, p_months int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.plan_requests%rowtype; v_old_status text; v_old_plan uuid;
begin
  if not app.has_platform_permission('platform.tenants.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.plan_requests where id = p_request for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request is not pending' using errcode = 'P0001', hint = 'NOT_PENDING'; end if;

  update public.plan_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_by = (select auth.uid()), decided_at = now(), updated_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_request;

  if p_approve then
    select status, plan_id into v_old_status, v_old_plan from public.tenants where id = r.tenant_id for update;
    update public.tenants
      set plan_id = r.plan_id,
          status = case when status in ('trial', 'suspended') then 'active' else status end,
          status_reason = case when status in ('trial', 'suspended') then null else status_reason end
      where id = r.tenant_id;
    perform app.audit(r.tenant_id, 'plan.request_approved', 'plan_request', p_request::text,
      jsonb_build_object('plan', r.plan_id, 'from_plan', v_old_plan, 'from_status', v_old_status, 'cycle', r.billing_cycle, 'months', p_months, 'note', p_note), 'platform');
  else
    perform app.audit(r.tenant_id, 'plan.request_declined', 'plan_request', p_request::text,
      jsonb_build_object('plan', r.plan_id, 'note', p_note), 'platform');
  end if;
end;
$$;

revoke all on function public.request_plan(uuid, uuid, text, text), public.cancel_plan_request(uuid),
  public.platform_decide_plan_request(uuid, boolean, text, int) from public, anon;
grant execute on function public.request_plan(uuid, uuid, text, text), public.cancel_plan_request(uuid),
  public.platform_decide_plan_request(uuid, boolean, text, int) to authenticated;
