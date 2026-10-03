-- =============================================================================
-- 1000 PLATFORM ADMIN + CUSTOM DOMAINS (Agent E, Phases 10-11)
--
-- Every function here is SECURITY DEFINER but re-checks the caller's permission
-- itself, so the app calls them with the USER-SCOPED client (no secret key needed).
--   * platform_*          -> platform staff (app.has_platform_permission)
--   * set_primary_domain / remove_custom_domain -> tenant members with domains.manage
--   * svc_domains_due_for_check -> service_role only (cron)
-- Verification (status = 'verified') is still only ever written by server code with
-- the secret key after a DNS check; nothing here can mark a domain verified.
-- =============================================================================

-- Overview numbers for /admin (one round trip) --------------------------------
create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v jsonb;
begin
  if not app.has_platform_permission('platform.tenants.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'status_counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from public.tenants group by status) s), '{}'::jsonb),
    'new_7d', (select count(*) from public.tenants where created_at >= now() - interval '7 days'),
    'new_30d', (select count(*) from public.tenants where created_at >= now() - interval '30 days'),
    'month_gmv', coalesce((select sum(value) from public.tenant_usage where metric = 'gmv' and period_start = v_month), 0),
    'month_orders', coalesce((select sum(value) from public.tenant_usage where metric = 'orders' and period_start = v_month), 0),
    'trials_ending_7d', (select count(*) from public.tenants where status = 'trial' and trial_ends_at between now() and now() + interval '7 days'),
    'custom_domains_pending', (select count(*) from public.domains where type = 'custom' and status in ('pending', 'failed'))
  ) into v;
  return v;
end;
$$;

-- Storage estimate from media_assets (bytes + file count), one tenant or all --
create or replace function public.platform_storage_usage(p_tenant uuid default null, p_limit int default 20)
returns table (tenant_id uuid, bytes bigint, files bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_platform_permission('platform.usage.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.tenant_id, coalesce(sum(m.bytes), 0)::bigint, count(*)::bigint
    from public.media_assets m
    where p_tenant is null or m.tenant_id = p_tenant
    group by m.tenant_id
    order by 2 desc
    limit greatest(1, least(coalesce(p_limit, 20), 200));
end;
$$;

-- Per-tenant counts that RLS hides from platform staff (catalog/orders are tenant data)
create or replace function public.platform_tenant_counts(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_platform_permission('platform.usage.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'products', (select count(*) from public.products where tenant_id = p_tenant),
    'orders', (select count(*) from public.orders where tenant_id = p_tenant),
    'customers', (select count(*) from public.customers where tenant_id = p_tenant),
    'gmv', coalesce((select sum(grand_total) from public.orders where tenant_id = p_tenant and payment_status in ('paid', 'partially_refunded', 'cod_pending') and status <> 'cancelled'), 0)
  );
end;
$$;

-- Emails live in auth.users; staff need them to identify owners/members -------
create or replace function public.platform_user_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select u.id, u.email::text from auth.users u where u.id = any(p_user_ids[1:500]);
end;
$$;

create or replace function public.platform_find_user_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v uuid;
begin
  if not (app.has_platform_permission('platform.users.manage') or app.has_platform_permission('platform.tenants.manage')
          or app.has_platform_permission('platform.audit.read')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  return v;
end;
$$;

-- Platform-side onboarding: create a tenant on behalf of an existing user --------
-- Same shape as public.create_tenant(), but the OWNER is p_owner (not the caller),
-- the plan can be chosen, the 5-stores-per-owner self-serve limit does not apply,
-- and the audit row is written as actor_type 'platform'. Atomic.
create or replace function public.platform_create_tenant(
  p_owner uuid, p_name text, p_slug text, p_root_domain text, p_plan uuid default null, p_status text default 'trial'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_plan uuid := p_plan;
  v_trial int;
  v_slug text := lower(trim(p_slug));
begin
  if not app.has_platform_permission('platform.tenants.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_root_domain !~ '^[a-z0-9.-]+$' then
    raise exception 'invalid root domain' using errcode = '22023';
  end if;
  if p_status not in ('trial', 'active') then
    raise exception 'initial status must be trial or active' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'user not found' using errcode = 'P0002', hint = 'USER_NOT_FOUND';
  end if;
  if v_plan is null then
    select id, trial_days into v_plan, v_trial from public.plans where active order by sort_order, price_monthly limit 1;
  else
    select trial_days into v_trial from public.plans where id = v_plan;
    if not found then raise exception 'plan not found' using errcode = 'P0002', hint = 'PLAN_NOT_FOUND'; end if;
  end if;

  insert into public.tenants (name, slug, status, plan_id, trial_ends_at, created_by)
  values (trim(p_name), v_slug, p_status, v_plan,
          case when p_status = 'trial' then now() + make_interval(days => coalesce(v_trial, 14)) end, (select auth.uid()))
  returning id into v_tenant;

  insert into public.stores (tenant_id, name) values (v_tenant, trim(p_name));
  insert into public.domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary)
  values (v_tenant, v_slug || '.' || p_root_domain, 'platform_subdomain', 'verified', now(), 'not_applicable', true);
  insert into public.tenant_memberships (tenant_id, user_id, role, invited_by) values (v_tenant, p_owner, 'owner', (select auth.uid()));
  insert into public.inventory_locations (tenant_id, name, is_default) values (v_tenant, 'Main warehouse', true);

  perform app.audit(v_tenant, 'tenant.created', 'tenant', v_tenant::text,
    jsonb_build_object('slug', v_slug, 'owner', p_owner, 'plan', v_plan, 'status', p_status, 'via', 'platform'), 'platform');
  return v_tenant;
end;
$$;

-- Never leave the platform without an active super_admin -----------------------
create or replace function app.guard_last_super_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'super_admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.status <> 'active') then
    if not exists (
      select 1 from public.platform_memberships
      where role = 'super_admin' and status = 'active' and user_id <> old.user_id
    ) then
      raise exception 'the last active super_admin cannot be removed, disabled or demoted' using errcode = '42501', hint = 'LAST_SUPER_ADMIN';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger platform_memberships_keep_super_admin
before update or delete on public.platform_memberships
for each row execute function app.guard_last_super_admin();

-- Domains: primary switch + removal (tenant domains.manage) ----------------------
-- One primary per tenant is enforced by the partial unique index domains_one_primary_key;
-- this swaps it atomically. Only VERIFIED domains can become primary.
create or replace function public.set_primary_domain(p_domain uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid; v_status text;
begin
  select tenant_id, status into v_tenant, v_status from public.domains where id = p_domain for update;
  if not found or not app.has_tenant_permission(v_tenant, 'domains.manage') then
    raise exception 'domain not found' using errcode = 'P0002';
  end if;
  if v_status <> 'verified' then
    raise exception 'only verified domains can be primary' using errcode = '22023', hint = 'DOMAIN_NOT_VERIFIED';
  end if;
  update public.domains set is_primary = false where tenant_id = v_tenant and is_primary and id <> p_domain;
  update public.domains set is_primary = true where id = p_domain;
  return v_tenant;
end;
$$;

-- Soft-removes a custom domain (row kept for history; hostname becomes claimable again).
-- If it was primary, the platform subdomain becomes primary again. Returns the
-- Cloudflare custom hostname id (provider_ref) so the caller can delete it at the edge.
create or replace function public.remove_custom_domain(p_domain uuid)
returns table (tenant_id uuid, hostname text, provider_ref text)
language plpgsql
security definer
set search_path = ''
as $$
declare d public.domains%rowtype;
begin
  select * into d from public.domains where id = p_domain for update;
  if not found or not app.has_tenant_permission(d.tenant_id, 'domains.manage') or d.status = 'removed' then
    raise exception 'domain not found' using errcode = 'P0002';
  end if;
  if d.type <> 'custom' then
    raise exception 'the platform subdomain cannot be removed' using errcode = '22023', hint = 'PLATFORM_SUBDOMAIN';
  end if;
  update public.domains set status = 'removed', is_primary = false, ssl_status = 'not_applicable' where id = d.id;
  if d.is_primary then
    update public.domains set is_primary = true
    where id = (select x.id from public.domains x where x.tenant_id = d.tenant_id and x.type = 'platform_subdomain' and x.status = 'verified' order by x.created_at limit 1);
  end if;
  return query select d.tenant_id, d.hostname, d.provider_ref;
end;
$$;

-- Entitlements: plan features/limits + flag defaults + tenant overrides, raw.
-- Resolution (override > plan feature > flag default) happens in TS
-- (src/features/platform/flags.ts) so UI and enforcement share one tested function.
-- Needed because sellers cannot read an INACTIVE (retired) plan through RLS.
create or replace function public.tenant_entitlements(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_tenant_member(p_tenant) or app.has_platform_permission('platform.tenants.read')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'plan', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'features', p.features, 'limits', p.limits)
             from public.tenants t join public.plans p on p.id = t.plan_id where t.id = p_tenant),
    'defaults', coalesce((select jsonb_object_agg(key, default_enabled) from public.feature_flags), '{}'::jsonb),
    'overrides', coalesce((select jsonb_object_agg(feature_key, enabled) from public.tenant_feature_flags where tenant_id = p_tenant), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.tenant_entitlements(uuid) from public, anon;
grant execute on function public.tenant_entitlements(uuid) to authenticated;

revoke all on function public.platform_overview() from public, anon;
revoke all on function public.platform_storage_usage(uuid, int) from public, anon;
revoke all on function public.platform_tenant_counts(uuid) from public, anon;
revoke all on function public.platform_user_emails(uuid[]) from public, anon;
revoke all on function public.platform_find_user_by_email(text) from public, anon;
revoke all on function public.platform_create_tenant(uuid, text, text, text, uuid, text) from public, anon;
revoke all on function public.set_primary_domain(uuid) from public, anon;
revoke all on function public.remove_custom_domain(uuid) from public, anon;
grant execute on function public.platform_overview() to authenticated, service_role;
grant execute on function public.platform_storage_usage(uuid, int) to authenticated, service_role;
grant execute on function public.platform_tenant_counts(uuid) to authenticated, service_role;
grant execute on function public.platform_user_emails(uuid[]) to authenticated, service_role;
grant execute on function public.platform_find_user_by_email(text) to authenticated, service_role;
grant execute on function public.platform_create_tenant(uuid, text, text, text, uuid, text) to authenticated;
grant execute on function public.set_primary_domain(uuid) to authenticated;
grant execute on function public.remove_custom_domain(uuid) to authenticated;
revoke all on function app.guard_last_super_admin() from public;

create index if not exists domains_pending_check_idx on public.domains (last_checked_at nulls first)
  where type = 'custom' and status in ('pending', 'failed', 'verified');
