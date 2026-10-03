-- Paste into the Supabase SQL editor (after apply-2200.sql). Additive only; one transaction.
begin;
-- WhatsApp order notifications (Cloud API, approved templates only).
-- 1. customer_whatsapp_optins: per-store consent ledger keyed by E.164 phone. Written server-side
--    only (checkout records consent with the secret-key client after host->tenant resolution;
--    an inbound "STOP" from a verified webhook revokes it). Staff with customers.read can see it.
-- 2. whatsapp_notification_settings: per-store, per-event toggle + approved template mapping.
--    Staff with settings.write manage it through RLS.
-- 3. notification_jobs: outbound queue with retries/backoff and delivery status. Written by the
--    server (secret-key client: dispatcher, cron, verified status webhook); settings.write reads.

create table public.customer_whatsapp_optins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  customer_id uuid,
  opted_in boolean not null default true,
  source text not null check (source in ('checkout', 'account', 'inbound_stop', 'inbound_start')),
  order_id uuid,
  consent_text text check (char_length(consent_text) <= 500),
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id)
);

create table public.whatsapp_notification_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event text not null check (event in ('order_placed', 'order_shipped', 'out_for_delivery', 'order_delivered', 'abandoned_cart')),
  enabled boolean not null default false,
  template_name text check (char_length(template_name) <= 512 and template_name ~ '^[a-z0-9_]+$'),
  language_code text check (language_code ~ '^[A-Za-z]{2,3}(_[A-Za-z0-9]{2,8})?$'),
  -- Snapshot of the approved template's body (for previews / inbox copy) and its parameter names.
  body_text text check (char_length(body_text) <= 1100),
  param_format text not null default 'positional' check (param_format in ('positional', 'named')),
  param_names text[] not null default '{}' check (cardinality(param_names) <= 20),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, event),
  check (not enabled or (template_name is not null and language_code is not null))
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  event text not null check (event in ('order_placed', 'order_shipped', 'out_for_delivery', 'order_delivered', 'abandoned_cart', 'test')),
  idempotency_key text not null check (char_length(idempotency_key) <= 300),
  order_id uuid,
  cart_id uuid,
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  template_name text not null check (char_length(template_name) <= 512),
  language_code text not null check (char_length(language_code) <= 15),
  params jsonb not null default '[]'::jsonb,
  preview text check (char_length(preview) <= 1100),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index notification_jobs_due_idx on public.notification_jobs (next_attempt_at) where status = 'queued';
create index notification_jobs_tenant_idx on public.notification_jobs (tenant_id, created_at desc);
create index notification_jobs_provider_idx on public.notification_jobs (provider_message_id) where provider_message_id is not null;

create trigger trg_customer_whatsapp_optins_updated_at before update on public.customer_whatsapp_optins for each row execute function app.set_updated_at();
create trigger trg_whatsapp_notification_settings_updated_at before update on public.whatsapp_notification_settings for each row execute function app.set_updated_at();
create trigger trg_notification_jobs_updated_at before update on public.notification_jobs for each row execute function app.set_updated_at();

alter table public.customer_whatsapp_optins enable row level security;
alter table public.whatsapp_notification_settings enable row level security;
alter table public.notification_jobs enable row level security;

create policy customer_whatsapp_optins_read on public.customer_whatsapp_optins for select to authenticated using (app.has_tenant_permission(tenant_id, 'customers.read'));
create policy whatsapp_notification_settings_read on public.whatsapp_notification_settings for select to authenticated using (app.has_tenant_permission(tenant_id, 'settings.write'));
create policy whatsapp_notification_settings_write on public.whatsapp_notification_settings for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write')) with check (app.has_tenant_permission(tenant_id, 'settings.write'));
create policy notification_jobs_read on public.notification_jobs for select to authenticated using (app.has_tenant_permission(tenant_id, 'settings.write'));

grant select on public.customer_whatsapp_optins, public.notification_jobs to authenticated;
grant select, insert, update, delete on public.whatsapp_notification_settings to authenticated;
grant all on public.customer_whatsapp_optins, public.whatsapp_notification_settings, public.notification_jobs to service_role;

-- Claims due jobs for one worker run. SKIP LOCKED keeps overlapping cron runs from sending the
-- same job twice. A job stuck in 'sending' (crashed run) is failed rather than retried: the
-- message may already have gone out and WhatsApp has no idempotency key.
create or replace function public.svc_claim_notification_jobs(p_limit int default 25)
returns setof public.notification_jobs
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_jobs
     set status = 'failed', locked_at = null, last_error = 'Send outcome unknown (worker stopped mid-send); not retried to avoid a duplicate message.'
   where status = 'sending' and locked_at < now() - interval '10 minutes';
  return query
  update public.notification_jobs j
     set status = 'sending', locked_at = now(), attempts = j.attempts + 1
   where j.id in (
     select id from public.notification_jobs
      where status = 'queued' and next_attempt_at <= now()
      order by next_attempt_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning j.*;
end $$;

-- Claims one specific job (immediate send right after enqueue).
create or replace function public.svc_claim_notification_job(p_job uuid)
returns setof public.notification_jobs
language sql security definer set search_path = '' as $$
  update public.notification_jobs
     set status = 'sending', locked_at = now(), attempts = attempts + 1
   where id = p_job and status = 'queued' and next_attempt_at <= now()
  returning *;
$$;

revoke all on function public.svc_claim_notification_jobs(int), public.svc_claim_notification_job(uuid) from public, anon, authenticated;
grant execute on function public.svc_claim_notification_jobs(int), public.svc_claim_notification_job(uuid) to service_role;
commit;
