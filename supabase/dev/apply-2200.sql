-- Paste into the Supabase SQL editor (after apply-2100.sql). Additive only; one transaction.
begin;
-- Transactional email (Resend): delivery log + per-store customer-email preferences.
-- email_log rows are written server-side only (secret-key client, ADR-006) by src/lib/email;
-- staff with settings.write can read their own tenant's rows. Recipients are stored as a
-- SHA-256 hash plus a masked address (r***@gmail.com) — never the full address, never bodies.

create table public.email_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  recipient_hash text not null check (char_length(recipient_hash) <= 64),
  recipient_masked text check (char_length(recipient_masked) <= 120),
  idempotency_key text check (char_length(idempotency_key) <= 256),
  provider text not null default 'resend' check (provider in ('resend', 'log')),
  provider_message_id text check (char_length(provider_message_id) <= 120),
  status text not null check (status in ('sent', 'failed', 'skipped', 'logged')),
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create index email_log_tenant_idx on public.email_log (tenant_id, created_at desc);
-- At most one SENT row per idempotency key: the sender checks it before calling the provider.
create unique index email_log_sent_key on public.email_log (idempotency_key) where status = 'sent' and idempotency_key is not null;

-- Which emails a store sends. Absent row / absent key = code default (see
-- src/features/notifications/email/preferences.ts).
create table public.email_preferences (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.email_log enable row level security;
alter table public.email_preferences enable row level security;

create policy email_log_staff_read on public.email_log for select to authenticated
  using (tenant_id is not null and app.has_tenant_permission(tenant_id, 'settings.write'));
create policy email_preferences_staff_read on public.email_preferences for select to authenticated
  using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy email_preferences_staff_write on public.email_preferences for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write')) with check (app.has_tenant_permission(tenant_id, 'settings.write'));

grant select on public.email_log to authenticated;
grant select, insert, update on public.email_preferences to authenticated;
grant all on public.email_log, public.email_preferences to service_role;
commit;
