-- GENERATED: all migrations + dev seed, for pasting into the Supabase SQL Editor on a FRESH project. Dev data only.

-- ===== supabase/migrations/20260924000100_foundation.sql =====
-- =============================================================================
-- 0100 FOUNDATION: extensions, private `app` schema, shared trigger helpers
-- =============================================================================
-- Conventions (see docs/DECISIONS.md):
--   * uuid PKs, timestamptz, numeric(12,2) money, text + CHECK for statuses
--   * every tenant-owned table: tenant_id NOT NULL + UNIQUE (tenant_id, id);
--     children reference (tenant_id, parent_id) so cross-tenant links are impossible
--   * RLS enabled on every table, default deny; policies call app.* helpers
--   * helper functions: SECURITY DEFINER, search_path = '' , fully qualified names
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema: NOT exposed through PostgREST (only `public` is), so nothing
-- here is callable as an RPC from the browser.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- updated_at maintenance -------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Prevent tenant_id from ever being changed on an existing row.
create or replace function app.freeze_tenant_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Attach both triggers to a table in one call (used by later migrations).
create or replace function app.add_standard_triggers(p_table regclass, p_has_tenant boolean default true, p_has_updated_at boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
  n text := replace(replace(p_table::text, 'public.', ''), '"', '');
begin
  if p_has_updated_at then
    execute format('create trigger %I before update on %s for each row execute function app.set_updated_at()', 'trg_' || n || '_updated_at', t);
  end if;
  if p_has_tenant then
    execute format('create trigger %I before update of tenant_id on %s for each row execute function app.freeze_tenant_id()', 'trg_' || n || '_freeze_tenant', t);
  end if;
end;
$$;

-- ===== supabase/migrations/20260924000200_platform_tenancy.sql =====
-- =============================================================================
-- 0200 PLATFORM & TENANCY: profiles, plans, tenants, stores, domains, memberships,
--      roles/permissions, platform admins, feature flags, usage, audit, support
-- =============================================================================

-- Profiles (1:1 with auth.users) ---------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  avatar_url text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select app.add_standard_triggers('public.profiles', false);

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

-- Plans -------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text,
  price_monthly numeric(12,2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(12,2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'INR',
  -- e.g. {"products": 500, "staff": 3, "storage_mb": 2048, "custom_domains": 1}
  limits jsonb not null default '{}'::jsonb,
  -- e.g. {"custom_domain": true, "blog": true}
  features jsonb not null default '{}'::jsonb,
  trial_days int not null default 14 check (trial_days between 0 and 90),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select app.add_standard_triggers('public.plans', false);

-- Tenants -----------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  -- DNS label rules; reserved labels mirrored from src/lib/tenant/host.ts
  slug text not null unique check (
    slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    and slug !~ '--'
    and slug <> all (array[
      'www','app','admin','api','dashboard','seller','platform','auth','login','signup','account','accounts',
      'billing','help','support','docs','status','blog','mail','email','smtp','cdn','static','assets','media',
      'images','img','files','storage','edge','internal','staging','dev','test','preview','demo','root','system',
      'security','store','stores','shop','checkout','pay','payments','webhooks','ns1','ns2'])
  ),
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  status_reason text,
  plan_id uuid references public.plans (id) on delete restrict,
  trial_ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select app.add_standard_triggers('public.tenants', false);
create index tenants_status_idx on public.tenants (status);

-- Store profile: 1:1 with tenant (ADR-012) ---------------------------------------
create table public.stores (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  tagline text check (char_length(tagline) <= 200),
  description text check (char_length(description) <= 2000),
  logo_path text,
  favicon_path text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  whatsapp text,
  address jsonb not null default '{}'::jsonb,
  social jsonb not null default '{}'::jsonb,
  currency text not null default 'INR' check (currency = 'INR'),
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  legal_name text,
  -- {"title": "...", "description": "...", "og_image_path": "..."}
  seo jsonb not null default '{}'::jsonb,
  -- {"prices_include_tax": true, "rules": [{"max_unit_price": 2500, "rate": 5}, {"rate": 18}]}
  tax_settings jsonb not null default '{"prices_include_tax": true, "rules": [{"max_unit_price": 2500, "rate": 5}, {"rate": 18}]}'::jsonb,
  -- {"enabled": true, "fee": 0, "min_order": 0, "max_order": 10000}
  cod_settings jsonb not null default '{"enabled": true, "fee": 0, "min_order": 0, "max_order": 10000}'::jsonb,
  -- {"analytics": {"ga4": "G-XXX", "meta_pixel": "..."}, "announcement": ...}
  integrations jsonb not null default '{}'::jsonb,
  order_prefix text not null default '#' check (char_length(order_prefix) <= 8),
  low_stock_default int not null default 5 check (low_stock_default >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select app.add_standard_triggers('public.stores', true);

-- Domains (ADR-005): platform subdomains AND custom domains ------------------------
create table public.domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  hostname text not null check (hostname = lower(hostname) and hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' and char_length(hostname) <= 253),
  type text not null check (type in ('platform_subdomain', 'custom')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'removed')),
  verification_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  verified_at timestamptz,
  ssl_status text not null default 'pending' check (ssl_status in ('pending', 'active', 'failed', 'not_applicable')),
  is_primary boolean not null default false,
  provider_ref text, -- e.g. Cloudflare custom hostname id
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
select app.add_standard_triggers('public.domains');
create unique index domains_hostname_active_key on public.domains (hostname) where status <> 'removed';
create unique index domains_one_primary_key on public.domains (tenant_id) where is_primary and status <> 'removed';
create index domains_tenant_idx on public.domains (tenant_id);

-- Roles & permissions (ADR-009): seeded from src/lib/permissions/matrix.ts --------
create table public.role_permissions (
  role text not null check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

create table public.platform_role_permissions (
  role text not null check (role in ('super_admin', 'support', 'finance')),
  permission text not null check (permission ~ '^platform\.[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);
select app.add_standard_triggers('public.tenant_memberships');
create index tenant_memberships_user_idx on public.tenant_memberships (user_id) where status = 'active';

create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'manager', 'staff', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index tenant_invitations_open_key on public.tenant_invitations (tenant_id, email) where accepted_at is null and revoked_at is null;

create table public.platform_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('super_admin', 'support', 'finance')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select app.add_standard_triggers('public.platform_memberships', false);

-- Explicit, expiring, audited support access (read-only "viewer" permissions) ------
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= started_at + interval '4 hours'),
  ended_at timestamptz,
  unique (tenant_id, id)
);
create index support_sessions_active_idx on public.support_sessions (platform_user_id, tenant_id) where ended_at is null;

-- Feature flags ------------------------------------------------------------------
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  description text,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tenant_feature_flags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  feature_key text not null references public.feature_flags (key) on delete cascade,
  enabled boolean not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);

-- Usage metering -----------------------------------------------------------------
create table public.tenant_usage (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  metric text not null check (metric in ('orders', 'gmv', 'products', 'storage_bytes', 'staff', 'api_requests')),
  period_start date not null,
  value numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period_start)
);

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Per-tenant counters (order numbers, invoice numbers) — ADR-015 -------------------
create table public.tenant_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key in ('order', 'invoice', 'return')),
  value bigint not null default 0,
  primary key (tenant_id, key)
);

-- Audit log (append-only) --------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'platform', 'support', 'system', 'webhook')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

create or replace function app.block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
for each row execute function app.block_mutation();

-- =============================================================================
-- ACCESS HELPERS (used by every RLS policy)
-- =============================================================================

create or replace function app.uid()
returns uuid
language sql
stable
set search_path = ''
as $$ select auth.uid() $$;

create or replace function app.has_platform_permission(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_memberships pm
    join public.platform_role_permissions prp on prp.role = pm.role
    where pm.user_id = (select auth.uid()) and pm.status = 'active' and prp.permission = p_perm
  );
$$;

create or replace function app.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_memberships where user_id = (select auth.uid()) and status = 'active');
$$;

create or replace function app.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant and user_id = (select auth.uid()) and status = 'active'
  );
$$;

-- Tenant permission: an active membership whose role grants p_perm, OR an active
-- (unexpired, not ended) support session, which grants the read-only viewer set.
create or replace function app.has_tenant_permission(p_tenant uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission = p_perm
  )
  or exists (
    select 1
    from public.support_sessions s
    join public.role_permissions rp on rp.role = 'viewer' and rp.permission = p_perm
    where s.tenant_id = p_tenant
      and s.platform_user_id = (select auth.uid())
      and s.ended_at is null
      and s.expires_at > now()
  );
$$;

-- Storefront visibility of a tenant (trial/active only).
create or replace function app.tenant_is_open(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tenants where id = p_tenant and status in ('trial', 'active'));
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.stores enable row level security;
alter table public.domains enable row level security;
alter table public.role_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.platform_memberships enable row level security;
alter table public.support_sessions enable row level security;
alter table public.feature_flags enable row level security;
alter table public.tenant_feature_flags enable row level security;
alter table public.tenant_usage enable row level security;
alter table public.platform_settings enable row level security;
alter table public.tenant_counters enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: self + co-members of a tenant (names on staff lists) + platform
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or app.is_platform_member()
  or exists (
    select 1 from public.tenant_memberships mine
    join public.tenant_memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and status = 'active');

-- plans: active plans are public (pricing page); platform manages
create policy plans_public_select on public.plans for select to anon, authenticated using (active or app.has_platform_permission('platform.plans.manage'));
create policy plans_platform_write on public.plans for all to authenticated
  using (app.has_platform_permission('platform.plans.manage')) with check (app.has_platform_permission('platform.plans.manage'));

-- tenants: members see their tenant; platform sees all. Creation goes through
-- public.create_tenant(); status changes through platform actions.
create policy tenants_member_select on public.tenants for select to authenticated using (
  app.is_tenant_member(id) or app.has_platform_permission('platform.tenants.read') or app.has_tenant_permission(id, 'store.read')
);
create policy tenants_owner_update on public.tenants for update to authenticated
  using (app.has_tenant_permission(id, 'settings.write'))
  with check (app.has_tenant_permission(id, 'settings.write'));
create policy tenants_platform_update on public.tenants for update to authenticated
  using (app.has_platform_permission('platform.tenants.manage'))
  with check (app.has_platform_permission('platform.tenants.manage'));

-- Sellers may rename their tenant but never change status/plan/slug themselves.
create or replace function app.guard_tenant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_user is the API role for direct PostgREST writes, and the function owner inside
  -- SECURITY DEFINER services, so trusted functions pass while direct edits are checked.
  if current_user in ('authenticated', 'anon') and not app.has_platform_permission('platform.tenants.manage') then
    if new.status is distinct from old.status or new.plan_id is distinct from old.plan_id
       or new.slug is distinct from old.slug or new.trial_ends_at is distinct from old.trial_ends_at
       or new.status_reason is distinct from old.status_reason then
      raise exception 'only platform administrators can change tenant status, plan or slug' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tenants_guard_update before update on public.tenants for each row execute function app.guard_tenant_update();

-- stores: public profile of open tenants is public; members read; settings.write edits
create policy stores_public_select on public.stores for select to anon, authenticated using (app.tenant_is_open(tenant_id));
create policy stores_member_select on public.stores for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read') or app.has_platform_permission('platform.tenants.read'));
create policy stores_update on public.stores for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write'))
  with check (app.has_tenant_permission(tenant_id, 'settings.write'));

-- domains: members read; domains.manage can add/remove custom domains (verification
-- status is only ever set by the server with the secret key after a DNS check).
create policy domains_select on public.domains for select to authenticated using (
  app.has_tenant_permission(tenant_id, 'store.read') or app.has_platform_permission('platform.tenants.read')
);
create policy domains_insert on public.domains for insert to authenticated with check (
  app.has_tenant_permission(tenant_id, 'domains.manage') and type = 'custom' and status = 'pending' and not is_primary and verified_at is null
);
create policy domains_delete on public.domains for delete to authenticated using (
  app.has_tenant_permission(tenant_id, 'domains.manage') and type = 'custom'
);

-- role tables: readable by any signed-in user (they are not secret); no writes
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy platform_role_permissions_select on public.platform_role_permissions for select to authenticated using (app.is_platform_member());

-- memberships
create policy memberships_select on public.tenant_memberships for select to authenticated using (
  user_id = (select auth.uid())
  or app.has_tenant_permission(tenant_id, 'store.read')
  or app.has_platform_permission('platform.tenants.read')
);
create policy memberships_manage_update on public.tenant_memberships for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'members.manage') and role <> 'owner')
  with check (app.has_tenant_permission(tenant_id, 'members.manage') and role <> 'owner');
create policy memberships_manage_delete on public.tenant_memberships for delete to authenticated
  using (app.has_tenant_permission(tenant_id, 'members.manage') and role <> 'owner');

-- invitations
create policy invitations_select on public.tenant_invitations for select to authenticated using (app.has_tenant_permission(tenant_id, 'members.manage'));
create policy invitations_insert on public.tenant_invitations for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'members.manage') and invited_by = (select auth.uid()));
create policy invitations_update on public.tenant_invitations for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'members.manage'))
  with check (app.has_tenant_permission(tenant_id, 'members.manage'));

-- platform tables
create policy platform_memberships_select on public.platform_memberships for select to authenticated using (
  user_id = (select auth.uid()) or app.has_platform_permission('platform.users.manage')
);
create policy platform_memberships_manage on public.platform_memberships for all to authenticated
  using (app.has_platform_permission('platform.users.manage'))
  with check (app.has_platform_permission('platform.users.manage'));

create policy support_sessions_select on public.support_sessions for select to authenticated using (
  platform_user_id = (select auth.uid()) or app.has_platform_permission('platform.audit.read') or app.has_tenant_permission(tenant_id, 'members.manage')
);
-- start/end via public.start_support_session()/end_support_session() only

create policy feature_flags_select on public.feature_flags for select to authenticated using (true);
create policy feature_flags_manage on public.feature_flags for all to authenticated
  using (app.has_platform_permission('platform.flags.manage')) with check (app.has_platform_permission('platform.flags.manage'));
create policy tenant_flags_select on public.tenant_feature_flags for select to authenticated using (
  app.is_tenant_member(tenant_id) or app.has_platform_permission('platform.tenants.read')
);
create policy tenant_flags_manage on public.tenant_feature_flags for all to authenticated
  using (app.has_platform_permission('platform.flags.manage')) with check (app.has_platform_permission('platform.flags.manage'));

create policy tenant_usage_select on public.tenant_usage for select to authenticated using (
  app.has_tenant_permission(tenant_id, 'analytics.read') or app.has_platform_permission('platform.usage.read')
);

create policy platform_settings_select on public.platform_settings for select to authenticated using (app.is_platform_member());
create policy platform_settings_manage on public.platform_settings for all to authenticated
  using (app.has_platform_permission('platform.settings.manage')) with check (app.has_platform_permission('platform.settings.manage'));

-- counters: no direct access (functions only)

create policy audit_logs_select on public.audit_logs for select to authenticated using (
  (tenant_id is not null and app.has_tenant_permission(tenant_id, 'members.manage'))
  or app.has_platform_permission('platform.audit.read')
);
-- inserts only through app.audit() / server with secret key

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

create or replace function app.audit(
  p_tenant uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb, p_actor_type text default 'user'
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), p_actor_type, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function app.next_counter(p_tenant uuid, p_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v bigint;
begin
  insert into public.tenant_counters as c (tenant_id, key, value) values (p_tenant, p_key, 1)
  on conflict (tenant_id, key) do update set value = c.value + 1
  returning c.value into v;
  return v;
end;
$$;

-- Tenant onboarding: creates tenant + store + platform subdomain + owner membership
-- + default inventory location atomically. Caller becomes owner.
create or replace function public.create_tenant(p_name text, p_slug text, p_root_domain text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tenant uuid;
  v_plan uuid;
  v_trial int;
  v_owned int;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_root_domain !~ '^[a-z0-9.-]+$' then
    raise exception 'invalid root domain' using errcode = '22023';
  end if;
  select count(*) into v_owned from public.tenant_memberships where user_id = v_user and role = 'owner';
  if v_owned >= 5 then
    raise exception 'store limit reached for this account' using errcode = '54000';
  end if;

  select id, trial_days into v_plan, v_trial from public.plans where active order by sort_order, price_monthly limit 1;

  insert into public.tenants (name, slug, status, plan_id, trial_ends_at, created_by)
  values (trim(p_name), lower(trim(p_slug)), 'trial', v_plan, now() + make_interval(days => coalesce(v_trial, 14)), v_user)
  returning id into v_tenant;

  insert into public.stores (tenant_id, name) values (v_tenant, trim(p_name));
  insert into public.domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary)
  values (v_tenant, lower(trim(p_slug)) || '.' || p_root_domain, 'platform_subdomain', 'verified', now(), 'not_applicable', true);
  insert into public.tenant_memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'owner');
  insert into public.inventory_locations (tenant_id, name, is_default) values (v_tenant, 'Main warehouse', true);

  perform app.audit(v_tenant, 'tenant.created', 'tenant', v_tenant::text, jsonb_build_object('slug', lower(trim(p_slug))));
  return v_tenant;
end;
$$;

-- Invitation acceptance: token is hashed server-side (sha256 hex) before calling.
create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  inv public.tenant_invitations%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_user;

  select * into inv from public.tenant_invitations
  where token_hash = p_token_hash and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invitation is invalid or expired' using errcode = 'P0002'; end if;
  if inv.email <> v_email then raise exception 'invitation was sent to a different email address' using errcode = '42501'; end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, invited_by)
  values (inv.tenant_id, v_user, inv.role, inv.invited_by)
  on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
  update public.tenant_invitations set accepted_at = now() where id = inv.id;
  perform app.audit(inv.tenant_id, 'member.joined', 'membership', v_user::text, jsonb_build_object('role', inv.role));
  return inv.tenant_id;
end;
$$;

-- Support access (explicit + audited + expiring) ------------------------------
create or replace function public.start_support_session(p_tenant uuid, p_reason text, p_minutes int default 60)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not app.has_platform_permission('platform.support.impersonate') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_minutes not between 5 and 240 then raise exception 'duration must be 5-240 minutes' using errcode = '22023'; end if;
  update public.support_sessions set ended_at = now()
  where platform_user_id = (select auth.uid()) and tenant_id = p_tenant and ended_at is null;
  insert into public.support_sessions (platform_user_id, tenant_id, reason, expires_at)
  values ((select auth.uid()), p_tenant, p_reason, now() + make_interval(mins => p_minutes))
  returning id into v_id;
  perform app.audit(p_tenant, 'support.session_started', 'support_session', v_id::text, jsonb_build_object('reason', p_reason, 'minutes', p_minutes), 'support');
  return v_id;
end;
$$;

create or replace function public.end_support_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid;
begin
  update public.support_sessions set ended_at = now()
  where id = p_session and platform_user_id = (select auth.uid()) and ended_at is null
  returning tenant_id into v_tenant;
  if v_tenant is not null then
    perform app.audit(v_tenant, 'support.session_ended', 'support_session', p_session::text, '{}'::jsonb, 'support');
  end if;
end;
$$;

-- Platform: change tenant status (audited)
create or replace function public.set_tenant_status(p_tenant uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text;
begin
  if not app.has_platform_permission('platform.tenants.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select status into v_old from public.tenants where id = p_tenant for update;
  if not found then raise exception 'tenant not found' using errcode = 'P0002'; end if;
  update public.tenants set status = p_status, status_reason = p_reason where id = p_tenant;
  perform app.audit(p_tenant, 'tenant.status_changed', 'tenant', p_tenant::text,
    jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason), 'platform');
end;
$$;

revoke all on function public.create_tenant(text, text, text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.start_support_session(uuid, text, int) from public, anon;
revoke all on function public.end_support_session(uuid) from public, anon;
revoke all on function public.set_tenant_status(uuid, text, text) from public, anon;
grant execute on function public.create_tenant(text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.start_support_session(uuid, text, int) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;
grant execute on function public.set_tenant_status(uuid, text, text) to authenticated;

-- ===== supabase/migrations/20260924000300_catalog_inventory.sql =====
-- =============================================================================
-- 0300 CATALOG & INVENTORY
-- =============================================================================
-- Variants use option1..3 columns (ADR-022): fashion needs at most Size / Colour /
-- Fabric, and flat columns make storefront filtering a plain indexed predicate.
-- Stock lives ONLY in inventory_levels (ADR-014).
-- =============================================================================

create table public.size_charts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default 'in' check (unit in ('in', 'cm')),
  -- {"columns": ["Size","Bust","Waist"], "rows": [["S","34","28"], ...], "note": "..."}
  chart jsonb not null default '{"columns": [], "rows": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
select app.add_standard_triggers('public.size_charts');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 5000),
  image_path text,
  seo jsonb not null default '{}'::jsonb,
  position int not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  foreign key (tenant_id, parent_id) references public.categories (tenant_id, id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);
select app.add_standard_triggers('public.categories');
create index categories_parent_idx on public.categories (tenant_id, parent_id, position);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid,
  size_chart_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  description text check (char_length(description) <= 20000),
  short_description text check (char_length(short_description) <= 500),
  product_type text not null default 'other' check (product_type in (
    'kurta','kurta_set','suit','co_ord_set','dress','saree','lehenga','top','shirt','bottom','dupatta','nightwear','accessory','other')),
  brand text check (char_length(brand) <= 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  featured boolean not null default false,
  tags text[] not null default '{}' check (cardinality(tags) <= 50),
  -- {"fabric": "Cotton", "occasion": ["Festive"], "style": "A-line", "length": "Calf", "work": "Block print", "pattern": "Floral"}
  attributes jsonb not null default '{}'::jsonb,
  care_instructions text check (char_length(care_instructions) <= 2000),
  shipping_info text check (char_length(shipping_info) <= 2000),
  return_info text check (char_length(return_info) <= 2000),
  hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  -- denormalised for listing/sort/filter; maintained by triggers
  min_price numeric(12,2),
  max_price numeric(12,2),
  max_compare_at_price numeric(12,2),
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  sales_count int not null default 0,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(brand, '') || ' ' || replace(product_type, '_', ' ')), 'B')
    || setweight(to_tsvector('simple', coalesce(short_description, '') || ' ' || coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id) on delete set null (category_id),
  foreign key (tenant_id, size_chart_id) references public.size_charts (tenant_id, id) on delete set null (size_chart_id)
);
select app.add_standard_triggers('public.products');
create index products_listing_idx on public.products (tenant_id, status, published_at desc);
create index products_category_idx on public.products (tenant_id, category_id) where status = 'active';
create index products_type_idx on public.products (tenant_id, product_type) where status = 'active';
create index products_price_idx on public.products (tenant_id, min_price) where status = 'active';
create index products_search_idx on public.products using gin (search_vector);
create index products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index products_tags_idx on public.products using gin (tags);
create index products_attributes_idx on public.products using gin (attributes jsonb_path_ops);

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  position smallint not null check (position between 1 and 3),
  name text not null check (char_length(name) between 1 and 40),
  unique (tenant_id, id),
  unique (product_id, position),
  unique (product_id, name),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  option_id uuid not null,
  value text not null check (char_length(value) between 1 and 60),
  swatch text check (swatch is null or swatch ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  unique (tenant_id, id),
  unique (option_id, value),
  foreign key (tenant_id, option_id) references public.product_options (tenant_id, id) on delete cascade
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  sku text check (sku is null or char_length(sku) between 1 and 64),
  barcode text check (barcode is null or char_length(barcode) <= 64),
  title text not null default 'Default',
  option1 text,
  option2 text,
  option3 text,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  weight_grams int not null default 500 check (weight_grams between 0 and 100000),
  track_inventory boolean not null default true,
  allow_backorder boolean not null default false,
  low_stock_threshold int check (low_stock_threshold is null or low_stock_threshold >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique nulls not distinct (product_id, option1, option2, option3),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
select app.add_standard_triggers('public.product_variants');
create unique index product_variants_sku_key on public.product_variants (tenant_id, sku) where sku is not null;
create index product_variants_product_idx on public.product_variants (product_id, position);
create index product_variants_options_idx on public.product_variants (tenant_id, option1, option2) where status = 'active';

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  storage_path text not null check (storage_path ~ '^tenant/[0-9a-f-]{36}/'),
  alt_text text check (char_length(alt_text) <= 300),
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  width int,
  height int,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete set null (variant_id),
  -- a tenant can only reference files under its own storage prefix
  check (split_part(storage_path, '/', 2) = tenant_id::text)
);
create index product_media_product_idx on public.product_media (product_id, position);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 5000),
  image_path text,
  type text not null default 'manual' check (type in ('manual', 'automated')),
  -- automated: {"match": "all"|"any", "conditions": [{"field": "product_type"|"tag"|"price"|"category"|"attribute.fabric"..., "op": "eq"|"in"|"lte"|"gte"|"contains", "value": ...}]}
  rules jsonb not null default '{"match": "all", "conditions": []}'::jsonb,
  sort_order text not null default 'manual' check (sort_order in ('manual','newest','price_asc','price_desc','best_selling','title_asc')),
  seo jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active')),
  position int not null default 0,
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);
select app.add_standard_triggers('public.collections');

create table public.collection_products (
  tenant_id uuid not null,
  collection_id uuid not null,
  product_id uuid not null,
  position int not null default 0,
  primary key (collection_id, product_id),
  foreign key (tenant_id, collection_id) references public.collections (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index collection_products_product_idx on public.collection_products (product_id);
create index collection_products_order_idx on public.collection_products (collection_id, position);

-- Inventory ------------------------------------------------------------------------
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
select app.add_standard_triggers('public.inventory_locations');
create unique index inventory_locations_default_key on public.inventory_locations (tenant_id) where is_default;

create table public.inventory_levels (
  tenant_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  available int not null default 0,
  reserved int not null default 0 check (reserved >= 0),
  incoming int not null default 0 check (incoming >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, variant_id),
  foreign key (tenant_id, location_id) references public.inventory_locations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade
);
create index inventory_levels_variant_idx on public.inventory_levels (tenant_id, variant_id);
create trigger trg_inventory_levels_updated_at before update on public.inventory_levels for each row execute function app.set_updated_at();

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  delta int not null check (delta <> 0),
  available_after int not null,
  reason text not null check (reason in ('adjustment','received','sale','return','cancellation','reservation','release','correction','damage','initial')),
  reference_type text check (reference_type in ('order','return','reservation','manual','import')),
  reference_id uuid,
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, location_id) references public.inventory_locations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade
);
create index inventory_movements_variant_idx on public.inventory_movements (tenant_id, variant_id, created_at desc);
create trigger inventory_movements_append_only before update or delete on public.inventory_movements
for each row when (pg_trigger_depth() = 0) execute function app.block_mutation();

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  order_id uuid,
  quantity int not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, location_id) references public.inventory_locations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade
);
create index inventory_reservations_active_idx on public.inventory_reservations (expires_at) where status = 'active';
create index inventory_reservations_order_idx on public.inventory_reservations (order_id);

-- =============================================================================
-- DENORMALISATION TRIGGERS
-- =============================================================================
create or replace function app.refresh_product_prices(p_product uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products p set
    min_price = s.min_price, max_price = s.max_price, max_compare_at_price = s.max_cmp
  from (
    select min(price) as min_price, max(price) as max_price, max(compare_at_price) as max_cmp
    from public.product_variants where product_id = p_product and status = 'active'
  ) s
  where p.id = p_product;
$$;

create or replace function app.trg_variant_prices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.refresh_product_prices(old.product_id);
    return old;
  end if;
  perform app.refresh_product_prices(new.product_id);
  return new;
end;
$$;
create trigger variants_refresh_prices after insert or update of price, compare_at_price, status or delete
on public.product_variants for each row execute function app.trg_variant_prices();

-- New variant -> zero stock row at the default location.
create or replace function app.trg_variant_init_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_levels (tenant_id, location_id, variant_id, available)
  select new.tenant_id, l.id, new.id, 0 from public.inventory_locations l
  where l.tenant_id = new.tenant_id and l.is_default
  on conflict do nothing;
  return new;
end;
$$;
create trigger variants_init_stock after insert on public.product_variants for each row execute function app.trg_variant_init_stock();

-- Publishing sets published_at once.
create or replace function app.trg_product_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger products_publish before insert or update of status on public.products for each row execute function app.trg_product_publish();

-- =============================================================================
-- INVENTORY FUNCTIONS (concurrency-safe; ADR-014)
-- =============================================================================

-- Core mutation. Callers must have authorized already (internal use only).
create or replace function app.apply_stock_delta(
  p_tenant uuid, p_variant uuid, p_location uuid, p_delta int, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_note text default null, p_allow_negative boolean default false
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc uuid := p_location;
  v_after int;
begin
  if v_loc is null then
    select id into v_loc from public.inventory_locations where tenant_id = p_tenant and is_default;
  end if;
  insert into public.inventory_levels (tenant_id, location_id, variant_id, available)
  values (p_tenant, v_loc, p_variant, 0) on conflict do nothing;

  -- single-statement conditional update = row lock + no lost updates
  update public.inventory_levels
     set available = available + p_delta
   where location_id = v_loc and variant_id = p_variant and tenant_id = p_tenant
     and (p_allow_negative or p_delta > 0 or available + p_delta >= 0)
  returning available into v_after;

  if v_after is null then
    raise exception 'insufficient stock' using errcode = 'P0001', hint = 'INSUFFICIENT_STOCK';
  end if;

  insert into public.inventory_movements (tenant_id, location_id, variant_id, delta, available_after, reason, reference_type, reference_id, note, created_by)
  values (p_tenant, v_loc, p_variant, p_delta, v_after, p_reason, p_ref_type, p_ref_id, p_note, (select auth.uid()));
  return v_after;
end;
$$;

-- Seller-facing: adjust stock (+/-) with a reason. Checks inventory.write.
create or replace function public.adjust_inventory(p_variant uuid, p_delta int, p_reason text, p_note text default null, p_location uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid; v_after int;
begin
  select tenant_id into v_tenant from public.product_variants where id = p_variant;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'inventory.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason not in ('adjustment','received','correction','damage','return','initial') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  v_after := app.apply_stock_delta(v_tenant, p_variant, p_location, p_delta, p_reason, 'manual', null, p_note);
  return v_after;
end;
$$;

-- Seller-facing: set an absolute count (stock take). Records the difference.
create or replace function public.set_inventory(p_variant uuid, p_available int, p_note text default null, p_location uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid; v_loc uuid := p_location; v_current int;
begin
  select tenant_id into v_tenant from public.product_variants where id = p_variant;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'inventory.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_available < 0 or p_available > 1000000 then raise exception 'invalid quantity' using errcode = '22023'; end if;
  if v_loc is null then select id into v_loc from public.inventory_locations where tenant_id = v_tenant and is_default; end if;
  insert into public.inventory_levels (tenant_id, location_id, variant_id, available) values (v_tenant, v_loc, p_variant, 0) on conflict do nothing;
  select available into v_current from public.inventory_levels where location_id = v_loc and variant_id = p_variant for update;
  if v_current = p_available then return v_current; end if;
  return app.apply_stock_delta(v_tenant, p_variant, v_loc, p_available - v_current, 'correction', 'manual', null, p_note, true);
end;
$$;

-- Reserve stock for checkout (service role only). Moves available -> reserved.
create or replace function app.reserve_stock(p_tenant uuid, p_variant uuid, p_qty int, p_order uuid, p_ttl interval)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_loc uuid; v_id uuid; v_track boolean; v_backorder boolean;
begin
  select track_inventory, allow_backorder into v_track, v_backorder from public.product_variants where id = p_variant and tenant_id = p_tenant;
  if not found then raise exception 'variant not found' using errcode = 'P0002'; end if;
  if not v_track then return null; end if;
  select id into v_loc from public.inventory_locations where tenant_id = p_tenant and is_default;
  perform app.apply_stock_delta(p_tenant, p_variant, v_loc, -p_qty, 'reservation', 'order', p_order, null, v_backorder);
  update public.inventory_levels set reserved = reserved + p_qty where location_id = v_loc and variant_id = p_variant;
  insert into public.inventory_reservations (tenant_id, location_id, variant_id, order_id, quantity, expires_at)
  values (p_tenant, v_loc, p_variant, p_order, p_qty, now() + p_ttl) returning id into v_id;
  return v_id;
end;
$$;

-- Consume (order paid / COD confirmed) or release (cancelled / expired) reservations for an order.
create or replace function app.settle_reservations(p_order uuid, p_outcome text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; n int := 0;
begin
  if p_outcome not in ('consumed', 'released', 'expired') then raise exception 'invalid outcome'; end if;
  for r in select * from public.inventory_reservations where order_id = p_order and status = 'active' for update loop
    update public.inventory_levels set reserved = greatest(reserved - r.quantity, 0)
    where location_id = r.location_id and variant_id = r.variant_id;
    if p_outcome <> 'consumed' then
      perform app.apply_stock_delta(r.tenant_id, r.variant_id, r.location_id, r.quantity, 'release', 'reservation', r.id, p_outcome, true);
    end if;
    update public.inventory_reservations set status = p_outcome where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.adjust_inventory(uuid, int, text, text, uuid) from public, anon;
revoke all on function public.set_inventory(uuid, int, text, uuid) from public, anon;
grant execute on function public.adjust_inventory(uuid, int, text, text, uuid) to authenticated;
grant execute on function public.set_inventory(uuid, int, text, uuid) to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.uid(), app.has_platform_permission(text), app.is_platform_member(), app.is_tenant_member(uuid),
  app.has_tenant_permission(uuid, text), app.tenant_is_open(uuid) to anon, authenticated;
grant execute on all functions in schema app to service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.size_charts enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_media enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_levels enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;

-- Pattern: public read of published rows of open tenants; staff read with
-- catalog.read; writes with catalog.write. Implemented per table below.

create policy size_charts_public on public.size_charts for select to anon, authenticated using (app.tenant_is_open(tenant_id));
create policy size_charts_staff on public.size_charts for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy categories_public on public.categories for select to anon, authenticated using (status = 'active' and app.tenant_is_open(tenant_id));
create policy categories_staff_read on public.categories for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy categories_staff_write on public.categories for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy products_public on public.products for select to anon, authenticated
  using (status = 'active' and published_at <= now() and app.tenant_is_open(tenant_id));
create policy products_staff_read on public.products for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy products_staff_write on public.products for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

-- Child tables inherit visibility from their product.
create or replace function app.product_is_public(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    join public.tenants t on t.id = p.tenant_id
    where p.id = p_product and p.status = 'active' and p.published_at <= now() and t.status in ('trial', 'active')
  );
$$;
grant execute on function app.product_is_public(uuid) to anon, authenticated;

create policy product_options_public on public.product_options for select to anon, authenticated using (app.product_is_public(product_id));
create policy product_options_staff_read on public.product_options for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy product_options_staff_write on public.product_options for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy option_values_public on public.product_option_values for select to anon, authenticated
  using (exists (select 1 from public.product_options o where o.id = option_id and app.product_is_public(o.product_id)));
create policy option_values_staff_read on public.product_option_values for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy option_values_staff_write on public.product_option_values for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy variants_public on public.product_variants for select to anon, authenticated using (status = 'active' and app.product_is_public(product_id));
create policy variants_staff_read on public.product_variants for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy variants_staff_write on public.product_variants for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy media_public on public.product_media for select to anon, authenticated using (app.product_is_public(product_id));
create policy media_staff_read on public.product_media for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy media_staff_write on public.product_media for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy collections_public on public.collections for select to anon, authenticated
  using (status = 'active' and (published_at is null or published_at <= now()) and app.tenant_is_open(tenant_id));
create policy collections_staff_read on public.collections for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy collections_staff_write on public.collections for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

create policy collection_products_public on public.collection_products for select to anon, authenticated using (app.product_is_public(product_id));
create policy collection_products_staff_read on public.collection_products for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy collection_products_staff_write on public.collection_products for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));

-- Inventory: staff only. Storefront stock state comes from public.variant_stock (below).
create policy locations_staff_read on public.inventory_locations for select to authenticated using (app.has_tenant_permission(tenant_id, 'inventory.read'));
create policy locations_staff_write on public.inventory_locations for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'inventory.write')) with check (app.has_tenant_permission(tenant_id, 'inventory.write'));
create policy levels_staff_read on public.inventory_levels for select to authenticated using (app.has_tenant_permission(tenant_id, 'inventory.read'));
-- no direct writes to levels: use adjust_inventory()/set_inventory()
create policy movements_staff_read on public.inventory_movements for select to authenticated using (app.has_tenant_permission(tenant_id, 'inventory.read'));
create policy reservations_staff_read on public.inventory_reservations for select to authenticated using (app.has_tenant_permission(tenant_id, 'inventory.read'));

-- Public stock state per variant without exposing exact counts beyond a cap.
create or replace function public.variant_stock(p_variant_ids uuid[])
returns table (variant_id uuid, available int, in_stock boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id,
         least(coalesce(sum(l.available), 0), 20)::int as available,
         (not v.track_inventory) or v.allow_backorder or coalesce(sum(l.available), 0) > 0 as in_stock
  from public.product_variants v
  left join public.inventory_levels l on l.variant_id = v.id
  where v.id = any (p_variant_ids[1:500]) and v.status = 'active' and app.product_is_public(v.product_id)
  group by v.id, v.track_inventory, v.allow_backorder;
$$;
grant execute on function public.variant_stock(uuid[]) to anon, authenticated;

-- ===== supabase/migrations/20260924000400_customers_orders.sql =====
-- =============================================================================
-- 0400 CUSTOMERS, CARTS, PROMOTIONS, ORDERS, PAYMENTS, SHIPPING, RETURNS
-- =============================================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  email text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  accepts_marketing boolean not null default false,
  marketing_consent_at timestamptz,
  tags text[] not null default '{}',
  note text check (char_length(note) <= 2000),
  status text not null default 'active' check (status in ('active', 'blocked')),
  orders_count int not null default 0,
  total_spent numeric(12,2) not null default 0,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (email is not null or phone is not null)
);
select app.add_standard_triggers('public.customers');
create unique index customers_email_key on public.customers (tenant_id, email) where email is not null;
create unique index customers_auth_key on public.customers (tenant_id, auth_user_id) where auth_user_id is not null;
create index customers_tags_idx on public.customers using gin (tags);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null,
  label text check (char_length(label) <= 40),
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  line1 text not null check (char_length(line1) between 1 and 200),
  line2 text check (char_length(line2) <= 200),
  landmark text check (char_length(landmark) <= 120),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (char_length(state) between 1 and 80),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  country text not null default 'IN' check (country = 'IN'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
select app.add_standard_triggers('public.customer_addresses');
create unique index customer_addresses_default_key on public.customer_addresses (customer_id) where is_default;

create table public.wishlist_items (
  tenant_id uuid not null,
  customer_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

-- Carts: accessed only by the server, keyed by a signed httpOnly cookie token (ADR-023)
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid,
  status text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
  discount_code text check (char_length(discount_code) <= 40),
  note text check (char_length(note) <= 500),
  email text,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id)
);
select app.add_standard_triggers('public.carts');
create index carts_customer_idx on public.carts (tenant_id, customer_id) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cart_id uuid not null,
  variant_id uuid not null,
  quantity int not null check (quantity between 1 and 20),
  saved_for_later boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id),
  foreign key (tenant_id, cart_id) references public.carts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade
);
select app.add_standard_triggers('public.cart_items');

-- Promotions -------------------------------------------------------------------
create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text check (code is null or code ~ '^[A-Z0-9_-]{3,40}$'),
  title text not null check (char_length(title) between 1 and 120),
  type text not null check (type in ('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')),
  value numeric(12,2) not null default 0 check (value >= 0),
  applies_to text not null default 'all' check (applies_to in ('all', 'products', 'collections')),
  min_subtotal numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12,2) check (max_discount is null or max_discount > 0),
  -- buy_x_get_y: {"buy_quantity": 2, "get_quantity": 1, "get_percent": 100}
  config jsonb not null default '{}'::jsonb,
  automatic boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),
  per_customer_limit int check (per_customer_limit is null or per_customer_limit > 0),
  usage_count int not null default 0,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (automatic or code is not null),
  check (type <> 'percentage' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);
select app.add_standard_triggers('public.discounts');
create unique index discounts_code_key on public.discounts (tenant_id, code) where code is not null;
create index discounts_active_idx on public.discounts (tenant_id, status, starts_at);

create table public.discount_products (
  tenant_id uuid not null,
  discount_id uuid not null,
  product_id uuid not null,
  primary key (discount_id, product_id),
  foreign key (tenant_id, discount_id) references public.discounts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

create table public.discount_collections (
  tenant_id uuid not null,
  discount_id uuid not null,
  collection_id uuid not null,
  primary key (discount_id, collection_id),
  foreign key (tenant_id, discount_id) references public.discounts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, collection_id) references public.collections (tenant_id, id) on delete cascade
);

-- Shipping rates ----------------------------------------------------------------
create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price numeric(12,2) not null default 0 check (price >= 0),
  min_subtotal numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_subtotal numeric(12,2),
  min_weight_grams int not null default 0,
  max_weight_grams int,
  -- optional PIN prefixes this rate applies to (e.g. {"30","31"}); empty = all India
  pincode_prefixes text[] not null default '{}',
  estimated_days_min int not null default 3,
  estimated_days_max int not null default 7,
  cod_allowed boolean not null default true,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
select app.add_standard_triggers('public.shipping_rates');

-- PIN codes the store does NOT deliver to / no COD (simple rules; provider lookups extend this)
create table public.pincode_rules (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  prefix text not null check (prefix ~ '^[1-9][0-9]{0,5}$'),
  deliverable boolean not null default true,
  cod_allowed boolean not null default true,
  extra_days int not null default 0,
  primary key (tenant_id, prefix)
);

-- Orders ------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_number bigint not null,
  customer_id uuid,
  cart_id uuid,
  email text,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'cod_pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'expired')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled', 'packed', 'shipped', 'delivered', 'returned', 'rto')),
  payment_method text not null check (payment_method in ('cod', 'online')),
  currency text not null default 'INR',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  cod_fee numeric(12,2) not null default 0 check (cod_fee >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  grand_total numeric(12,2) not null check (grand_total >= 0),
  refunded_total numeric(12,2) not null default 0 check (refunded_total >= 0),
  prices_include_tax boolean not null default true,
  discount_code text,
  discount_snapshot jsonb,
  shipping_rate_snapshot jsonb,
  shipping_address jsonb not null,
  billing_address jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 500),
  staff_note text check (char_length(staff_note) <= 2000),
  cancel_reason text,
  idempotency_key text not null,
  placed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_number),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id),
  check (grand_total = subtotal - discount_total + shipping_total + cod_fee + case when prices_include_tax then 0 else tax_total end)
);
select app.add_standard_triggers('public.orders');
create index orders_tenant_created_idx on public.orders (tenant_id, created_at desc);
create index orders_tenant_status_idx on public.orders (tenant_id, status, fulfillment_status);
create index orders_customer_idx on public.orders (tenant_id, customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  product_title text not null,
  variant_title text,
  sku text,
  options jsonb not null default '{}'::jsonb,
  image_path text,
  hsn_code text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  compare_at_price numeric(12,2),
  quantity int not null check (quantity > 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  tax_rate numeric(5,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  returned_quantity int not null default 0 check (returned_quantity >= 0),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete set null (product_id),
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete set null (variant_id),
  check (returned_quantity <= quantity),
  check (line_total = unit_price * quantity - discount_total)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (tenant_id, product_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  order_id uuid not null,
  type text not null check (type ~ '^[a-z_]+$'),
  message text,
  data jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users (id) on delete set null,
  visible_to_customer boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  provider text not null check (provider in ('cod', 'razorpay', 'manual')),
  provider_order_id text,
  provider_payment_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
  method text,
  error_code text,
  error_description text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
select app.add_standard_triggers('public.payments');
create unique index payments_provider_payment_key on public.payments (provider, provider_payment_id) where provider_payment_id is not null;
create unique index payments_provider_order_key on public.payments (provider, provider_order_id) where provider_order_id is not null;
create index payments_order_idx on public.payments (order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  payment_id uuid,
  return_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  method text not null default 'original' check (method in ('original', 'manual', 'store_credit')),
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  provider_refund_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, payment_id) references public.payments (tenant_id, id) on delete set null (payment_id)
);
select app.add_standard_triggers('public.refunds');

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  provider text not null default 'manual' check (provider in ('manual', 'shiprocket')),
  carrier text,
  tracking_number text,
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'rto', 'cancelled')),
  weight_grams int,
  dimensions jsonb,
  provider_ref text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
select app.add_standard_triggers('public.shipments');
create index shipments_order_idx on public.shipments (order_id);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  return_number bigint not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'received', 'refunded', 'closed')),
  resolution text not null default 'refund' check (resolution in ('refund', 'exchange', 'store_credit')),
  reason text not null check (char_length(reason) between 1 and 500),
  customer_note text check (char_length(customer_note) <= 1000),
  staff_note text check (char_length(staff_note) <= 2000),
  restock boolean not null default true,
  refund_amount numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, return_number),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id)
);
select app.add_standard_triggers('public.returns');
alter table public.refunds add foreign key (tenant_id, return_id) references public.returns (tenant_id, id) on delete set null (return_id);

create table public.return_items (
  tenant_id uuid not null,
  return_id uuid not null,
  order_item_id uuid not null,
  quantity int not null check (quantity > 0),
  reason text,
  primary key (return_id, order_item_id),
  foreign key (tenant_id, return_id) references public.returns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_item_id) references public.order_items (tenant_id, id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  invoice_number text not null,
  issued_at timestamptz not null default now(),
  -- frozen seller/buyer/lines/tax breakdown used to render the PDF/HTML
  data jsonb not null,
  unique (tenant_id, id),
  unique (tenant_id, invoice_number),
  unique (order_id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);

create table public.discount_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  discount_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  email text,
  phone text,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (discount_id, order_id),
  foreign key (tenant_id, discount_id) references public.discounts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index discount_usages_customer_idx on public.discount_usages (discount_id, email);

-- Payment provider credentials: server-only (no policies => deny for anon/authenticated).
create table public.tenant_payment_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  provider text not null default 'razorpay' check (provider in ('razorpay')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  key_id text,
  -- AES-256-GCM ciphertext (base64) using PAYMENT_CONFIG_ENCRYPTION_KEY; never plaintext
  key_secret_encrypted text,
  webhook_secret_encrypted text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Webhook idempotency
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  tenant_id uuid references public.tenants (id) on delete cascade,
  event_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_products enable row level security;
alter table public.discount_collections enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.pincode_rules enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.shipments enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.invoices enable row level security;
alter table public.discount_usages enable row level security;
alter table public.tenant_payment_settings enable row level security;
alter table public.webhook_events enable row level security;

-- "Is the current auth user this tenant's customer X?"
create or replace function app.is_own_customer(p_tenant uuid, p_customer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customers
    where id = p_customer and tenant_id = p_tenant and auth_user_id = (select auth.uid()) and status = 'active'
  );
$$;
grant execute on function app.is_own_customer(uuid, uuid) to authenticated;

-- customers
create policy customers_self_select on public.customers for select to authenticated using (auth_user_id = (select auth.uid()));
create policy customers_self_update on public.customers for update to authenticated
  using (auth_user_id = (select auth.uid()) and status = 'active')
  with check (auth_user_id = (select auth.uid()) and status = 'active');
create policy customers_staff_read on public.customers for select to authenticated using (app.has_tenant_permission(tenant_id, 'customers.read'));
create policy customers_staff_write on public.customers for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'customers.write')) with check (app.has_tenant_permission(tenant_id, 'customers.write'));

-- Customers may not self-edit staff-owned fields.
create or replace function app.guard_customer_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not app.has_tenant_permission(old.tenant_id, 'customers.write') then
    if new.tags is distinct from old.tags or new.note is distinct from old.note or new.status is distinct from old.status
       or new.orders_count is distinct from old.orders_count or new.total_spent is distinct from old.total_spent
       or new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email then
      raise exception 'field not editable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_guard_self before update on public.customers for each row execute function app.guard_customer_self_update();

create policy addresses_self on public.customer_addresses for all to authenticated
  using (app.is_own_customer(tenant_id, customer_id)) with check (app.is_own_customer(tenant_id, customer_id));
create policy addresses_staff_read on public.customer_addresses for select to authenticated using (app.has_tenant_permission(tenant_id, 'customers.read'));
create policy addresses_staff_write on public.customer_addresses for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'customers.write')) with check (app.has_tenant_permission(tenant_id, 'customers.write'));

create policy wishlist_self on public.wishlist_items for all to authenticated
  using (app.is_own_customer(tenant_id, customer_id)) with check (app.is_own_customer(tenant_id, customer_id));

-- carts/cart_items: no anon/authenticated policies (server-only via signed token)
create policy carts_staff_read on public.carts for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));

-- promotions: staff; storefront reads automatic discounts via server
create policy discounts_staff_read on public.discounts for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy discounts_staff_write on public.discounts for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy discount_products_read on public.discount_products for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy discount_products_write on public.discount_products for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy discount_collections_read on public.discount_collections for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy discount_collections_write on public.discount_collections for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy discount_usages_read on public.discount_usages for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));

-- shipping
create policy shipping_rates_public on public.shipping_rates for select to anon, authenticated using (active and app.tenant_is_open(tenant_id));
create policy shipping_rates_staff_read on public.shipping_rates for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy shipping_rates_staff_write on public.shipping_rates for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write')) with check (app.has_tenant_permission(tenant_id, 'settings.write'));
create policy pincode_rules_staff_read on public.pincode_rules for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy pincode_rules_staff_write on public.pincode_rules for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write')) with check (app.has_tenant_permission(tenant_id, 'settings.write'));

-- orders: customer sees own; staff read orders.read; staff updates orders.write
-- (creation only via app.place_order with the secret key)
create policy orders_customer_select on public.orders for select to authenticated using (customer_id is not null and app.is_own_customer(tenant_id, customer_id));
create policy orders_staff_read on public.orders for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));
create policy orders_staff_update on public.orders for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'orders.write')) with check (app.has_tenant_permission(tenant_id, 'orders.write'));

-- Money columns and snapshots are immutable for authenticated callers.
create or replace function app.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.subtotal is distinct from old.subtotal or new.discount_total is distinct from old.discount_total
       or new.shipping_total is distinct from old.shipping_total or new.tax_total is distinct from old.tax_total
       or new.grand_total is distinct from old.grand_total or new.cod_fee is distinct from old.cod_fee
       or new.refunded_total is distinct from old.refunded_total or new.payment_status is distinct from old.payment_status
       or new.order_number is distinct from old.order_number or new.customer_snapshot is distinct from old.customer_snapshot
       or new.payment_method is distinct from old.payment_method or new.placed_at is distinct from old.placed_at then
      raise exception 'order totals and payment state can only change through order services' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_guard_update before update on public.orders for each row execute function app.guard_order_update();

create policy order_items_customer on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id is not null and app.is_own_customer(o.tenant_id, o.customer_id))
);
create policy order_items_staff on public.order_items for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));

create policy order_events_customer on public.order_events for select to authenticated using (
  visible_to_customer and exists (select 1 from public.orders o where o.id = order_id and o.customer_id is not null and app.is_own_customer(o.tenant_id, o.customer_id))
);
create policy order_events_staff on public.order_events for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));
create policy order_events_staff_insert on public.order_events for insert to authenticated
  with check (app.has_tenant_permission(tenant_id, 'orders.write') and actor_user_id = (select auth.uid()));

create policy payments_staff on public.payments for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));
create policy refunds_staff on public.refunds for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));

create policy shipments_customer on public.shipments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id is not null and app.is_own_customer(o.tenant_id, o.customer_id))
);
create policy shipments_staff_read on public.shipments for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));
create policy shipments_staff_write on public.shipments for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'orders.write')) with check (app.has_tenant_permission(tenant_id, 'orders.write'));

create policy returns_customer on public.returns for select to authenticated using (customer_id is not null and app.is_own_customer(tenant_id, customer_id));
create policy returns_staff_read on public.returns for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));
create policy returns_staff_update on public.returns for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'orders.write')) with check (app.has_tenant_permission(tenant_id, 'orders.write'));
create policy return_items_customer on public.return_items for select to authenticated using (
  exists (select 1 from public.returns r where r.id = return_id and r.customer_id is not null and app.is_own_customer(r.tenant_id, r.customer_id))
);
create policy return_items_staff on public.return_items for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));

create policy invoices_customer on public.invoices for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id is not null and app.is_own_customer(o.tenant_id, o.customer_id))
);
create policy invoices_staff on public.invoices for select to authenticated using (app.has_tenant_permission(tenant_id, 'orders.read'));

-- tenant_payment_settings / webhook_events: no policies (server-only)

-- =============================================================================
-- ORDER FUNCTIONS (service role only)
-- =============================================================================

-- Places an order atomically. The server computes pricing (src/features/checkout/pricing.ts)
-- from CURRENT DB prices; this function re-verifies each unit price under row lock,
-- reserves stock, records discount usage within limits, and writes the snapshot.
-- p_order: {tenant_id, idempotency_key, customer_id?, cart_id?, email?, phone, payment_method,
--           subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, prices_include_tax,
--           discount_id?, discount_code?, discount_snapshot?, shipping_rate_snapshot?, shipping_address,
--           billing_address?, customer_snapshot, note?, reservation_minutes}
-- p_items: [{variant_id, quantity, unit_price, discount_total, tax_rate, tax_total}]
create or replace function app.place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (p_order ->> 'tenant_id')::uuid;
  v_existing uuid;
  v_order uuid;
  v_number bigint;
  v_item jsonb;
  v_variant record;
  v_subtotal numeric(12,2) := 0;
  v_discount uuid := nullif(p_order ->> 'discount_id', '')::uuid;
  v_disc record;
  v_used int;
  v_is_cod boolean := p_order ->> 'payment_method' = 'cod';
  v_ttl interval := make_interval(mins => coalesce((p_order ->> 'reservation_minutes')::int, 30));
begin
  if not app.tenant_is_open(v_tenant) then
    raise exception 'store unavailable' using errcode = 'P0001', hint = 'TENANT_UNAVAILABLE';
  end if;

  -- idempotency: same key => same order
  select id into v_existing from public.orders where tenant_id = v_tenant and idempotency_key = p_order ->> 'idempotency_key';
  if v_existing is not null then return v_existing; end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  v_number := app.next_counter(v_tenant, 'order');
  v_order := gen_random_uuid();

  insert into public.orders (
    id, tenant_id, order_number, customer_id, cart_id, email, phone, status, payment_status, payment_method,
    subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, prices_include_tax,
    discount_code, discount_snapshot, shipping_rate_snapshot, shipping_address, billing_address,
    customer_snapshot, note, idempotency_key, confirmed_at
  ) values (
    v_order, v_tenant, v_number, nullif(p_order ->> 'customer_id', '')::uuid, nullif(p_order ->> 'cart_id', '')::uuid,
    p_order ->> 'email', p_order ->> 'phone',
    case when v_is_cod then 'confirmed' else 'pending' end,
    case when v_is_cod then 'cod_pending' else 'pending' end,
    p_order ->> 'payment_method',
    (p_order ->> 'subtotal')::numeric, (p_order ->> 'discount_total')::numeric, (p_order ->> 'shipping_total')::numeric,
    (p_order ->> 'cod_fee')::numeric, (p_order ->> 'tax_total')::numeric, (p_order ->> 'grand_total')::numeric,
    coalesce((p_order ->> 'prices_include_tax')::boolean, true),
    p_order ->> 'discount_code', p_order -> 'discount_snapshot', p_order -> 'shipping_rate_snapshot',
    p_order -> 'shipping_address', p_order -> 'billing_address', coalesce(p_order -> 'customer_snapshot', '{}'::jsonb),
    p_order ->> 'note', p_order ->> 'idempotency_key', case when v_is_cod then now() end
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.id, v.product_id, v.sku, v.title, v.option1, v.option2, v.option3, v.price, v.compare_at_price, v.status,
           p.title as product_title, p.status as product_status, p.hsn_code,
           (select storage_path from public.product_media m where m.product_id = p.id order by (m.variant_id = v.id) desc nulls last, m.position limit 1) as image_path,
           (select jsonb_object_agg(o.name, case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end)
              from public.product_options o where o.product_id = p.id) as options
      into v_variant
      from public.product_variants v join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid and v.tenant_id = v_tenant
     for update of v;

    if not found or v_variant.status <> 'active' or v_variant.product_status <> 'active' then
      raise exception 'item unavailable' using errcode = 'P0001', hint = 'ITEM_UNAVAILABLE', detail = v_item ->> 'variant_id';
    end if;
    if v_variant.price <> (v_item ->> 'unit_price')::numeric then
      raise exception 'price changed' using errcode = 'P0001', hint = 'PRICE_CHANGED', detail = v_item ->> 'variant_id';
    end if;

    insert into public.order_items (
      tenant_id, order_id, product_id, variant_id, product_title, variant_title, sku, options, image_path, hsn_code,
      unit_price, compare_at_price, quantity, discount_total, tax_rate, tax_total, line_total
    ) values (
      v_tenant, v_order, v_variant.product_id, v_variant.id, v_variant.product_title,
      nullif(v_variant.title, 'Default'), v_variant.sku, coalesce(v_variant.options, '{}'::jsonb), v_variant.image_path, v_variant.hsn_code,
      v_variant.price, v_variant.compare_at_price, (v_item ->> 'quantity')::int,
      (v_item ->> 'discount_total')::numeric, (v_item ->> 'tax_rate')::numeric, (v_item ->> 'tax_total')::numeric,
      v_variant.price * (v_item ->> 'quantity')::int - (v_item ->> 'discount_total')::numeric
    );
    v_subtotal := v_subtotal + v_variant.price * (v_item ->> 'quantity')::int;

    perform app.reserve_stock(v_tenant, v_variant.id, (v_item ->> 'quantity')::int, v_order,
      case when v_is_cod then interval '100 years' else v_ttl end);
  end loop;

  if v_subtotal <> (p_order ->> 'subtotal')::numeric then
    raise exception 'subtotal mismatch' using errcode = 'P0001', hint = 'PRICE_CHANGED';
  end if;

  if v_discount is not null then
    select * into v_disc from public.discounts where id = v_discount and tenant_id = v_tenant for update;
    if not found or v_disc.status <> 'active' or v_disc.starts_at > now() or (v_disc.ends_at is not null and v_disc.ends_at <= now()) then
      raise exception 'discount invalid' using errcode = 'P0001', hint = 'DISCOUNT_INVALID';
    end if;
    if v_disc.usage_limit is not null and v_disc.usage_count >= v_disc.usage_limit then
      raise exception 'discount exhausted' using errcode = 'P0001', hint = 'DISCOUNT_INVALID';
    end if;
    if v_disc.per_customer_limit is not null then
      select count(*) into v_used from public.discount_usages u
      where u.discount_id = v_discount and (u.email = p_order ->> 'email' or u.phone = p_order ->> 'phone');
      if v_used >= v_disc.per_customer_limit then
        raise exception 'discount limit reached' using errcode = 'P0001', hint = 'DISCOUNT_INVALID';
      end if;
    end if;
    update public.discounts set usage_count = usage_count + 1 where id = v_discount;
    insert into public.discount_usages (tenant_id, discount_id, order_id, customer_id, email, phone, amount)
    values (v_tenant, v_discount, v_order, nullif(p_order ->> 'customer_id', '')::uuid, p_order ->> 'email', p_order ->> 'phone',
            (p_order ->> 'discount_total')::numeric);
  end if;

  insert into public.order_events (tenant_id, order_id, type, message, visible_to_customer)
  values (v_tenant, v_order, 'placed', case when v_is_cod then 'Order placed (Cash on Delivery)' else 'Order placed, awaiting payment' end, true);

  if nullif(p_order ->> 'cart_id', '') is not null then
    update public.carts set status = 'converted' where id = (p_order ->> 'cart_id')::uuid and tenant_id = v_tenant;
  end if;

  if v_is_cod then
    perform app.on_order_confirmed(v_order);
  end if;
  return v_order;
end;
$$;

-- Bookkeeping when an order becomes confirmed (COD at placement, online on capture).
create or replace function app.on_order_confirmed(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform app.settle_reservations(p_order, 'consumed');
  update public.products p set sales_count = sales_count + i.qty
  from (select product_id, sum(quantity) as qty from public.order_items where order_id = p_order and product_id is not null group by product_id) i
  where p.id = i.product_id;
  if o.customer_id is not null then
    update public.customers set orders_count = orders_count + 1, total_spent = total_spent + o.grand_total, last_order_at = now()
    where id = o.customer_id;
  end if;
  insert into public.tenant_usage as u (tenant_id, metric, period_start, value)
  values (o.tenant_id, 'orders', date_trunc('month', now())::date, 1), (o.tenant_id, 'gmv', date_trunc('month', now())::date, o.grand_total)
  on conflict (tenant_id, metric, period_start) do update set value = u.value + excluded.value, updated_at = now();
end;
$$;

-- Online payment captured (called by the verified webhook / verify endpoint).
create or replace function app.mark_order_paid(p_order uuid, p_provider text, p_provider_order_id text, p_provider_payment_id text, p_amount numeric, p_method text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.payment_status = 'paid' then return false; end if; -- idempotent
  if p_amount <> o.grand_total then
    raise exception 'amount mismatch' using errcode = 'P0001', hint = 'AMOUNT_MISMATCH';
  end if;
  update public.payments set status = 'captured', provider_payment_id = p_provider_payment_id, method = p_method, paid_at = now()
  where order_id = p_order and provider = p_provider and provider_order_id = p_provider_order_id;
  if not found then
    insert into public.payments (tenant_id, order_id, provider, provider_order_id, provider_payment_id, amount, status, method, paid_at)
    values (o.tenant_id, p_order, p_provider, p_provider_order_id, p_provider_payment_id, p_amount, 'captured', p_method, now());
  end if;
  if o.status = 'cancelled' then
    -- paid after expiry/cancel: flag for manual refund instead of silently reviving
    insert into public.order_events (tenant_id, order_id, type, message) values (o.tenant_id, p_order, 'payment_after_cancel', 'Payment captured after the order was cancelled. Refund required.');
    update public.orders set payment_status = 'paid' where id = p_order;
    return true;
  end if;
  update public.orders set payment_status = 'paid', status = 'confirmed', confirmed_at = now() where id = p_order;
  insert into public.order_events (tenant_id, order_id, type, message, visible_to_customer) values (o.tenant_id, p_order, 'paid', 'Payment received', true);
  perform app.on_order_confirmed(p_order);
  return true;
end;
$$;

-- Cancel an order: releases stock (reservations or, if consumed, restocks), audited.
create or replace function app.cancel_order_internal(p_order uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype; r record;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.fulfillment_status in ('shipped', 'delivered') then
    raise exception 'shipped orders cannot be cancelled; create a return instead' using errcode = 'P0001', hint = 'NOT_CANCELLABLE';
  end if;
  if exists (select 1 from public.inventory_reservations where order_id = p_order and status = 'active') then
    perform app.settle_reservations(p_order, 'released');
  else
    for r in select variant_id, quantity from public.order_items where order_id = p_order and variant_id is not null loop
      perform app.apply_stock_delta(o.tenant_id, r.variant_id, null, r.quantity, 'cancellation', 'order', p_order, p_reason, true);
    end loop;
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason,
    payment_status = case when payment_status in ('pending', 'cod_pending') then 'expired' else payment_status end
  where id = p_order;
  insert into public.order_events (tenant_id, order_id, type, message, actor_user_id, visible_to_customer)
  values (o.tenant_id, p_order, 'cancelled', coalesce(p_reason, 'Order cancelled'), p_actor, true);
end;
$$;

-- Seller-facing cancel (orders.write)
create or replace function public.cancel_order(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.orders where id = p_order;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'orders.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform app.cancel_order_internal(p_order, p_reason, (select auth.uid()));
  perform app.audit(v_tenant, 'order.cancelled', 'order', p_order::text, jsonb_build_object('reason', p_reason));
end;
$$;

-- Expire unpaid online orders (cron: every 5 minutes)
create or replace function app.expire_unpaid_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in
    select distinct o.id from public.orders o
    join public.inventory_reservations ir on ir.order_id = o.id and ir.status = 'active' and ir.expires_at < now()
    where o.payment_status = 'pending' and o.status = 'pending'
  loop
    perform app.cancel_order_internal(r.id, 'Payment not completed in time', null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Seller-facing fulfilment update
create or replace function public.update_fulfillment(p_order uuid, p_status text, p_carrier text default null, p_tracking text default null, p_tracking_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not app.has_tenant_permission(o.tenant_id, 'orders.write') then raise exception 'not allowed' using errcode = '42501'; end if;
  if o.status = 'cancelled' then raise exception 'order is cancelled' using errcode = 'P0001'; end if;
  if o.status = 'pending' then raise exception 'order is awaiting payment' using errcode = 'P0001'; end if;
  if p_status not in ('packed', 'shipped', 'delivered', 'rto') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_tracking_url is not null and p_tracking_url !~ '^https://' then raise exception 'tracking url must be https' using errcode = '22023'; end if;

  update public.orders set fulfillment_status = p_status,
    status = case when p_status = 'delivered' then 'completed' else status end,
    payment_status = case when p_status = 'delivered' and payment_status = 'cod_pending' then 'paid' else payment_status end
  where id = p_order;

  if p_status in ('shipped', 'delivered', 'rto') then
    insert into public.shipments (tenant_id, order_id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at)
    select o.tenant_id, p_order, p_carrier, p_tracking, p_tracking_url, p_status, now(),
           case when p_status = 'delivered' then now() end
    where not exists (select 1 from public.shipments where order_id = p_order);
    update public.shipments set status = p_status,
      carrier = coalesce(p_carrier, carrier), tracking_number = coalesce(p_tracking, tracking_number), tracking_url = coalesce(p_tracking_url, tracking_url),
      delivered_at = case when p_status = 'delivered' then now() else delivered_at end
    where order_id = p_order and id = (select id from public.shipments where order_id = p_order order by created_at desc limit 1);
  end if;
  if p_status = 'delivered' and o.payment_status = 'cod_pending' then
    insert into public.payments (tenant_id, order_id, provider, amount, status, method, paid_at)
    values (o.tenant_id, p_order, 'cod', o.grand_total, 'captured', 'cod', now());
  end if;
  insert into public.order_events (tenant_id, order_id, type, message, data, actor_user_id, visible_to_customer)
  values (o.tenant_id, p_order, p_status, initcap(p_status),
          jsonb_strip_nulls(jsonb_build_object('carrier', p_carrier, 'tracking', p_tracking, 'tracking_url', p_tracking_url)), (select auth.uid()), true);
  perform app.audit(o.tenant_id, 'order.fulfillment_updated', 'order', p_order::text, jsonb_build_object('status', p_status));
end;
$$;

-- Returns: customer requests (via server) -> seller approves/receives -> refund
create or replace function app.create_return(p_tenant uuid, p_order uuid, p_customer uuid, p_reason text, p_note text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_num bigint; i jsonb; oi public.order_items%rowtype; o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order and tenant_id = p_tenant;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if p_customer is not null and o.customer_id is distinct from p_customer then raise exception 'not allowed' using errcode = '42501'; end if;
  if o.fulfillment_status <> 'delivered' then raise exception 'only delivered orders can be returned' using errcode = 'P0001', hint = 'NOT_RETURNABLE'; end if;
  v_num := app.next_counter(p_tenant, 'return');
  insert into public.returns (tenant_id, order_id, customer_id, return_number, reason, customer_note)
  values (p_tenant, p_order, o.customer_id, v_num, p_reason, p_note) returning id into v_id;
  for i in select * from jsonb_array_elements(p_items) loop
    select * into oi from public.order_items where id = (i ->> 'order_item_id')::uuid and order_id = p_order for update;
    if not found or (i ->> 'quantity')::int < 1 or oi.returned_quantity + (i ->> 'quantity')::int > oi.quantity then
      raise exception 'invalid return quantity' using errcode = '22023';
    end if;
    insert into public.return_items (tenant_id, return_id, order_item_id, quantity, reason) values (p_tenant, v_id, oi.id, (i ->> 'quantity')::int, i ->> 'reason');
    update public.order_items set returned_quantity = returned_quantity + (i ->> 'quantity')::int where id = oi.id;
  end loop;
  insert into public.order_events (tenant_id, order_id, type, message, visible_to_customer) values (p_tenant, p_order, 'return_requested', 'Return requested', true);
  return v_id;
end;
$$;

create or replace function public.update_return_status(p_return uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.returns%rowtype; ri record;
begin
  select * into r from public.returns where id = p_return for update;
  if not found or not app.has_tenant_permission(r.tenant_id, 'orders.write') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (
    (r.status = 'requested' and p_status in ('approved', 'rejected')) or
    (r.status = 'approved' and p_status = 'received') or
    (r.status in ('received', 'refunded') and p_status = 'closed')
  ) then raise exception 'invalid status transition % -> %', r.status, p_status using errcode = '22023'; end if;

  if p_status = 'rejected' then
    update public.order_items oi set returned_quantity = oi.returned_quantity - x.quantity
    from public.return_items x where x.return_id = p_return and x.order_item_id = oi.id;
  end if;
  if p_status = 'received' and r.restock then
    for ri in select oi.variant_id, x.quantity from public.return_items x join public.order_items oi on oi.id = x.order_item_id
              where x.return_id = p_return and oi.variant_id is not null loop
      perform app.apply_stock_delta(r.tenant_id, ri.variant_id, null, ri.quantity, 'return', 'return', p_return, null, true);
    end loop;
  end if;
  update public.returns set status = p_status, staff_note = coalesce(p_note, staff_note) where id = p_return;
  insert into public.order_events (tenant_id, order_id, type, message, actor_user_id, visible_to_customer)
  values (r.tenant_id, r.order_id, 'return_' || p_status, 'Return ' || p_status, (select auth.uid()), true);
  perform app.audit(r.tenant_id, 'return.status_changed', 'return', p_return::text, jsonb_build_object('to', p_status));
end;
$$;

-- Refund bookkeeping (provider call happens in the server before/after; this records it)
create or replace function app.record_refund(p_order uuid, p_amount numeric, p_reason text, p_method text, p_provider_refund_id text, p_status text, p_return uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype; v_id uuid; v_pay uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if p_amount <= 0 or o.refunded_total + p_amount > o.grand_total then
    raise exception 'refund exceeds amount paid' using errcode = 'P0001', hint = 'REFUND_TOO_LARGE';
  end if;
  select id into v_pay from public.payments where order_id = p_order and status in ('captured', 'partially_refunded') order by created_at desc limit 1;
  insert into public.refunds (tenant_id, order_id, payment_id, return_id, amount, reason, method, status, provider_refund_id, created_by)
  values (o.tenant_id, p_order, v_pay, p_return, p_amount, p_reason, p_method, p_status, p_provider_refund_id, p_actor) returning id into v_id;
  if p_status = 'processed' then
    update public.orders set refunded_total = refunded_total + p_amount,
      payment_status = case when refunded_total + p_amount >= grand_total then 'refunded' else 'partially_refunded' end
    where id = p_order;
    if p_return is not null then update public.returns set status = 'refunded', refund_amount = coalesce(refund_amount, 0) + p_amount where id = p_return; end if;
  end if;
  insert into public.order_events (tenant_id, order_id, type, message, data, actor_user_id, visible_to_customer)
  values (o.tenant_id, p_order, 'refund_' || p_status, 'Refund ' || p_status, jsonb_build_object('amount', p_amount), p_actor, true);
  return v_id;
end;
$$;

-- Invoice (GST-style) issued once per order from the order snapshot.
create or replace function app.issue_invoice(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders%rowtype; s public.stores%rowtype; v_id uuid; v_num bigint;
begin
  select id into v_id from public.invoices where order_id = p_order;
  if v_id is not null then return v_id; end if;
  select * into o from public.orders where id = p_order;
  select * into s from public.stores where tenant_id = o.tenant_id;
  v_num := app.next_counter(o.tenant_id, 'invoice');
  insert into public.invoices (tenant_id, order_id, invoice_number, data)
  values (o.tenant_id, p_order, 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_num::text, 6, '0'),
    jsonb_build_object(
      'seller', jsonb_build_object('name', coalesce(s.legal_name, s.name), 'gstin', s.gstin, 'address', s.address, 'email', s.email, 'phone', s.phone),
      'buyer', jsonb_build_object('address', o.shipping_address, 'billing', o.billing_address, 'email', o.email, 'phone', o.phone),
      'order', jsonb_build_object('number', o.order_number, 'placed_at', o.placed_at, 'payment_method', o.payment_method),
      'totals', jsonb_build_object('subtotal', o.subtotal, 'discount', o.discount_total, 'shipping', o.shipping_total, 'cod_fee', o.cod_fee,
                                   'tax', o.tax_total, 'grand_total', o.grand_total, 'prices_include_tax', o.prices_include_tax),
      'lines', (select jsonb_agg(jsonb_build_object('title', product_title, 'variant', variant_title, 'sku', sku, 'hsn', hsn_code,
                  'qty', quantity, 'unit_price', unit_price, 'discount', discount_total, 'tax_rate', tax_rate, 'tax', tax_total, 'total', line_total) order by product_title)
                from public.order_items where order_id = p_order)
    ))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.update_fulfillment(uuid, text, text, text, text) from public, anon;
revoke all on function public.update_return_status(uuid, text, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.update_fulfillment(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_return_status(uuid, text, text) to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.uid(), app.has_platform_permission(text), app.is_platform_member(), app.is_tenant_member(uuid),
  app.has_tenant_permission(uuid, text), app.tenant_is_open(uuid), app.product_is_public(uuid) to anon, authenticated;
grant execute on function app.is_own_customer(uuid, uuid) to authenticated;
grant execute on all functions in schema app to service_role;

-- service-role RPC wrappers in public (PostgREST can only call public.*). Execute is
-- granted to service_role ONLY, so the browser can never call them.
create or replace function public.svc_place_order(p_order jsonb, p_items jsonb) returns uuid
language sql security definer set search_path = '' as $$ select app.place_order(p_order, p_items) $$;
create or replace function public.svc_mark_order_paid(p_order uuid, p_provider text, p_provider_order_id text, p_provider_payment_id text, p_amount numeric, p_method text) returns boolean
language sql security definer set search_path = '' as $$ select app.mark_order_paid(p_order, p_provider, p_provider_order_id, p_provider_payment_id, p_amount, p_method) $$;
create or replace function public.svc_cancel_order(p_order uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$ select app.cancel_order_internal(p_order, p_reason, null) $$;
create or replace function public.svc_expire_unpaid_orders() returns int
language sql security definer set search_path = '' as $$ select app.expire_unpaid_orders() $$;
create or replace function public.svc_create_return(p_tenant uuid, p_order uuid, p_customer uuid, p_reason text, p_note text, p_items jsonb) returns uuid
language sql security definer set search_path = '' as $$ select app.create_return(p_tenant, p_order, p_customer, p_reason, p_note, p_items) $$;
create or replace function public.svc_record_refund(p_order uuid, p_amount numeric, p_reason text, p_method text, p_provider_refund_id text, p_status text, p_return uuid, p_actor uuid) returns uuid
language sql security definer set search_path = '' as $$ select app.record_refund(p_order, p_amount, p_reason, p_method, p_provider_refund_id, p_status, p_return, p_actor) $$;
create or replace function public.svc_issue_invoice(p_order uuid) returns uuid
language sql security definer set search_path = '' as $$ select app.issue_invoice(p_order) $$;

revoke all on function public.svc_place_order(jsonb, jsonb), public.svc_mark_order_paid(uuid, text, text, text, numeric, text),
  public.svc_cancel_order(uuid, text), public.svc_expire_unpaid_orders(), public.svc_create_return(uuid, uuid, uuid, text, text, jsonb),
  public.svc_record_refund(uuid, numeric, text, text, text, text, uuid, uuid), public.svc_issue_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_place_order(jsonb, jsonb), public.svc_mark_order_paid(uuid, text, text, text, numeric, text),
  public.svc_cancel_order(uuid, text), public.svc_expire_unpaid_orders(), public.svc_create_return(uuid, uuid, uuid, text, text, jsonb),
  public.svc_record_refund(uuid, numeric, text, text, text, text, uuid, uuid), public.svc_issue_invoice(uuid)
  to service_role;

-- ===== supabase/migrations/20260924000500_content_theme_analytics.sql =====
-- =============================================================================
-- 0500 CONTENT, REVIEWS, THEME, ANALYTICS, NOTIFICATIONS, MEDIA, STORAGE
-- =============================================================================

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null default 'page' check (kind in ('page', 'policy', 'contact', 'faq', 'about')),
  -- structured blocks (validated in src/features/content/schemas.ts), never raw HTML
  body jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);
select app.add_standard_triggers('public.pages');

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text check (char_length(excerpt) <= 500),
  cover_path text,
  author_name text,
  tags text[] not null default '{}',
  body jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);
select app.add_standard_triggers('public.blog_posts');
create index blog_posts_listing_idx on public.blog_posts (tenant_id, status, published_at desc);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9-]{2,40}$'),
  title text not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, handle)
);
create trigger trg_menus_updated_at before update on public.menus for each row execute function app.set_updated_at();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  menu_id uuid not null,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 80),
  link_type text not null check (link_type in ('url', 'collection', 'category', 'product', 'page', 'blog', 'home', 'search')),
  link_ref uuid,
  url text check (url is null or url ~ '^(/|https://)'),
  highlight boolean not null default false,
  image_path text,
  position int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, menu_id) references public.menus (tenant_id, id) on delete cascade,
  foreign key (tenant_id, parent_id) references public.menu_items (tenant_id, id) on delete cascade
);
create index menu_items_menu_idx on public.menu_items (menu_id, parent_id, position);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 3000),
  group_name text not null default 'General',
  position int not null default 0,
  status text not null default 'published' check (status in ('draft', 'published')),
  unique (tenant_id, id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  customer_id uuid,
  order_id uuid,
  rating smallint not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text check (char_length(body) <= 3000),
  author_name text not null check (char_length(author_name) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  verified_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete set null (order_id)
);
select app.add_standard_triggers('public.reviews');
create index reviews_product_idx on public.reviews (tenant_id, product_id, status, created_at desc);
create unique index reviews_one_per_customer_key on public.reviews (product_id, customer_id) where customer_id is not null;

create or replace function app.trg_review_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where product_id = pid and status = 'approved'), 0),
    rating_count = (select count(*) from public.reviews where product_id = pid and status = 'approved')
  where p.id = pid;
  return null;
end;
$$;
create trigger reviews_rating after insert or update of status, rating or delete on public.reviews for each row execute function app.trg_review_rating();

create table public.store_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  address jsonb not null default '{}'::jsonb,
  phone text,
  hours text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  active boolean not null default true,
  position int not null default 0,
  unique (tenant_id, id)
);

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  from_path text not null check (from_path ~ '^/[^\s]*$' and char_length(from_path) <= 500),
  to_path text not null check (to_path ~ '^/[^/\s][^\s]*$|^/$' and char_length(to_path) <= 500),
  status_code smallint not null default 301 check (status_code in (301, 302)),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, from_path),
  check (from_path <> to_path)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  storage_path text not null check (split_part(storage_path, '/', 2) = tenant_id::text),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4')),
  bytes int not null check (bytes > 0 and bytes <= 20971520),
  width int,
  height int,
  alt_text text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (storage_path)
);
create index media_assets_tenant_idx on public.media_assets (tenant_id, created_at desc);

-- Theme (ADR-017 / ADR-024): config JSON holds tokens + section instances per template,
-- validated by the section registry in src/features/theme. Published versions are immutable.
create table public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  theme_key text not null default 'aangan' check (theme_key ~ '^[a-z0-9-]{2,40}$'),
  version int not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  label text,
  config jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  unique (tenant_id, id),
  unique (tenant_id, version)
);
create trigger trg_theme_versions_updated_at before update on public.theme_versions for each row execute function app.set_updated_at();
create unique index theme_versions_one_draft_key on public.theme_versions (tenant_id) where status = 'draft';
create unique index theme_versions_one_published_key on public.theme_versions (tenant_id) where status = 'published';

create or replace function app.guard_theme_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (new.config is distinct from old.config or new.version is distinct from old.version) then
    raise exception 'published theme versions are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger theme_versions_immutable before update on public.theme_versions for each row execute function app.guard_theme_version();

-- Publish = copy the draft into a new immutable published version.
create or replace function public.publish_theme(p_tenant uuid, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare d public.theme_versions%rowtype; v_id uuid; v_next int;
begin
  if not app.has_tenant_permission(p_tenant, 'theme.publish') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into d from public.theme_versions where tenant_id = p_tenant and status = 'draft' for update;
  if not found then raise exception 'no draft to publish' using errcode = 'P0002'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.theme_versions where tenant_id = p_tenant;
  update public.theme_versions set status = 'archived' where tenant_id = p_tenant and status = 'published';
  insert into public.theme_versions (tenant_id, theme_key, version, status, label, config, created_by, published_at, published_by)
  values (p_tenant, d.theme_key, v_next, 'published', coalesce(p_label, 'Version ' || v_next), d.config, (select auth.uid()), now(), (select auth.uid()))
  returning id into v_id;
  perform app.audit(p_tenant, 'theme.published', 'theme_version', v_id::text, jsonb_build_object('version', v_next));
  return v_id;
end;
$$;

-- Rollback = publish an older version's config as a new version and reset the draft to it.
create or replace function public.rollback_theme(p_version uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare src public.theme_versions%rowtype; v_id uuid; v_next int;
begin
  select * into src from public.theme_versions where id = p_version;
  if not found or not app.has_tenant_permission(src.tenant_id, 'theme.publish') then raise exception 'not allowed' using errcode = '42501'; end if;
  if src.status = 'draft' then raise exception 'cannot roll back to a draft' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.theme_versions where tenant_id = src.tenant_id;
  update public.theme_versions set status = 'archived' where tenant_id = src.tenant_id and status = 'published';
  insert into public.theme_versions (tenant_id, theme_key, version, status, label, config, created_by, published_at, published_by)
  values (src.tenant_id, src.theme_key, v_next, 'published', 'Rollback to v' || src.version, src.config, (select auth.uid()), now(), (select auth.uid()))
  returning id into v_id;
  update public.theme_versions set config = src.config where tenant_id = src.tenant_id and status = 'draft';
  perform app.audit(src.tenant_id, 'theme.rolled_back', 'theme_version', v_id::text, jsonb_build_object('from_version', src.version));
  return v_id;
end;
$$;

-- Analytics events (inserted server-side only)
create table public.analytics_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id text,
  customer_id uuid,
  event_name text not null check (event_name in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'purchase', 'search', 'wishlist_add')),
  path text,
  product_id uuid,
  order_id uuid,
  value numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index analytics_events_tenant_time_idx on public.analytics_events (tenant_id, occurred_at desc);
create index analytics_events_product_idx on public.analytics_events (tenant_id, product_id, occurred_at desc) where product_id is not null;

-- Notifications
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key in ('order_placed', 'order_shipped', 'order_delivered', 'order_cancelled', 'refund_processed', 'return_update', 'welcome', 'abandoned_cart')),
  channel text not null default 'email' check (channel in ('email', 'sms', 'whatsapp')),
  subject text check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 20000),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, key, channel)
);

create table public.notification_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template_key text not null,
  channel text not null,
  recipient_hash text not null,
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index notification_logs_tenant_idx on public.notification_logs (tenant_id, created_at desc);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.pages enable row level security;
alter table public.blog_posts enable row level security;
alter table public.menus enable row level security;
alter table public.menu_items enable row level security;
alter table public.faqs enable row level security;
alter table public.reviews enable row level security;
alter table public.store_locations enable row level security;
alter table public.redirects enable row level security;
alter table public.media_assets enable row level security;
alter table public.theme_versions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_logs enable row level security;

create policy pages_public on public.pages for select to anon, authenticated using (status = 'published' and app.tenant_is_open(tenant_id));
create policy pages_staff_read on public.pages for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy pages_staff_write on public.pages for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy blog_public on public.blog_posts for select to anon, authenticated using (status = 'published' and published_at <= now() and app.tenant_is_open(tenant_id));
create policy blog_staff_read on public.blog_posts for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy blog_staff_write on public.blog_posts for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy menus_public on public.menus for select to anon, authenticated using (app.tenant_is_open(tenant_id));
create policy menus_staff_read on public.menus for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy menus_staff_write on public.menus for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));
create policy menu_items_public on public.menu_items for select to anon, authenticated using (app.tenant_is_open(tenant_id));
create policy menu_items_staff_read on public.menu_items for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy menu_items_staff_write on public.menu_items for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy faqs_public on public.faqs for select to anon, authenticated using (status = 'published' and app.tenant_is_open(tenant_id));
create policy faqs_staff_read on public.faqs for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy faqs_staff_write on public.faqs for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy reviews_public on public.reviews for select to anon, authenticated using (status = 'approved' and app.product_is_public(product_id));
create policy reviews_own on public.reviews for select to authenticated using (customer_id is not null and app.is_own_customer(tenant_id, customer_id));
create policy reviews_staff_read on public.reviews for select to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.read'));
create policy reviews_staff_moderate on public.reviews for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'reviews.moderate')) with check (app.has_tenant_permission(tenant_id, 'reviews.moderate'));
create policy reviews_staff_delete on public.reviews for delete to authenticated using (app.has_tenant_permission(tenant_id, 'reviews.moderate'));
-- review submission goes through the server (verifies purchase, rate limits), status forced to 'pending'

create policy store_locations_public on public.store_locations for select to anon, authenticated using (active and app.tenant_is_open(tenant_id));
create policy store_locations_staff_write on public.store_locations for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy redirects_staff_read on public.redirects for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy redirects_staff_write on public.redirects for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'content.write')) with check (app.has_tenant_permission(tenant_id, 'content.write'));

create policy media_assets_staff_read on public.media_assets for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy media_assets_staff_write on public.media_assets for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write'))
  with check (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write'));

create policy theme_public on public.theme_versions for select to anon, authenticated using (status = 'published' and app.tenant_is_open(tenant_id));
create policy theme_staff_read on public.theme_versions for select to authenticated using (app.has_tenant_permission(tenant_id, 'theme.edit'));
create policy theme_staff_draft_insert on public.theme_versions for insert to authenticated
  with check (app.has_tenant_permission(tenant_id, 'theme.edit') and status = 'draft');
create policy theme_staff_draft_update on public.theme_versions for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'theme.edit') and status = 'draft')
  with check (app.has_tenant_permission(tenant_id, 'theme.edit') and status = 'draft');

create policy analytics_staff_read on public.analytics_events for select to authenticated using (app.has_tenant_permission(tenant_id, 'analytics.read'));

create policy notification_templates_staff_read on public.notification_templates for select to authenticated using (app.has_tenant_permission(tenant_id, 'store.read'));
create policy notification_templates_staff_write on public.notification_templates for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'settings.write')) with check (app.has_tenant_permission(tenant_id, 'settings.write'));
create policy notification_logs_staff_read on public.notification_logs for select to authenticated using (app.has_tenant_permission(tenant_id, 'settings.write'));

revoke all on function public.publish_theme(uuid, text), public.rollback_theme(uuid) from public, anon;
grant execute on function public.publish_theme(uuid, text), public.rollback_theme(uuid) to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.uid(), app.has_platform_permission(text), app.is_platform_member(), app.is_tenant_member(uuid),
  app.has_tenant_permission(uuid, text), app.tenant_is_open(uuid), app.product_is_public(uuid) to anon, authenticated;
grant execute on function app.is_own_customer(uuid, uuid) to authenticated;
grant execute on all functions in schema app to service_role;

-- =============================================================================
-- STORAGE (Supabase Storage). Path convention: tenant/{tenant_id}/{area}/{file}
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('store-assets', 'store-assets', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4']),
  ('private-files', 'private-files', false, 10485760, array['application/pdf', 'text/csv', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function app.storage_tenant(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if split_part(p_name, '/', 1) <> 'tenant' then return null; end if;
  return split_part(p_name, '/', 2)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
grant execute on function app.storage_tenant(text) to anon, authenticated, service_role;

create policy store_assets_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'store-assets');
create policy store_assets_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and (
    app.has_tenant_permission(app.storage_tenant(name), 'catalog.write')
    or app.has_tenant_permission(app.storage_tenant(name), 'content.write')
    or app.has_tenant_permission(app.storage_tenant(name), 'theme.edit')));
create policy store_assets_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'store-assets' and (app.has_tenant_permission(app.storage_tenant(name), 'catalog.write') or app.has_tenant_permission(app.storage_tenant(name), 'content.write')));
create policy store_assets_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets' and (app.has_tenant_permission(app.storage_tenant(name), 'catalog.write') or app.has_tenant_permission(app.storage_tenant(name), 'content.write')));

create policy private_files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'private-files' and app.has_tenant_permission(app.storage_tenant(name), 'orders.read'));
create policy private_files_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'private-files' and app.has_tenant_permission(app.storage_tenant(name), 'catalog.write'));

-- ===== supabase/migrations/20260924000600_reference_data.sql =====
-- =============================================================================
-- 0600 REFERENCE DATA + GRANTS
-- role_permissions MUST match src/lib/permissions/matrix.ts
-- (enforced by tests/unit/permissions-sql.test.ts)
-- =============================================================================

insert into public.role_permissions (role, permission) values
  -- viewer
  ('viewer','store.read'),('viewer','catalog.read'),('viewer','inventory.read'),('viewer','orders.read'),
  ('viewer','customers.read'),('viewer','marketing.read'),('viewer','analytics.read'),
  -- staff
  ('staff','store.read'),('staff','catalog.read'),('staff','inventory.read'),('staff','orders.read'),
  ('staff','customers.read'),('staff','marketing.read'),('staff','analytics.read'),
  ('staff','catalog.write'),('staff','inventory.write'),('staff','orders.write'),('staff','customers.write'),
  -- manager
  ('manager','store.read'),('manager','catalog.read'),('manager','inventory.read'),('manager','orders.read'),
  ('manager','customers.read'),('manager','marketing.read'),('manager','analytics.read'),
  ('manager','catalog.write'),('manager','inventory.write'),('manager','orders.write'),('manager','customers.write'),
  ('manager','orders.refund'),('manager','marketing.write'),('manager','content.write'),('manager','theme.edit'),('manager','reviews.moderate'),
  -- admin
  ('admin','store.read'),('admin','catalog.read'),('admin','inventory.read'),('admin','orders.read'),
  ('admin','customers.read'),('admin','marketing.read'),('admin','analytics.read'),
  ('admin','catalog.write'),('admin','inventory.write'),('admin','orders.write'),('admin','customers.write'),
  ('admin','orders.refund'),('admin','marketing.write'),('admin','content.write'),('admin','theme.edit'),('admin','reviews.moderate'),
  ('admin','theme.publish'),('admin','settings.write'),('admin','payments.manage'),('admin','domains.manage'),('admin','members.manage'),
  -- owner
  ('owner','store.read'),('owner','catalog.read'),('owner','catalog.write'),('owner','inventory.read'),('owner','inventory.write'),
  ('owner','orders.read'),('owner','orders.write'),('owner','orders.refund'),('owner','customers.read'),('owner','customers.write'),
  ('owner','marketing.read'),('owner','marketing.write'),('owner','content.write'),('owner','theme.edit'),('owner','theme.publish'),
  ('owner','reviews.moderate'),('owner','analytics.read'),('owner','settings.write'),('owner','payments.manage'),('owner','domains.manage'),
  ('owner','members.manage'),('owner','billing.manage')
on conflict do nothing;

insert into public.platform_role_permissions (role, permission) values
  ('super_admin','platform.tenants.read'),('super_admin','platform.tenants.manage'),('super_admin','platform.plans.manage'),
  ('super_admin','platform.flags.manage'),('super_admin','platform.users.manage'),('super_admin','platform.audit.read'),
  ('super_admin','platform.support.impersonate'),('super_admin','platform.settings.manage'),('super_admin','platform.usage.read'),
  ('support','platform.tenants.read'),('support','platform.audit.read'),('support','platform.support.impersonate'),('support','platform.usage.read'),
  ('finance','platform.tenants.read'),('finance','platform.plans.manage'),('finance','platform.usage.read')
on conflict do nothing;

insert into public.feature_flags (key, description, default_enabled) values
  ('custom_domains', 'Connect a custom domain', false),
  ('blog', 'Blog / journal', true),
  ('store_locator', 'Store locator page', false),
  ('reviews', 'Product reviews', true),
  ('cod', 'Cash on delivery', true),
  ('online_payments', 'Razorpay online payments', true),
  ('shiprocket', 'Shiprocket shipping integration', false),
  ('analytics_export', 'CSV exports of analytics', false)
on conflict do nothing;

insert into public.plans (code, name, description, price_monthly, price_yearly, limits, features, trial_days, sort_order) values
  ('starter', 'Starter', 'For new labels getting online', 999, 9990,
   '{"products": 200, "staff": 2, "storage_mb": 2048, "custom_domains": 0}', '{"custom_domains": false, "blog": true}', 14, 1),
  ('growth', 'Growth', 'For growing D2C brands', 2999, 29990,
   '{"products": 2000, "staff": 8, "storage_mb": 10240, "custom_domains": 1}', '{"custom_domains": true, "blog": true, "store_locator": true}', 14, 2),
  ('scale', 'Scale', 'For established fashion houses', 7999, 79990,
   '{"products": 20000, "staff": 30, "storage_mb": 51200, "custom_domains": 3}', '{"custom_domains": true, "blog": true, "store_locator": true, "analytics_export": true}', 14, 3)
on conflict (code) do nothing;

insert into public.platform_settings (key, value) values
  ('signup.enabled', 'true'::jsonb),
  ('support.email', '"support@example.com"'::jsonb)
on conflict do nothing;

-- Supabase grants table privileges to API roles by default; RLS then restricts rows.
-- Stated explicitly so a fresh database behaves identically.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- Tables without any anon policy are still deny-by-default for anon thanks to RLS.

-- ===== supabase/migrations/20260924000700_rate_limits.sql =====
-- =============================================================================
-- 0700 RATE LIMITING (fixed window, Postgres-backed; ADR-025)
-- Edge rate limits (Cloudflare) handle volumetric abuse; this protects specific
-- actions (login, OTP, checkout, review/contact submissions) per key.
-- =============================================================================
create table public.rate_limit_counters (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_counters enable row level security; -- no policies: server only
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

create or replace function public.svc_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limit_counters as c (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;
  -- opportunistic cleanup of old windows (cheap, indexed)
  if random() < 0.01 then delete from public.rate_limit_counters where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.svc_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.svc_rate_limit(text, int, int) to service_role;
grant all on public.rate_limit_counters to service_role;

-- ===== supabase/migrations/20260924000800_catalog_admin.sql =====
-- =============================================================================
-- 0800 CATALOG ADMIN (Agent A)
-- =============================================================================
-- * public.save_product(tenant, payload)    atomic product + options + values + variants upsert
-- * public.set_collection_products(...)     atomic replace of a manual collection's product list
-- * public.inventory_overview(tenant)      per-variant stock with effective low-stock threshold
--
-- All functions are SECURITY DEFINER with search_path = '' and check
-- app.has_tenant_permission() themselves; every statement is scoped by tenant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- save_product
-- -----------------------------------------------------------------------------
-- Payload (validated with zod in the app first; re-checked here):
-- {
--   "id": uuid | null,                           -- null = create
--   "expected_updated_at": timestamptz | null,   -- optimistic concurrency for edits
--   "product": { title, slug, description, short_description, product_type, brand, category_id,
--                size_chart_id, status, featured, tags[], attributes{}, care_instructions,
--                shipping_info, return_info, hsn_code, seo{} },
--   "options": [ { "name": "Size", "values": [ { "value": "S", "swatch": "#aabbcc" | null } ] } ],   -- 0..3
--   "variants": [ { id?, option1?, option2?, option3?, sku?, barcode?, price, compare_at_price?,
--                   cost_price?, weight_grams?, track_inventory?, allow_backorder?,
--                   low_stock_threshold?, status?, initial_stock? } ]                              -- 1..250
-- }
-- Variants are matched by id first, then by option combination (so re-adding a removed
-- combination revives the old row and its stock history). Variants dropped from the payload
-- are deleted, or archived when they already appear on orders.
create or replace function public.save_product(p_tenant uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_p jsonb := coalesce(p_payload -> 'product', '{}'::jsonb);
  v_opts jsonb := coalesce(p_payload -> 'options', '[]'::jsonb);
  v_vars jsonb := coalesce(p_payload -> 'variants', '[]'::jsonb);
  v_expected timestamptz := nullif(p_payload ->> 'expected_updated_at', '')::timestamptz;
  v_nopts int;
  v_nvars int;
  v_current timestamptz;
  v_opt jsonb;
  v_opt_id uuid;
  v_var jsonb;
  v_vid uuid;
  v_target uuid;
  v_targets uuid[];
  v_claimed uuid[] := '{}';
  v_o text[];
  v_pos int;
  v_stock int;
  v_can_stock boolean;
  v_has_location boolean;
begin
  if p_tenant is null or not app.has_tenant_permission(p_tenant, 'catalog.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(v_opts) <> 'array' or jsonb_typeof(v_vars) <> 'array' or jsonb_typeof(v_p) <> 'object' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  v_nopts := jsonb_array_length(v_opts);
  v_nvars := jsonb_array_length(v_vars);
  if v_nopts > 3 then raise exception 'at most 3 options' using errcode = '22023', hint = 'TOO_MANY_OPTIONS'; end if;
  if v_nvars < 1 or v_nvars > 250 then raise exception 'between 1 and 250 variants' using errcode = '22023', hint = 'VARIANT_COUNT'; end if;
  if v_nopts = 0 and v_nvars <> 1 then raise exception 'a product without options has exactly one variant' using errcode = '22023', hint = 'VARIANT_COUNT'; end if;

  -- 1. product row ------------------------------------------------------------
  if v_id is null then
    insert into public.products (
      tenant_id, title, slug, description, short_description, product_type, brand, category_id, size_chart_id,
      status, featured, tags, attributes, care_instructions, shipping_info, return_info, hsn_code, seo
    ) values (
      p_tenant, v_p ->> 'title', v_p ->> 'slug', v_p ->> 'description', v_p ->> 'short_description',
      coalesce(v_p ->> 'product_type', 'other'), v_p ->> 'brand',
      nullif(v_p ->> 'category_id', '')::uuid, nullif(v_p ->> 'size_chart_id', '')::uuid,
      coalesce(v_p ->> 'status', 'draft'), coalesce((v_p ->> 'featured')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_p -> 'tags', '[]'::jsonb))), '{}'),
      coalesce(v_p -> 'attributes', '{}'::jsonb), v_p ->> 'care_instructions', v_p ->> 'shipping_info',
      v_p ->> 'return_info', v_p ->> 'hsn_code', coalesce(v_p -> 'seo', '{}'::jsonb)
    ) returning id into v_id;
  else
    select updated_at into v_current from public.products where id = v_id and tenant_id = p_tenant for update;
    if not found then raise exception 'product not found' using errcode = 'P0002'; end if;
    if v_expected is not null and v_current <> v_expected then
      raise exception 'product was changed by someone else' using errcode = 'P0001', hint = 'STALE_PRODUCT';
    end if;
    update public.products set
      title = v_p ->> 'title',
      slug = v_p ->> 'slug',
      description = v_p ->> 'description',
      short_description = v_p ->> 'short_description',
      product_type = coalesce(v_p ->> 'product_type', 'other'),
      brand = v_p ->> 'brand',
      category_id = nullif(v_p ->> 'category_id', '')::uuid,
      size_chart_id = nullif(v_p ->> 'size_chart_id', '')::uuid,
      status = coalesce(v_p ->> 'status', 'draft'),
      featured = coalesce((v_p ->> 'featured')::boolean, false),
      tags = coalesce(array(select jsonb_array_elements_text(coalesce(v_p -> 'tags', '[]'::jsonb))), '{}'),
      attributes = coalesce(v_p -> 'attributes', '{}'::jsonb),
      care_instructions = v_p ->> 'care_instructions',
      shipping_info = v_p ->> 'shipping_info',
      return_info = v_p ->> 'return_info',
      hsn_code = v_p ->> 'hsn_code',
      seo = coalesce(v_p -> 'seo', '{}'::jsonb),
      updated_at = now()
    where id = v_id and tenant_id = p_tenant;
  end if;

  -- 2. options + values (replaced wholesale; variants reference values by text) --
  delete from public.product_options where product_id = v_id and tenant_id = p_tenant;
  for i in 0 .. v_nopts - 1 loop
    v_opt := v_opts -> i;
    if jsonb_typeof(v_opt -> 'values') is distinct from 'array' or jsonb_array_length(v_opt -> 'values') = 0 then
      raise exception 'option % has no values', i + 1 using errcode = '22023', hint = 'OPTION_VALUES';
    end if;
    insert into public.product_options (tenant_id, product_id, position, name)
    values (p_tenant, v_id, i + 1, btrim(v_opt ->> 'name'))
    returning id into v_opt_id;
    insert into public.product_option_values (tenant_id, option_id, value, swatch, position)
    select p_tenant, v_opt_id, btrim(x ->> 'value'), nullif(x ->> 'swatch', ''), (t.ord - 1)::int
    from jsonb_array_elements(v_opt -> 'values') with ordinality as t(x, ord);
  end loop;

  -- 3. validate variant option values against the options ---------------------
  for k in 0 .. v_nvars - 1 loop
    v_var := v_vars -> k;
    v_o := array[nullif(btrim(v_var ->> 'option1'), ''), nullif(btrim(v_var ->> 'option2'), ''), nullif(btrim(v_var ->> 'option3'), '')];
    for v_pos in 1 .. 3 loop
      if v_pos <= v_nopts then
        if v_o[v_pos] is null or not exists (
          select 1 from public.product_option_values pov
          join public.product_options po on po.id = pov.option_id
          where po.product_id = v_id and po.position = v_pos and pov.value = v_o[v_pos]
        ) then
          raise exception 'variant % has an invalid value for option %', k + 1, v_pos using errcode = '22023', hint = 'VARIANT_OPTIONS';
        end if;
      elsif v_o[v_pos] is not null then
        raise exception 'variant % sets option % which does not exist', k + 1, v_pos using errcode = '22023', hint = 'VARIANT_OPTIONS';
      end if;
    end loop;
  end loop;
  if (select count(distinct (nullif(btrim(x ->> 'option1'), ''), nullif(btrim(x ->> 'option2'), ''), nullif(btrim(x ->> 'option3'), '')))
      from jsonb_array_elements(v_vars) x) <> v_nvars then
    raise exception 'duplicate variant combination' using errcode = '22023', hint = 'DUPLICATE_VARIANT';
  end if;

  -- 4. resolve which existing row each payload variant updates ------------------
  v_targets := array_fill(null::uuid, array[v_nvars]);
  -- 4a. explicit ids
  for k in 0 .. v_nvars - 1 loop
    v_vid := nullif(v_vars -> k ->> 'id', '')::uuid;
    if v_vid is not null then
      if not exists (select 1 from public.product_variants where id = v_vid and product_id = v_id and tenant_id = p_tenant) then
        raise exception 'variant not found' using errcode = 'P0002';
      end if;
      if v_vid = any (v_claimed) then raise exception 'variant listed twice' using errcode = '22023', hint = 'DUPLICATE_VARIANT'; end if;
      v_claimed := v_claimed || v_vid;
      v_targets[k + 1] := v_vid;
    end if;
  end loop;
  -- 4b. by option combination (revives removed/archived combinations)
  for k in 0 .. v_nvars - 1 loop
    if v_targets[k + 1] is null then
      v_var := v_vars -> k;
      select id into v_target from public.product_variants
      where product_id = v_id and tenant_id = p_tenant and id <> all (v_claimed)
        and option1 is not distinct from nullif(btrim(v_var ->> 'option1'), '')
        and option2 is not distinct from nullif(btrim(v_var ->> 'option2'), '')
        and option3 is not distinct from nullif(btrim(v_var ->> 'option3'), '')
      limit 1;
      if v_target is not null then
        v_claimed := v_claimed || v_target;
        v_targets[k + 1] := v_target;
      end if;
    end if;
  end loop;

  -- 5. variants no longer in the payload -------------------------------------
  -- delete unless sold; sold ones are archived (orders keep their own snapshot either way).
  -- A sold variant whose combination is being reused by another row must go, too.
  delete from public.product_variants r
  where r.product_id = v_id and r.tenant_id = p_tenant and r.id <> all (v_claimed)
    and (
      not exists (select 1 from public.order_items oi where oi.variant_id = r.id)
      or exists (
        select 1 from jsonb_array_elements(v_vars) x
        where nullif(btrim(x ->> 'option1'), '') is not distinct from r.option1
          and nullif(btrim(x ->> 'option2'), '') is not distinct from r.option2
          and nullif(btrim(x ->> 'option3'), '') is not distinct from r.option3
      )
    );
  update public.product_variants r set
    status = 'archived',
    sku = case when r.sku in (select x ->> 'sku' from jsonb_array_elements(v_vars) x where x ->> 'sku' is not null) then null else r.sku end
  where r.product_id = v_id and r.tenant_id = p_tenant and r.id <> all (v_claimed);

  -- 6. free unique keys on kept rows so values can be swapped between rows ------
  update public.product_variants set option1 = '~' || id::text, option2 = null, option3 = null, sku = null
  where id = any (v_claimed);

  -- 7. write variants ----------------------------------------------------------
  v_can_stock := app.has_tenant_permission(p_tenant, 'inventory.write');
  v_has_location := exists (select 1 from public.inventory_locations where tenant_id = p_tenant and is_default);
  for k in 0 .. v_nvars - 1 loop
    v_var := v_vars -> k;
    v_o := array[nullif(btrim(v_var ->> 'option1'), ''), nullif(btrim(v_var ->> 'option2'), ''), nullif(btrim(v_var ->> 'option3'), '')];
    if v_targets[k + 1] is not null then
      update public.product_variants set
        option1 = v_o[1], option2 = v_o[2], option3 = v_o[3],
        title = coalesce(nullif(array_to_string(v_o, ' / '), ''), 'Default'),
        sku = nullif(btrim(v_var ->> 'sku'), ''),
        barcode = nullif(btrim(v_var ->> 'barcode'), ''),
        price = (v_var ->> 'price')::numeric,
        compare_at_price = nullif(v_var ->> 'compare_at_price', '')::numeric,
        cost_price = nullif(v_var ->> 'cost_price', '')::numeric,
        weight_grams = coalesce((v_var ->> 'weight_grams')::int, 500),
        track_inventory = coalesce((v_var ->> 'track_inventory')::boolean, true),
        allow_backorder = coalesce((v_var ->> 'allow_backorder')::boolean, false),
        low_stock_threshold = nullif(v_var ->> 'low_stock_threshold', '')::int,
        status = coalesce(v_var ->> 'status', 'active'),
        position = k
      where id = v_targets[k + 1];
    else
      insert into public.product_variants (
        tenant_id, product_id, option1, option2, option3, title, sku, barcode, price, compare_at_price, cost_price,
        weight_grams, track_inventory, allow_backorder, low_stock_threshold, status, position
      ) values (
        p_tenant, v_id, v_o[1], v_o[2], v_o[3], coalesce(nullif(array_to_string(v_o, ' / '), ''), 'Default'),
        nullif(btrim(v_var ->> 'sku'), ''), nullif(btrim(v_var ->> 'barcode'), ''),
        (v_var ->> 'price')::numeric, nullif(v_var ->> 'compare_at_price', '')::numeric, nullif(v_var ->> 'cost_price', '')::numeric,
        coalesce((v_var ->> 'weight_grams')::int, 500), coalesce((v_var ->> 'track_inventory')::boolean, true),
        coalesce((v_var ->> 'allow_backorder')::boolean, false), nullif(v_var ->> 'low_stock_threshold', '')::int,
        coalesce(v_var ->> 'status', 'active'), k
      ) returning id into v_vid;
      v_stock := coalesce(nullif(v_var ->> 'initial_stock', '')::int, 0);
      if v_stock < 0 or v_stock > 1000000 then raise exception 'invalid quantity' using errcode = '22023'; end if;
      if v_stock > 0 and v_can_stock and v_has_location then
        perform app.apply_stock_delta(p_tenant, v_vid, null, v_stock, 'initial', 'manual', null, 'Opening stock');
      end if;
    end if;
  end loop;

  if coalesce(v_p ->> 'status', 'draft') = 'active'
     and not exists (select 1 from public.product_variants where product_id = v_id and status = 'active') then
    raise exception 'an active product needs at least one active variant' using errcode = '22023', hint = 'NO_ACTIVE_VARIANT';
  end if;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_collection_products: replace a manual collection's product list in order.
-- -----------------------------------------------------------------------------
create or replace function public.set_collection_products(p_collection uuid, p_product_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  select tenant_id into v_tenant from public.collections where id = p_collection;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'catalog.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_product_ids), 0) > 1000 then
    raise exception 'too many products' using errcode = '22023';
  end if;
  if (select count(*) from unnest(coalesce(p_product_ids, '{}')) u(id) join public.products p on p.id = u.id and p.tenant_id = v_tenant)
     <> (select count(distinct u.id) from unnest(coalesce(p_product_ids, '{}')) u(id))
     or cardinality(coalesce(p_product_ids, '{}')) <> (select count(distinct u.id) from unnest(coalesce(p_product_ids, '{}')) u(id)) then
    raise exception 'unknown or duplicate product' using errcode = '22023';
  end if;
  delete from public.collection_products where collection_id = p_collection and tenant_id = v_tenant;
  insert into public.collection_products (tenant_id, collection_id, product_id, position)
  select v_tenant, p_collection, u.id, u.ord::int
  from unnest(coalesce(p_product_ids, '{}')) with ordinality as u(id, ord);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.save_product(uuid, jsonb) from public, anon;
revoke all on function public.set_collection_products(uuid, uuid[]) from public, anon;
grant execute on function public.save_product(uuid, jsonb) to authenticated;
grant execute on function public.set_collection_products(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- inventory_overview(tenant): one row per variant with summed stock across locations and
-- the effective low-stock threshold (variant override -> store default -> 5).
-- SECURITY INVOKER (default) so the caller's RLS applies: stock levels need inventory.read.
-- Filter / sort / paginate the result with PostgREST (rpc(...).eq().order().range()).
-- -----------------------------------------------------------------------------
create or replace function public.inventory_overview(p_tenant uuid)
returns table (
  variant_id uuid,
  tenant_id uuid,
  product_id uuid,
  product_title text,
  product_status text,
  variant_title text,
  sku text,
  variant_status text,
  track_inventory boolean,
  allow_backorder boolean,
  "position" int,
  available int,
  reserved int,
  incoming int,
  low_stock_threshold int,
  out_of_stock boolean,
  low_stock boolean
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, v.tenant_id, v.product_id, p.title, p.status, v.title, v.sku, v.status,
    v.track_inventory, v.allow_backorder, v.position,
    coalesce(l.available, 0), coalesce(l.reserved, 0), coalesce(l.incoming, 0),
    coalesce(v.low_stock_threshold, s.low_stock_default, 5),
    (v.track_inventory and coalesce(l.available, 0) <= 0),
    (v.track_inventory and coalesce(l.available, 0) > 0
      and coalesce(l.available, 0) <= coalesce(v.low_stock_threshold, s.low_stock_default, 5))
  from public.product_variants v
  join public.products p on p.id = v.product_id
  left join public.stores s on s.tenant_id = v.tenant_id
  left join lateral (
    select sum(il.available)::int as available, sum(il.reserved)::int as reserved, sum(il.incoming)::int as incoming
    from public.inventory_levels il
    where il.variant_id = v.id
  ) l on true
  where v.tenant_id = p_tenant and app.has_tenant_permission(p_tenant, 'inventory.read');
$$;

revoke all on function public.inventory_overview(uuid) from public, anon;
grant execute on function public.inventory_overview(uuid) to authenticated, service_role;

-- ===== supabase/migrations/20260924000850_storefront_queries.sql =====
-- =============================================================================
-- 0850 STOREFRONT READ FUNCTIONS (Agent B — theme & storefront)
-- =============================================================================
-- Listing/search/filters need predicates over variants, option names and stock
-- (inventory_levels is staff-only), which PostgREST cannot express without N+1
-- queries or loading whole catalogs. These functions return ONLY ids/counts of
-- PUBLIC products (active, published, tenant open) for a tenant resolved on the
-- server from the verified host; card data is then read through RLS as `anon`.
-- No table changes.
-- =============================================================================

-- Automated collection rule evaluation (rules shape documented on public.collections).
-- Fields: product_type | tag | price | category | brand | featured | on_sale | attribute.<key>
-- Ops: eq | neq | in | lte | gte | contains
create or replace function app.product_matches_rules(
  p_type text, p_tags text[], p_min_price numeric, p_max_cmp numeric, p_category uuid,
  p_brand text, p_featured boolean, p_attributes jsonb, p_rules jsonb
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  c jsonb;
  v_field text; v_op text; v_val jsonb; v_hit boolean; v_any boolean;
  v_text text; v_num numeric; v_attr jsonb;
  v_hits int := 0; v_total int := 0;
begin
  if p_rules is null or jsonb_typeof(p_rules -> 'conditions') <> 'array' then return false; end if;
  v_any := coalesce(p_rules ->> 'match', 'all') = 'any';
  for c in select * from jsonb_array_elements(p_rules -> 'conditions') loop
    v_total := v_total + 1;
    v_field := c ->> 'field'; v_op := coalesce(c ->> 'op', 'eq'); v_val := c -> 'value';
    v_hit := false;
    begin
      if v_field = 'product_type' then
        v_text := p_type;
      elsif v_field = 'brand' then
        v_text := lower(coalesce(p_brand, ''));
      elsif v_field = 'category' then
        v_text := p_category::text;
      end if;

      if v_field in ('product_type', 'brand', 'category') then
        if v_op = 'eq' then v_hit := v_text = case when v_field = 'brand' then lower(v_val #>> '{}') else v_val #>> '{}' end;
        elsif v_op = 'neq' then v_hit := v_text is distinct from (v_val #>> '{}');
        elsif v_op = 'in' and jsonb_typeof(v_val) = 'array' then
          v_hit := exists (select 1 from jsonb_array_elements_text(v_val) x where (case when v_field = 'brand' then lower(x) else x end) = v_text);
        end if;
      elsif v_field = 'tag' then
        if v_op in ('eq', 'contains') then v_hit := (v_val #>> '{}') = any (p_tags);
        elsif v_op = 'neq' then v_hit := not ((v_val #>> '{}') = any (p_tags));
        elsif v_op = 'in' and jsonb_typeof(v_val) = 'array' then
          v_hit := exists (select 1 from jsonb_array_elements_text(v_val) x where x = any (p_tags));
        end if;
      elsif v_field = 'price' then
        v_num := (v_val #>> '{}')::numeric;
        if p_min_price is not null then
          if v_op = 'lte' then v_hit := p_min_price <= v_num;
          elsif v_op = 'gte' then v_hit := p_min_price >= v_num;
          elsif v_op = 'eq' then v_hit := p_min_price = v_num;
          end if;
        end if;
      elsif v_field = 'featured' then
        v_hit := p_featured = coalesce((v_val #>> '{}')::boolean, true);
        if v_op = 'neq' then v_hit := not v_hit; end if;
      elsif v_field = 'on_sale' then
        v_hit := (coalesce(p_max_cmp, 0) > coalesce(p_min_price, 0)) = coalesce((v_val #>> '{}')::boolean, true);
        if v_op = 'neq' then v_hit := not v_hit; end if;
      elsif v_field like 'attribute.%' then
        v_attr := p_attributes -> substr(v_field, 11);
        if v_attr is not null then
          if jsonb_typeof(v_attr) = 'array' then
            if v_op in ('eq', 'contains') then
              v_hit := exists (select 1 from jsonb_array_elements_text(v_attr) a where lower(a) = lower(v_val #>> '{}'));
            elsif v_op = 'in' and jsonb_typeof(v_val) = 'array' then
              v_hit := exists (select 1 from jsonb_array_elements_text(v_attr) a join jsonb_array_elements_text(v_val) x on lower(a) = lower(x));
            end if;
          else
            v_text := lower(v_attr #>> '{}');
            if v_op = 'eq' then v_hit := v_text = lower(v_val #>> '{}');
            elsif v_op = 'neq' then v_hit := v_text <> lower(v_val #>> '{}');
            elsif v_op = 'contains' then v_hit := position(lower(v_val #>> '{}') in v_text) > 0;
            elsif v_op = 'in' and jsonb_typeof(v_val) = 'array' then
              v_hit := exists (select 1 from jsonb_array_elements_text(v_val) x where lower(x) = v_text);
            end if;
          end if;
        end if;
      end if;
    exception when others then
      v_hit := false; -- malformed condition never matches
    end;
    if v_hit then v_hits := v_hits + 1; end if;
    if v_any and v_hit then return true; end if;
    if not v_any and not v_hit then return false; end if;
  end loop;
  if v_total = 0 then return false; end if; -- an empty automated collection shows nothing
  return not v_any or v_hits > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Product listing: filters + sort + pagination in one indexed query.
-- -----------------------------------------------------------------------------
create or replace function public.storefront_list_products(
  p_tenant uuid,
  p_collection uuid default null,
  p_category uuid default null,
  p_query text default null,
  p_product_ids uuid[] default null,
  p_product_types text[] default null,
  p_tags text[] default null,
  p_sizes text[] default null,
  p_colours text[] default null,
  p_fabrics text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default false,
  p_on_sale boolean default false,
  p_featured boolean default false,
  p_exclude uuid default null,
  p_sort text default 'featured',
  p_limit int default 24,
  p_offset int default 0
) returns table (product_id uuid, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coll public.collections%rowtype;
  v_sort text := coalesce(p_sort, 'featured');
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_tsq tsquery;
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_cats uuid[];
begin
  if p_tenant is null or not app.tenant_is_open(p_tenant) then return; end if;
  if v_q is not null then
    v_q := left(v_q, 100);
    begin
      v_tsq := websearch_to_tsquery('simple', v_q);
    exception when others then
      v_tsq := null;
    end;
  end if;

  if p_collection is not null then
    select * into v_coll from public.collections
    where id = p_collection and tenant_id = p_tenant and status = 'active' and (published_at is null or published_at <= now());
    if not found then return; end if;
    if v_sort = 'featured' then v_sort := coalesce(nullif(v_coll.sort_order, 'manual'), 'manual'); end if;
  end if;

  if p_category is not null then
    with recursive tree as (
      select c.id from public.categories c where c.id = p_category and c.tenant_id = p_tenant and c.status = 'active'
      union all
      select c.id from public.categories c join tree t on c.parent_id = t.id where c.tenant_id = p_tenant and c.status = 'active'
    )
    select array_agg(id) into v_cats from tree;
    if v_cats is null then return; end if;
  end if;

  return query
  with base as (
    select p.id, p.featured, p.published_at, p.min_price, p.sales_count, p.rating_avg, p.title,
           cp.position as coll_pos,
           case when v_q is null then 0
                else coalesce(ts_rank(p.search_vector, v_tsq), 0) + extensions.similarity(p.title, v_q) end as rank
    from public.products p
    left join public.collection_products cp
      on p_collection is not null and v_coll.type = 'manual' and cp.collection_id = p_collection and cp.product_id = p.id
    where p.tenant_id = p_tenant
      and p.status = 'active' and p.published_at <= now()
      and (p_collection is null or (
            (v_coll.type = 'manual' and cp.product_id is not null)
         or (v_coll.type = 'automated' and app.product_matches_rules(p.product_type, p.tags, p.min_price, p.max_compare_at_price, p.category_id, p.brand, p.featured, p.attributes, v_coll.rules))))
      and (v_cats is null or p.category_id = any (v_cats))
      and (p_product_ids is null or p.id = any (p_product_ids[1:200]))
      and (p_exclude is null or p.id <> p_exclude)
      and (p_product_types is null or cardinality(p_product_types) = 0 or p.product_type = any (p_product_types))
      and (p_tags is null or cardinality(p_tags) = 0 or p.tags && p_tags)
      and (p_min_price is null or p.min_price >= p_min_price)
      and (p_max_price is null or p.min_price <= p_max_price)
      and (not coalesce(p_on_sale, false) or coalesce(p.max_compare_at_price, 0) > coalesce(p.min_price, 0))
      and (not coalesce(p_featured, false) or p.featured)
      and (v_q is null
           or (v_tsq is not null and p.search_vector @@ v_tsq)
           or p.title operator(extensions.%) v_q
           or p.title ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (p_fabrics is null or cardinality(p_fabrics) = 0
           or lower(p.attributes ->> 'fabric') = any (select lower(x) from unnest(p_fabrics) x)
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) = 'fabric'
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_fabrics)))
      and (p_sizes is null or cardinality(p_sizes) = 0
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) = 'size'
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_sizes)))
      and (p_colours is null or cardinality(p_colours) = 0
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) in ('color', 'colour')
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_colours)))
      and (not coalesce(p_in_stock, false)
           or exists (select 1 from public.product_variants v
                      where v.product_id = p.id and v.status = 'active'
                        and (not v.track_inventory or v.allow_backorder
                             or exists (select 1 from public.inventory_levels l where l.variant_id = v.id and l.available > 0))))
  )
  select b.id, count(*) over ()
  from base b
  order by
    case when v_sort = 'relevance' then b.rank end desc nulls last,
    case when v_sort = 'manual' then b.coll_pos end asc nulls last,
    case when v_sort = 'price_asc' then b.min_price end asc nulls last,
    case when v_sort = 'price_desc' then b.min_price end desc nulls last,
    case when v_sort = 'best_selling' then b.sales_count end desc nulls last,
    case when v_sort = 'rating' then b.rating_avg end desc nulls last,
    case when v_sort = 'title_asc' then b.title end asc,
    case when v_sort in ('featured', 'manual') then b.featured end desc,
    b.published_at desc, b.id
  limit v_limit offset v_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- Facets for the filter UI, computed over the listing scope (collection /
-- category / search) before user filters are applied.
-- -----------------------------------------------------------------------------
create or replace function public.storefront_listing_facets(
  p_tenant uuid,
  p_collection uuid default null,
  p_category uuid default null,
  p_query text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_result jsonb;
begin
  select array_agg(product_id) into v_ids
  from public.storefront_list_products(p_tenant, p_collection, p_category, p_query, p_limit => 100, p_sort => 'newest');
  -- facets beyond the first 100 products are approximate by design (bounded cost)
  if v_ids is null then
    return jsonb_build_object('sizes', '[]'::jsonb, 'colours', '[]'::jsonb, 'fabrics', '[]'::jsonb, 'product_types', '[]'::jsonb, 'price_min', null, 'price_max', null);
  end if;

  with opts as (
    select lower(o.name) as oname, ov.value, ov.swatch, ov.position
    from public.product_options o
    join public.product_option_values ov on ov.option_id = o.id
    where o.product_id = any (v_ids)
  ),
  variant_vals as (
    select lower(o.name) as oname,
           case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end as value,
           v.position
    from public.product_variants v
    join public.product_options o on o.product_id = v.product_id
    where v.product_id = any (v_ids) and v.status = 'active'
  )
  select jsonb_build_object(
    'sizes', coalesce((select jsonb_agg(value order by pos) from (
        select value, min(position) as pos from variant_vals where oname = 'size' and value is not null group by value) s), '[]'::jsonb),
    'colours', coalesce((select jsonb_agg(jsonb_build_object('value', value, 'swatch', swatch) order by value) from (
        select vv.value, max(o.swatch) as swatch from variant_vals vv
        left join opts o on o.oname = vv.oname and o.value = vv.value
        where vv.oname in ('color', 'colour') and vv.value is not null group by vv.value) c), '[]'::jsonb),
    'fabrics', coalesce((select jsonb_agg(distinct f) from (
        select p.attributes ->> 'fabric' as f from public.products p where p.id = any (v_ids) and p.attributes ? 'fabric'
        union select value from variant_vals where oname = 'fabric' and value is not null) fx where f is not null), '[]'::jsonb),
    'product_types', coalesce((select jsonb_agg(distinct p.product_type) from public.products p where p.id = any (v_ids)), '[]'::jsonb),
    'price_min', (select min(p.min_price) from public.products p where p.id = any (v_ids)),
    'price_max', (select max(p.max_price) from public.products p where p.id = any (v_ids))
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- PIN code rule (pincode_rules is staff-only): longest matching prefix.
-- -----------------------------------------------------------------------------
create or replace function public.storefront_pincode_rule(p_tenant uuid, p_pincode text)
returns table (deliverable boolean, cod_allowed boolean, extra_days int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.deliverable, r.cod_allowed, r.extra_days
  from public.pincode_rules r
  where r.tenant_id = p_tenant
    and p_pincode ~ '^[1-9][0-9]{5}$'
    and app.tenant_is_open(p_tenant)
    and p_pincode like r.prefix || '%'
  order by char_length(r.prefix) desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Redirect lookup for unknown storefront paths (redirects is staff-only).
-- -----------------------------------------------------------------------------
create or replace function public.storefront_redirect(p_tenant uuid, p_path text)
returns table (to_path text, status_code smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.to_path, r.status_code
  from public.redirects r
  where r.tenant_id = p_tenant
    and app.tenant_is_open(p_tenant)
    and char_length(p_path) <= 500
    and r.from_path = p_path
  limit 1;
$$;

revoke all on function app.product_matches_rules(text, text[], numeric, numeric, uuid, text, boolean, jsonb, jsonb) from public;
grant execute on function app.product_matches_rules(text, text[], numeric, numeric, uuid, text, boolean, jsonb, jsonb) to anon, authenticated, service_role;

revoke all on function public.storefront_list_products(uuid, uuid, uuid, text, uuid[], text[], text[], text[], text[], text[], numeric, numeric, boolean, boolean, boolean, uuid, text, int, int) from public;
revoke all on function public.storefront_listing_facets(uuid, uuid, uuid, text) from public;
revoke all on function public.storefront_pincode_rule(uuid, text) from public;
revoke all on function public.storefront_redirect(uuid, text) from public;
grant execute on function public.storefront_list_products(uuid, uuid, uuid, text, uuid[], text[], text[], text[], text[], text[], numeric, numeric, boolean, boolean, boolean, uuid, text, int, int) to anon, authenticated, service_role;
grant execute on function public.storefront_listing_facets(uuid, uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.storefront_pincode_rule(uuid, text) to anon, authenticated, service_role;
grant execute on function public.storefront_redirect(uuid, text) to anon, authenticated, service_role;

-- ===== supabase/migrations/20260924000851_storefront_extras.sql =====
-- =============================================================================
-- 0851 STOREFRONT EXTRAS (Agent B — theme & storefront)
-- =============================================================================
-- 1. storefront_list_products / storefront_listing_facets gain an OCCASION filter
--    and facet (products.attributes.occasion is a text array, e.g. ["Festive"]).
-- 2. storefront_features(tenant): the storefront-relevant feature flags, resolved
--    override > plan > default (same precedence as src/features/platform/flags.ts),
--    for OPEN tenants only (tenant_feature_flags is not readable by shoppers).
-- 3. submit_review(): signed-in shoppers submit a review for a public product of the
--    host's tenant. Always saved as 'pending'; verified_purchase computed here from
--    delivered/completed orders of that shopper, never trusted from the client.
-- 4. svc_newsletter_subscribe(): service-role only (server action rate-limits first);
--    upserts a marketing-consented customer row for the tenant.
-- No table changes.
-- =============================================================================

drop function if exists public.storefront_listing_facets(uuid, uuid, uuid, text);
drop function if exists public.storefront_list_products(uuid, uuid, uuid, text, uuid[], text[], text[], text[], text[], text[], numeric, numeric, boolean, boolean, boolean, uuid, text, int, int);

create or replace function public.storefront_list_products(
  p_tenant uuid,
  p_collection uuid default null,
  p_category uuid default null,
  p_query text default null,
  p_product_ids uuid[] default null,
  p_product_types text[] default null,
  p_tags text[] default null,
  p_sizes text[] default null,
  p_colours text[] default null,
  p_fabrics text[] default null,
  p_occasions text[] default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default false,
  p_on_sale boolean default false,
  p_featured boolean default false,
  p_exclude uuid default null,
  p_sort text default 'featured',
  p_limit int default 24,
  p_offset int default 0
) returns table (product_id uuid, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coll public.collections%rowtype;
  v_sort text := coalesce(p_sort, 'featured');
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_tsq tsquery;
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_cats uuid[];
  v_occ text[];
begin
  if p_tenant is null or not app.tenant_is_open(p_tenant) then return; end if;
  if v_q is not null then
    v_q := left(v_q, 100);
    begin
      v_tsq := websearch_to_tsquery('simple', v_q);
    exception when others then
      v_tsq := null;
    end;
  end if;
  if p_occasions is not null and cardinality(p_occasions) > 0 then
    select array_agg(lower(x)) into v_occ from unnest(p_occasions[1:20]) x;
  end if;

  if p_collection is not null then
    select * into v_coll from public.collections
    where id = p_collection and tenant_id = p_tenant and status = 'active' and (published_at is null or published_at <= now());
    if not found then return; end if;
    if v_sort = 'featured' then v_sort := coalesce(nullif(v_coll.sort_order, 'manual'), 'manual'); end if;
  end if;

  if p_category is not null then
    with recursive tree as (
      select c.id, 1 as depth from public.categories c where c.id = p_category and c.tenant_id = p_tenant and c.status = 'active'
      union all
      select c.id, t.depth + 1 from public.categories c join tree t on c.parent_id = t.id
      where c.tenant_id = p_tenant and c.status = 'active' and t.depth < 6
    )
    select array_agg(id) into v_cats from tree;
    if v_cats is null then return; end if;
  end if;

  return query
  with base as (
    select p.id, p.featured, p.published_at, p.min_price, p.sales_count, p.rating_avg, p.title,
           cp.position as coll_pos,
           case when v_q is null then 0
                else coalesce(ts_rank(p.search_vector, v_tsq), 0) + extensions.similarity(p.title, v_q) end as rank
    from public.products p
    left join public.collection_products cp
      on p_collection is not null and v_coll.type = 'manual' and cp.collection_id = p_collection and cp.product_id = p.id
    where p.tenant_id = p_tenant
      and p.status = 'active' and p.published_at <= now()
      and (p_collection is null or (
            (v_coll.type = 'manual' and cp.product_id is not null)
         or (v_coll.type = 'automated' and app.product_matches_rules(p.product_type, p.tags, p.min_price, p.max_compare_at_price, p.category_id, p.brand, p.featured, p.attributes, v_coll.rules))))
      and (v_cats is null or p.category_id = any (v_cats))
      and (p_product_ids is null or p.id = any (p_product_ids[1:200]))
      and (p_exclude is null or p.id <> p_exclude)
      and (p_product_types is null or cardinality(p_product_types) = 0 or p.product_type = any (p_product_types))
      and (p_tags is null or cardinality(p_tags) = 0 or p.tags && p_tags)
      and (p_min_price is null or p.min_price >= p_min_price)
      and (p_max_price is null or p.min_price <= p_max_price)
      and (not coalesce(p_on_sale, false) or coalesce(p.max_compare_at_price, 0) > coalesce(p.min_price, 0))
      and (not coalesce(p_featured, false) or p.featured)
      and (v_q is null
           or (v_tsq is not null and p.search_vector @@ v_tsq)
           or p.title operator(extensions.%) v_q
           or p.title ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (v_occ is null
           or exists (select 1 from jsonb_array_elements_text(
                        case jsonb_typeof(p.attributes -> 'occasion')
                          when 'array' then p.attributes -> 'occasion'
                          when 'string' then jsonb_build_array(p.attributes ->> 'occasion')
                          else '[]'::jsonb end) o
                      where lower(o) = any (v_occ)))
      and (p_fabrics is null or cardinality(p_fabrics) = 0
           or lower(p.attributes ->> 'fabric') = any (select lower(x) from unnest(p_fabrics) x)
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) = 'fabric'
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_fabrics)))
      and (p_sizes is null or cardinality(p_sizes) = 0
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) = 'size'
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_sizes)))
      and (p_colours is null or cardinality(p_colours) = 0
           or exists (select 1 from public.product_variants v join public.product_options o on o.product_id = v.product_id and lower(o.name) in ('color', 'colour')
                      where v.product_id = p.id and v.status = 'active'
                        and (case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end) = any (p_colours)))
      and (not coalesce(p_in_stock, false)
           or exists (select 1 from public.product_variants v
                      where v.product_id = p.id and v.status = 'active'
                        and (not v.track_inventory or v.allow_backorder
                             or exists (select 1 from public.inventory_levels l where l.variant_id = v.id and l.available > 0))))
  )
  select b.id, count(*) over ()
  from base b
  order by
    case when v_sort = 'relevance' then b.rank end desc nulls last,
    case when v_sort = 'manual' then b.coll_pos end asc nulls last,
    case when v_sort = 'price_asc' then b.min_price end asc nulls last,
    case when v_sort = 'price_desc' then b.min_price end desc nulls last,
    case when v_sort = 'best_selling' then b.sales_count end desc nulls last,
    case when v_sort = 'rating' then b.rating_avg end desc nulls last,
    case when v_sort = 'title_asc' then b.title end asc,
    case when v_sort in ('featured', 'manual') then b.featured end desc,
    b.published_at desc, b.id
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.storefront_listing_facets(
  p_tenant uuid,
  p_collection uuid default null,
  p_category uuid default null,
  p_query text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_result jsonb;
begin
  select array_agg(product_id) into v_ids
  from public.storefront_list_products(p_tenant, p_collection, p_category, p_query, p_limit => 100, p_sort => 'newest');
  -- facets beyond the first 100 products are approximate by design (bounded cost)
  if v_ids is null then
    return jsonb_build_object('sizes', '[]'::jsonb, 'colours', '[]'::jsonb, 'fabrics', '[]'::jsonb, 'occasions', '[]'::jsonb,
                              'product_types', '[]'::jsonb, 'price_min', null, 'price_max', null);
  end if;

  with opts as (
    select lower(o.name) as oname, ov.value, ov.swatch, ov.position
    from public.product_options o
    join public.product_option_values ov on ov.option_id = o.id
    where o.product_id = any (v_ids)
  ),
  variant_vals as (
    select lower(o.name) as oname,
           case o.position when 1 then v.option1 when 2 then v.option2 else v.option3 end as value,
           v.position
    from public.product_variants v
    join public.product_options o on o.product_id = v.product_id
    where v.product_id = any (v_ids) and v.status = 'active'
  )
  select jsonb_build_object(
    'sizes', coalesce((select jsonb_agg(value order by pos) from (
        select value, min(position) as pos from variant_vals where oname = 'size' and value is not null group by value) s), '[]'::jsonb),
    'colours', coalesce((select jsonb_agg(jsonb_build_object('value', value, 'swatch', swatch) order by value) from (
        select vv.value, max(o.swatch) as swatch from variant_vals vv
        left join opts o on o.oname = vv.oname and o.value = vv.value
        where vv.oname in ('color', 'colour') and vv.value is not null group by vv.value) c), '[]'::jsonb),
    'fabrics', coalesce((select jsonb_agg(distinct f) from (
        select p.attributes ->> 'fabric' as f from public.products p where p.id = any (v_ids) and jsonb_typeof(p.attributes -> 'fabric') = 'string'
        union select value from variant_vals where oname = 'fabric' and value is not null) fx where f is not null), '[]'::jsonb),
    'occasions', coalesce((select jsonb_agg(distinct o) from (
        select jsonb_array_elements_text(p.attributes -> 'occasion') as o
        from public.products p where p.id = any (v_ids) and jsonb_typeof(p.attributes -> 'occasion') = 'array'
        union
        select p.attributes ->> 'occasion' from public.products p where p.id = any (v_ids) and jsonb_typeof(p.attributes -> 'occasion') = 'string') ox
        where o is not null and char_length(o) between 1 and 60), '[]'::jsonb),
    'product_types', coalesce((select jsonb_agg(distinct p.product_type) from public.products p where p.id = any (v_ids)), '[]'::jsonb),
    'price_min', (select min(p.min_price) from public.products p where p.id = any (v_ids)),
    'price_max', (select max(p.max_price) from public.products p where p.id = any (v_ids))
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storefront feature flags (resolved; open tenants only).
-- -----------------------------------------------------------------------------
create or replace function public.storefront_features(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, coalesce(
           o.enabled,
           case when jsonb_typeof(pl.features -> k.key) = 'boolean' then (pl.features ->> k.key)::boolean end,
           f.default_enabled,
           false)), '{}'::jsonb)
  from unnest(array['blog', 'store_locator', 'reviews', 'cod']) as k(key)
  join public.tenants t on t.id = p_tenant and t.status in ('trial', 'active')
  left join public.plans pl on pl.id = t.plan_id
  left join public.feature_flags f on f.key = k.key
  left join public.tenant_feature_flags o on o.tenant_id = t.id and o.feature_key = k.key;
$$;

-- -----------------------------------------------------------------------------
-- Review submission (signed-in shopper with a customer row in this tenant).
-- -----------------------------------------------------------------------------
create or replace function public.submit_review(
  p_tenant uuid, p_product uuid, p_rating int, p_title text, p_body text, p_author text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer uuid;
  v_order uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if not app.tenant_is_open(p_tenant) then raise exception 'store unavailable' using errcode = 'P0001', hint = 'TENANT_UNAVAILABLE'; end if;
  if coalesce((public.storefront_features(p_tenant) ->> 'reviews')::boolean, false) is not true then
    raise exception 'reviews are disabled' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where id = p_product and tenant_id = p_tenant and status = 'active' and published_at <= now()) then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid rating' using errcode = '22023'; end if;

  select id into v_customer from public.customers
  where tenant_id = p_tenant and auth_user_id = v_uid and status = 'active';
  if v_customer is null then raise exception 'customer account required' using errcode = '42501'; end if;

  select o.id into v_order
  from public.orders o
  join public.order_items oi on oi.order_id = o.id and oi.tenant_id = o.tenant_id
  where o.tenant_id = p_tenant and o.customer_id = v_customer and oi.product_id = p_product
    and o.status <> 'cancelled' and (o.fulfillment_status = 'delivered' or o.status = 'completed')
  order by o.placed_at desc
  limit 1;

  insert into public.reviews (tenant_id, product_id, customer_id, order_id, rating, title, body, author_name, status, verified_purchase)
  values (p_tenant, p_product, v_customer, v_order, p_rating,
          nullif(btrim(p_title), ''), nullif(btrim(p_body), ''), btrim(p_author), 'pending', v_order is not null)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Newsletter sign-up (service role only; the server action validates + rate limits).
-- -----------------------------------------------------------------------------
create or replace function public.svc_newsletter_subscribe(p_tenant uuid, p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not app.tenant_is_open(p_tenant) then raise exception 'store unavailable' using errcode = 'P0001', hint = 'TENANT_UNAVAILABLE'; end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  insert into public.customers (tenant_id, email, accepts_marketing, marketing_consent_at)
  values (p_tenant, v_email, true, now())
  on conflict (tenant_id, email) where email is not null
  do update set accepts_marketing = true,
                marketing_consent_at = coalesce(public.customers.marketing_consent_at, now());
end;
$$;

revoke all on function public.storefront_list_products(uuid, uuid, uuid, text, uuid[], text[], text[], text[], text[], text[], text[], numeric, numeric, boolean, boolean, boolean, uuid, text, int, int) from public;
revoke all on function public.storefront_listing_facets(uuid, uuid, uuid, text) from public;
revoke all on function public.storefront_features(uuid) from public;
revoke all on function public.submit_review(uuid, uuid, int, text, text, text) from public, anon;
revoke all on function public.svc_newsletter_subscribe(uuid, text) from public, anon, authenticated;

grant execute on function public.storefront_list_products(uuid, uuid, uuid, text, uuid[], text[], text[], text[], text[], text[], text[], numeric, numeric, boolean, boolean, boolean, uuid, text, int, int) to anon, authenticated, service_role;
grant execute on function public.storefront_listing_facets(uuid, uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.storefront_features(uuid) to anon, authenticated, service_role;
grant execute on function public.submit_review(uuid, uuid, int, text, text, text) to authenticated;
grant execute on function public.svc_newsletter_subscribe(uuid, text) to service_role;

-- ===== supabase/migrations/20260924000950_dashboard_ops.sql =====
-- =============================================================================
-- 0950 SELLER DASHBOARD OPS (Agent D)
--   * list_tenant_members(): team page needs member emails, which live in auth.users
--     (not readable through RLS). Returns rows only to callers with members.manage.
--   * replace_menu_items(): atomic save of a navigation menu tree (1 level of children).
--     SECURITY INVOKER, so the caller's RLS (content.write) applies to every statement.
-- =============================================================================

create or replace function public.list_tenant_members(p_tenant uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  role text,
  status text,
  display_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'members.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, m.role, m.status, p.display_name, u.email::text, m.created_at
    from public.tenant_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end, m.created_at;
end;
$$;

-- p_items: [{title, link_type, link_ref?, url?, highlight?, children?: [{title, link_type, link_ref?, url?, highlight?}]}]
create or replace function public.replace_menu_items(p_menu uuid, p_items jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_parent uuid;
  v_item jsonb;
  v_child jsonb;
  v_pos int := 0;
  v_cpos int;
  v_count int := 0;
begin
  select tenant_id into v_tenant from public.menus where id = p_menu;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'content.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid menu items' using errcode = '22023';
  end if;

  delete from public.menu_items where menu_id = p_menu;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.menu_items (tenant_id, menu_id, parent_id, title, link_type, link_ref, url, highlight, position)
    values (v_tenant, p_menu, null, v_item ->> 'title', v_item ->> 'link_type', nullif(v_item ->> 'link_ref', '')::uuid,
            nullif(v_item ->> 'url', ''), coalesce((v_item ->> 'highlight')::boolean, false), v_pos)
    returning id into v_parent;
    v_pos := v_pos + 1;
    v_count := v_count + 1;
    if jsonb_typeof(v_item -> 'children') = 'array' then
      if jsonb_array_length(v_item -> 'children') > 50 then
        raise exception 'invalid menu items' using errcode = '22023';
      end if;
      v_cpos := 0;
      for v_child in select * from jsonb_array_elements(v_item -> 'children') loop
        insert into public.menu_items (tenant_id, menu_id, parent_id, title, link_type, link_ref, url, highlight, position)
        values (v_tenant, p_menu, v_parent, v_child ->> 'title', v_child ->> 'link_type', nullif(v_child ->> 'link_ref', '')::uuid,
                nullif(v_child ->> 'url', ''), coalesce((v_child ->> 'highlight')::boolean, false), v_cpos);
        v_cpos := v_cpos + 1;
        v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  update public.menus set updated_at = now() where id = p_menu;
  return v_count;
end;
$$;

revoke all on function public.list_tenant_members(uuid) from public, anon;
revoke all on function public.replace_menu_items(uuid, jsonb) from public, anon;
grant execute on function public.list_tenant_members(uuid) to authenticated;
grant execute on function public.replace_menu_items(uuid, jsonb) to authenticated;

-- ===== supabase/migrations/20260924000951_dashboard_reports.sql =====
-- =============================================================================
-- 0951 SELLER DASHBOARD: REPORTS, INVOICES, DISCOUNT SAVE (Agent D)
--   * dashboard_sales_daily / dashboard_top_products / dashboard_funnel / dashboard_top_pages:
--     aggregate in Postgres so reports are correct beyond PostgREST's max-rows page size.
--     SECURITY INVOKER: the caller's RLS applies on top of the explicit analytics.read check.
--     Day buckets use IST (stores are India-only; see src/features/analytics/dates.ts).
--   * issue_order_invoice(): seller-facing wrapper around app.issue_invoice (orders.write).
--   * save_discount(): discount row + product/collection targets in one transaction.
-- =============================================================================

-- A sale is any order that is not cancelled and not still awaiting online payment
-- (mirrors countsAsSale() in src/features/analytics/metrics.ts).
create or replace function public.dashboard_sales_daily(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, orders int, revenue numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select (o.placed_at at time zone 'Asia/Kolkata')::date as day,
           count(*)::int as orders,
           coalesce(sum(o.grand_total), 0)::numeric as revenue
    from public.orders o
    where o.tenant_id = p_tenant
      and o.placed_at >= p_from and o.placed_at < p_to
      and o.status not in ('cancelled', 'pending')
    group by 1
    order by 1;
end;
$$;

create or replace function public.dashboard_top_products(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (product_id uuid, title text, units int, revenue numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select oi.product_id,
           (array_agg(oi.product_title order by o.placed_at desc))[1] as title,
           sum(oi.quantity)::int as units,
           coalesce(sum(oi.line_total), 0)::numeric as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.tenant_id = p_tenant
      and o.placed_at >= p_from and o.placed_at < p_to
      and o.status not in ('cancelled', 'pending')
    group by oi.product_id, case when oi.product_id is null then oi.product_title end
    order by revenue desc, units desc, title
    limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

-- Distinct sessions per funnel event. Events without a session id count individually.
create or replace function public.dashboard_funnel(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (event_name text, sessions int, events int)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select e.event_name,
           count(distinct coalesce(e.session_id, 'event:' || e.id::text))::int as sessions,
           count(*)::int as events
    from public.analytics_events e
    where e.tenant_id = p_tenant
      and e.occurred_at >= p_from and e.occurred_at < p_to
    group by e.event_name;
end;
$$;

create or replace function public.dashboard_top_pages(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_limit int default 20)
returns table (path text, views int, sessions int)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'analytics.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select x.p as path, count(*)::int as views, count(distinct coalesce(x.session_id, 'event:' || x.id::text))::int as sessions
    from (
      select e.id, e.session_id, left(coalesce(nullif(split_part(split_part(e.path, '?', 1), '#', 1), ''), '(unknown)'), 200) as p
      from public.analytics_events e
      where e.tenant_id = p_tenant
        and e.event_name = 'page_view'
        and e.occurred_at >= p_from and e.occurred_at < p_to
    ) x
    group by x.p
    order by views desc, path
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Issue (or return the existing) GST invoice for a confirmed order.
create or replace function public.issue_order_invoice(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_status text;
  v_existing uuid;
  v_id uuid;
begin
  select tenant_id, status into v_tenant, v_status from public.orders where id = p_order;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'orders.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_status in ('pending', 'cancelled') then
    raise exception 'only confirmed orders can be invoiced' using errcode = 'P0001', hint = 'NOT_INVOICEABLE';
  end if;
  select id into v_existing from public.invoices where order_id = p_order;
  v_id := app.issue_invoice(p_order);
  if v_existing is null then
    perform app.audit(v_tenant, 'invoice.issued', 'order', p_order::text, jsonb_build_object('invoice_id', v_id));
  end if;
  return v_id;
end;
$$;

-- p_discount: {code, title, type, value, applies_to, min_subtotal, max_discount, config, automatic,
--              starts_at, ends_at, usage_limit, per_customer_limit, status}
-- SECURITY INVOKER: RLS (marketing.write) applies to every statement; composite FKs keep
-- product/collection targets inside the tenant.
create or replace function public.save_discount(p_tenant uuid, p_id uuid, p_discount jsonb, p_product_ids uuid[], p_collection_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_tenant_permission(p_tenant, 'marketing.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_product_ids, 1), 0) > 500 or coalesce(array_length(p_collection_ids, 1), 0) > 500 then
    raise exception 'too many targets' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.discounts (tenant_id, code, title, type, value, applies_to, min_subtotal, max_discount, config, automatic,
                                  starts_at, ends_at, usage_limit, per_customer_limit, status)
    values (p_tenant, p_discount ->> 'code', p_discount ->> 'title', p_discount ->> 'type', coalesce((p_discount ->> 'value')::numeric, 0),
            coalesce(p_discount ->> 'applies_to', 'all'), coalesce((p_discount ->> 'min_subtotal')::numeric, 0), (p_discount ->> 'max_discount')::numeric,
            coalesce(p_discount -> 'config', '{}'::jsonb), coalesce((p_discount ->> 'automatic')::boolean, false),
            coalesce((p_discount ->> 'starts_at')::timestamptz, now()), (p_discount ->> 'ends_at')::timestamptz,
            (p_discount ->> 'usage_limit')::int, (p_discount ->> 'per_customer_limit')::int, coalesce(p_discount ->> 'status', 'active'))
    returning id into v_id;
  else
    update public.discounts set
      code = p_discount ->> 'code',
      title = p_discount ->> 'title',
      type = p_discount ->> 'type',
      value = coalesce((p_discount ->> 'value')::numeric, 0),
      applies_to = coalesce(p_discount ->> 'applies_to', 'all'),
      min_subtotal = coalesce((p_discount ->> 'min_subtotal')::numeric, 0),
      max_discount = (p_discount ->> 'max_discount')::numeric,
      config = coalesce(p_discount -> 'config', '{}'::jsonb),
      automatic = coalesce((p_discount ->> 'automatic')::boolean, false),
      starts_at = coalesce((p_discount ->> 'starts_at')::timestamptz, starts_at),
      ends_at = (p_discount ->> 'ends_at')::timestamptz,
      usage_limit = (p_discount ->> 'usage_limit')::int,
      per_customer_limit = (p_discount ->> 'per_customer_limit')::int,
      status = coalesce(p_discount ->> 'status', status)
    where id = p_id and tenant_id = p_tenant
    returning id into v_id;
    if v_id is null then
      raise exception 'discount not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.discount_products where discount_id = v_id;
  delete from public.discount_collections where discount_id = v_id;
  insert into public.discount_products (tenant_id, discount_id, product_id)
    select distinct p_tenant, v_id, x from unnest(coalesce(p_product_ids, '{}'::uuid[])) as x;
  insert into public.discount_collections (tenant_id, discount_id, collection_id)
    select distinct p_tenant, v_id, x from unnest(coalesce(p_collection_ids, '{}'::uuid[])) as x;
  return v_id;
end;
$$;

revoke all on function public.dashboard_sales_daily(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.dashboard_top_products(uuid, timestamptz, timestamptz, int) from public, anon;
revoke all on function public.dashboard_funnel(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.dashboard_top_pages(uuid, timestamptz, timestamptz, int) from public, anon;
revoke all on function public.issue_order_invoice(uuid) from public, anon;
revoke all on function public.save_discount(uuid, uuid, jsonb, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_sales_daily(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_top_products(uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.dashboard_funnel(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.dashboard_top_pages(uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.issue_order_invoice(uuid) to authenticated;
grant execute on function public.save_discount(uuid, uuid, jsonb, uuid[], uuid[]) to authenticated;

-- ===== supabase/migrations/20260924001000_platform_admin_domains.sql =====
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

-- ===== supabase/migrations/20260925001100_admin_tenant_stats.sql =====
-- Super admin tenant table: owner, catalogue size, orders and GMV for a page of tenants in ONE call
-- (avoids calling platform_tenant_counts once per row). Platform staff with usage.read only.

create or replace function public.platform_tenant_list_stats(p_tenants uuid[])
returns table (tenant_id uuid, owner_email text, products bigint, orders bigint, gmv numeric)
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
  select
    t.id,
    (select u.email::text
       from public.tenant_memberships m
       join auth.users u on u.id = m.user_id
      where m.tenant_id = t.id and m.role = 'owner'
      order by m.created_at
      limit 1),
    (select count(*) from public.products p where p.tenant_id = t.id),
    (select count(*) from public.orders o where o.tenant_id = t.id and o.status <> 'pending'),
    coalesce((select sum(o.grand_total) from public.orders o
               where o.tenant_id = t.id and o.status <> 'cancelled'
                 and o.payment_status in ('paid', 'partially_refunded', 'cod_pending')), 0)
  from public.tenants t
  where t.id = any(p_tenants[1:200]);
end;
$$;

revoke all on function public.platform_tenant_list_stats(uuid[]) from public, anon;
grant execute on function public.platform_tenant_list_stats(uuid[]) to authenticated;

-- ===== supabase/migrations/20260926001200_rbac.sql =====
-- =============================================================================
-- 1200 RBAC: more system roles, finer permissions, tenant-defined custom roles.
-- role_permissions MUST match src/lib/permissions/matrix.ts (tests/unit/permissions-sql.test.ts).
-- =============================================================================

-- 1. System roles ---------------------------------------------------------------
alter table public.role_permissions drop constraint role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check check (role in ('owner', 'admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer'));

delete from public.role_permissions;
insert into public.role_permissions (role, permission) values
-- owner
  ('owner','store.read'),('owner','catalog.read'),('owner','catalog.write'),('owner','catalog.delete'),('owner','catalog.publish'),('owner','inventory.read'),('owner','inventory.write'),('owner','orders.read'),('owner','orders.write'),('owner','orders.cancel'),('owner','orders.refund'),('owner','customers.read'),('owner','customers.write'),('owner','marketing.read'),('owner','marketing.write'),('owner','content.write'),('owner','theme.edit'),('owner','theme.publish'),('owner','reviews.moderate'),('owner','analytics.read'),('owner','settings.write'),('owner','payments.manage'),('owner','domains.manage'),('owner','members.read'),('owner','members.manage'),('owner','roles.manage'),('owner','billing.manage'),
  -- admin
  ('admin','store.read'),('admin','catalog.read'),('admin','inventory.read'),('admin','orders.read'),('admin','customers.read'),('admin','marketing.read'),('admin','analytics.read'),('admin','catalog.write'),('admin','catalog.delete'),('admin','catalog.publish'),('admin','inventory.write'),('admin','orders.write'),('admin','orders.cancel'),('admin','customers.write'),('admin','orders.refund'),('admin','marketing.write'),('admin','content.write'),('admin','theme.edit'),('admin','reviews.moderate'),('admin','members.read'),('admin','theme.publish'),('admin','settings.write'),('admin','payments.manage'),('admin','domains.manage'),('admin','members.manage'),('admin','roles.manage'),
  -- manager
  ('manager','store.read'),('manager','catalog.read'),('manager','inventory.read'),('manager','orders.read'),('manager','customers.read'),('manager','marketing.read'),('manager','analytics.read'),('manager','catalog.write'),('manager','catalog.delete'),('manager','catalog.publish'),('manager','inventory.write'),('manager','orders.write'),('manager','orders.cancel'),('manager','customers.write'),('manager','orders.refund'),('manager','marketing.write'),('manager','content.write'),('manager','theme.edit'),('manager','reviews.moderate'),('manager','members.read'),
  -- catalog_manager
  ('catalog_manager','store.read'),('catalog_manager','catalog.read'),('catalog_manager','catalog.write'),('catalog_manager','catalog.delete'),('catalog_manager','catalog.publish'),('catalog_manager','inventory.read'),('catalog_manager','inventory.write'),
  -- order_manager
  ('order_manager','store.read'),('order_manager','catalog.read'),('order_manager','inventory.read'),('order_manager','orders.read'),('order_manager','orders.write'),('order_manager','orders.cancel'),('order_manager','orders.refund'),('order_manager','customers.read'),('order_manager','customers.write'),
  -- inventory_manager
  ('inventory_manager','store.read'),('inventory_manager','catalog.read'),('inventory_manager','inventory.read'),('inventory_manager','inventory.write'),('inventory_manager','orders.read'),
  -- marketing_manager
  ('marketing_manager','store.read'),('marketing_manager','catalog.read'),('marketing_manager','customers.read'),('marketing_manager','marketing.read'),('marketing_manager','marketing.write'),('marketing_manager','reviews.moderate'),('marketing_manager','analytics.read'),
  -- content_manager
  ('content_manager','store.read'),('content_manager','catalog.read'),('content_manager','content.write'),('content_manager','theme.edit'),
  -- analyst
  ('analyst','store.read'),('analyst','catalog.read'),('analyst','inventory.read'),('analyst','orders.read'),('analyst','customers.read'),('analyst','marketing.read'),('analyst','analytics.read'),
  -- support_agent
  ('support_agent','store.read'),('support_agent','catalog.read'),('support_agent','orders.read'),('support_agent','orders.write'),('support_agent','customers.read'),('support_agent','customers.write'),('support_agent','reviews.moderate'),
  -- staff
  ('staff','store.read'),('staff','catalog.read'),('staff','inventory.read'),('staff','orders.read'),('staff','customers.read'),('staff','marketing.read'),('staff','analytics.read'),('staff','catalog.write'),('staff','catalog.delete'),('staff','catalog.publish'),('staff','inventory.write'),('staff','orders.write'),('staff','orders.cancel'),('staff','customers.write'),
  -- viewer
  ('viewer','store.read'),('viewer','catalog.read'),('viewer','inventory.read'),('viewer','orders.read'),('viewer','customers.read'),('viewer','marketing.read'),('viewer','analytics.read')
on conflict do nothing;

-- 2. Custom roles -----------------------------------------------------------------
create table public.tenant_custom_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (char_length(description) <= 240),
  permissions text[] not null default '{}'
    check (permissions <@ array['store.read', 'catalog.read', 'catalog.write', 'catalog.delete', 'catalog.publish', 'inventory.read', 'inventory.write', 'orders.read', 'orders.write', 'orders.cancel', 'orders.refund', 'customers.read', 'customers.write', 'marketing.read', 'marketing.write', 'content.write', 'theme.edit', 'theme.publish', 'reviews.moderate', 'analytics.read', 'settings.write', 'payments.manage', 'domains.manage', 'members.read', 'members.manage', 'roles.manage', 'billing.manage']::text[] and not ('billing.manage' = any (permissions))),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index tenant_custom_roles_name_key on public.tenant_custom_roles (tenant_id, lower(btrim(name)));
select app.add_standard_triggers('public.tenant_custom_roles');
alter table public.tenant_custom_roles enable row level security;

-- 3. Memberships & invitations can point at a custom role ------------------------
alter table public.tenant_memberships drop constraint tenant_memberships_role_check;
alter table public.tenant_memberships
  add constraint tenant_memberships_role_check check (role in ('owner', 'admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer', 'custom')),
  add column custom_role_id uuid,
  add constraint tenant_memberships_custom_role_fk foreign key (tenant_id, custom_role_id) references public.tenant_custom_roles (tenant_id, id) on delete restrict,
  add constraint tenant_memberships_custom_role_check check ((role = 'custom') = (custom_role_id is not null));

alter table public.tenant_invitations drop constraint tenant_invitations_role_check;
alter table public.tenant_invitations
  add constraint tenant_invitations_role_check check (role in ('admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer', 'custom')),
  add column custom_role_id uuid,
  add constraint tenant_invitations_custom_role_fk foreign key (tenant_id, custom_role_id) references public.tenant_custom_roles (tenant_id, id) on delete cascade,
  add constraint tenant_invitations_custom_role_check check ((role = 'custom') = (custom_role_id is not null));

-- 4. Permission check now understands custom roles --------------------------------
create or replace function app.has_tenant_permission(p_tenant uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        (m.custom_role_id is null and exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = p_perm))
        or (m.custom_role_id is not null and exists (select 1 from public.tenant_custom_roles cr where cr.id = m.custom_role_id and p_perm = any (cr.permissions)))
      )
  )
  or exists (
    select 1
    from public.support_sessions s
    join public.role_permissions rp on rp.role = 'viewer' and rp.permission = p_perm
    where s.tenant_id = p_tenant
      and s.platform_user_id = (select auth.uid())
      and s.ended_at is null
      and s.expires_at > now()
  );
$$;

/** Permissions granted by a system role or custom role. */
create or replace function app.role_grants(p_role text, p_custom uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_custom is not null then (select permissions from public.tenant_custom_roles where id = p_custom)
    else coalesce((select array_agg(permission) from public.role_permissions where role = p_role), '{}')
  end;
$$;

/** True when the caller holds every permission in p_perms for the tenant (no privilege escalation). */
create or replace function app.caller_holds_all(p_tenant uuid, p_perms text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(app.has_tenant_permission(p_tenant, p)), true) from unnest(p_perms) p;
$$;

-- 5. Guards (skipped for service role / migrations where auth.uid() is null) --------
create or replace function app.guard_custom_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.caller_holds_all(new.tenant_id, new.permissions) then
    raise exception 'you can only grant permissions you hold yourself' using errcode = '42501';
  end if;
  new.permissions := array(select distinct unnest(new.permissions) order by 1);
  return new;
end;
$$;
create trigger trg_tenant_custom_roles_guard before insert or update on public.tenant_custom_roles
  for each row execute function app.guard_custom_role();

create or replace function app.guard_membership_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.custom_role_id is not distinct from old.custom_role_id then
    return new;
  end if;
  -- Nested IFs: PL/pgSQL does not short-circuit AND, and invitations have no user_id.
  if tg_table_name = 'tenant_memberships' and tg_op = 'UPDATE' then
    if old.user_id = (select auth.uid()) then
      raise exception 'you cannot change your own role' using errcode = '42501';
    end if;
  end if;
  if not app.caller_holds_all(new.tenant_id, app.role_grants(new.role, new.custom_role_id)) then
    raise exception 'you cannot assign a role with permissions you do not hold' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_tenant_memberships_role_guard before update on public.tenant_memberships
  for each row execute function app.guard_membership_role();
create trigger trg_tenant_invitations_role_guard before insert or update on public.tenant_invitations
  for each row execute function app.guard_membership_role();

create or replace function app.audit_custom_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.audit(coalesce(new.tenant_id, old.tenant_id),
    case tg_op when 'INSERT' then 'role.created' when 'UPDATE' then 'role.updated' else 'role.deleted' end,
    'custom_role', coalesce(new.id, old.id)::text,
    jsonb_build_object('name', coalesce(new.name, old.name), 'permissions', coalesce(to_jsonb(new.permissions), to_jsonb(old.permissions))));
  return coalesce(new, old);
end;
$$;
create trigger trg_tenant_custom_roles_audit after insert or update or delete on public.tenant_custom_roles
  for each row execute function app.audit_custom_role();

-- 6. RLS for custom roles -----------------------------------------------------------
create policy custom_roles_select on public.tenant_custom_roles for select to authenticated
  using (app.has_tenant_permission(tenant_id, 'store.read') or app.has_platform_permission('platform.tenants.read'));
create policy custom_roles_write on public.tenant_custom_roles for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'roles.manage'))
  with check (app.has_tenant_permission(tenant_id, 'roles.manage'));
grant select, insert, update, delete on public.tenant_custom_roles to authenticated;
grant all on public.tenant_custom_roles to service_role;

-- 7. catalog.delete: deletes need their own permission ------------------------------
drop policy products_staff_write on public.products;
create policy products_staff_insert on public.products for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy products_staff_update on public.products for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy products_staff_delete on public.products for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

drop policy collections_staff_write on public.collections;
create policy collections_staff_insert on public.collections for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy collections_staff_update on public.collections for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy collections_staff_delete on public.collections for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

drop policy categories_staff_write on public.categories;
create policy categories_staff_insert on public.categories for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy categories_staff_update on public.categories for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy categories_staff_delete on public.categories for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

-- 8. catalog.publish: making a product live needs its own permission ----------------
create or replace function app.guard_product_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and (select auth.uid()) is not null
     and not app.has_tenant_permission(new.tenant_id, 'catalog.publish') then
    raise exception 'you do not have permission to publish products' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_products_publish_guard before insert or update of status on public.products
  for each row execute function app.guard_product_publish();

-- 9. orders.cancel ----------------------------------------------------------------------
create or replace function public.cancel_order(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.orders where id = p_order;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'orders.cancel') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform app.cancel_order_internal(p_order, p_reason, (select auth.uid()));
  perform app.audit(v_tenant, 'order.cancelled', 'order', p_order::text, jsonb_build_object('reason', p_reason));
end;
$$;

-- 10. Invitations carry custom roles; accepting never downgrades an owner ------------
create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  inv public.tenant_invitations%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_user;

  select * into inv from public.tenant_invitations
  where token_hash = p_token_hash and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invitation is invalid or expired' using errcode = 'P0002'; end if;
  if inv.email <> v_email then raise exception 'invitation was sent to a different email address' using errcode = '42501'; end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, custom_role_id, invited_by)
  values (inv.tenant_id, v_user, inv.role, inv.custom_role_id, inv.invited_by)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role, custom_role_id = excluded.custom_role_id, status = 'active'
    where public.tenant_memberships.role <> 'owner';
  update public.tenant_invitations set accepted_at = now() where id = inv.id;
  perform app.audit(inv.tenant_id, 'member.joined', 'membership', v_user::text, jsonb_build_object('role', inv.role, 'custom_role_id', inv.custom_role_id));
  return inv.tenant_id;
end;
$$;

-- 11. Team list: members.read, custom role name, last sign-in -----------------------
drop function public.list_tenant_members(uuid);
create function public.list_tenant_members(p_tenant uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  role text,
  custom_role_id uuid,
  custom_role_name text,
  status text,
  display_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_tenant_permission(p_tenant, 'members.read') or app.has_tenant_permission(p_tenant, 'members.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, m.role, m.custom_role_id, cr.name, m.status, p.display_name, u.email::text, m.created_at, u.last_sign_in_at
    from public.tenant_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    left join public.tenant_custom_roles cr on cr.id = m.custom_role_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end, m.created_at;
end;
$$;
revoke all on function public.list_tenant_members(uuid) from public, anon;
grant execute on function public.list_tenant_members(uuid) to authenticated;

revoke all on function app.role_grants(text, uuid), app.caller_holds_all(uuid, text[]) from public;
grant execute on function app.role_grants(text, uuid), app.caller_holds_all(uuid, text[]) to authenticated, service_role;

-- ===== supabase/migrations/20260926001300_media_library.sql =====
-- =============================================================================
-- 1300 MEDIA LIBRARY: folders, original filenames, usage lookup before delete.
-- Files live in storage bucket store-assets under tenant/{tenant_id}/… (storage RLS already
-- enforces the tenant prefix + permission); media_assets is the catalogue of those files.
-- =============================================================================

alter table public.media_assets
  add column filename text check (char_length(filename) <= 200),
  add column folder text not null default 'general' check (folder ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  add column updated_at timestamptz not null default now();
create trigger trg_media_assets_updated_at before update on public.media_assets for each row execute function app.set_updated_at();
create index media_assets_folder_idx on public.media_assets (tenant_id, folder, created_at desc);

-- Existing rows: folder from the upload area in the path (tenant/{id}/{area}/…).
update public.media_assets
set folder = case split_part(storage_path, '/', 3)
  when 'products' then 'products' when 'collections' then 'collections' when 'categories' then 'categories'
  when 'theme' then 'theme' when 'pages' then 'content' when 'blog' then 'content' when 'brand' then 'brand'
  else 'general' end;

-- Theme editors upload images too (storage already allows theme.edit).
drop policy media_assets_staff_write on public.media_assets;
create policy media_assets_staff_write on public.media_assets for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write') or app.has_tenant_permission(tenant_id, 'theme.edit'))
  with check (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write') or app.has_tenant_permission(tenant_id, 'theme.edit'));

-- Where a file is referenced (so the library can warn before deleting). Staff of the tenant only.
create or replace function public.media_usage(p_tenant uuid, p_path text)
returns table (kind text, label text, ref_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'store.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 2) <> p_tenant::text then
    return;
  end if;
  return query
    select 'product'::text, p.title, p.id::text from public.product_media m join public.products p on p.id = m.product_id where m.tenant_id = p_tenant and m.storage_path = p_path
    union all select 'category', c.name, c.id::text from public.categories c where c.tenant_id = p_tenant and c.image_path = p_path
    union all select 'collection', c.title, c.id::text from public.collections c where c.tenant_id = p_tenant and c.image_path = p_path
    union all select 'menu', i.title, i.id::text from public.menu_items i where i.tenant_id = p_tenant and i.image_path = p_path
    union all select 'blog', b.title, b.id::text from public.blog_posts b where b.tenant_id = p_tenant and (b.cover_path = p_path or position(p_path in b.body::text) > 0)
    union all select 'page', g.title, g.id::text from public.pages g where g.tenant_id = p_tenant and position(p_path in g.body::text) > 0
    union all select 'brand', case when s.logo_path = p_path then 'Store logo' else 'Favicon' end, s.tenant_id::text from public.stores s where s.tenant_id = p_tenant and (s.logo_path = p_path or s.favicon_path = p_path)
    union all select 'theme', case t.status when 'published' then 'Live theme' else 'Theme draft' end, t.id::text from public.theme_versions t
      where t.tenant_id = p_tenant and t.status in ('draft', 'published') and position(p_path in t.config::text) > 0;
end;
$$;
revoke all on function public.media_usage(uuid, text) from public, anon;
grant execute on function public.media_usage(uuid, text) to authenticated;

-- ===== supabase/migrations/20260926001400_platform_dashboard.sql =====
-- =============================================================================
-- 1400 PLATFORM DASHBOARD: one call for the super-admin home (people, storage, 6-month GMV/orders,
-- plan distribution, recent platform activity). Platform staff with tenants.read only.
-- =============================================================================

create or replace function public.platform_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first date := (date_trunc('month', now()) - interval '5 months')::date;
begin
  if not app.has_platform_permission('platform.tenants.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'sellers', (select count(distinct user_id) from public.tenant_memberships where status = 'active'),
    'customers', (select count(*) from public.customers),
    'staff', (select count(*) from public.platform_memberships where status = 'active'),
    'storage_bytes', (select coalesce(sum(bytes), 0) from public.media_assets),
    'storage_files', (select count(*) from public.media_assets),
    'orders_all_time', (select count(*) from public.orders where status <> 'pending'),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'gmv', coalesce(g.gmv, 0), 'orders', coalesce(g.orders, 0), 'new_stores', coalesce(n.cnt, 0)) order by m.month)
      from (select generate_series(v_first, date_trunc('month', now())::date, interval '1 month')::date as month) m
      left join (
        select period_start, sum(value) filter (where metric = 'gmv') as gmv, sum(value) filter (where metric = 'orders') as orders
        from public.tenant_usage where period_start >= v_first group by period_start
      ) g on g.period_start = m.month
      left join (
        select date_trunc('month', created_at)::date as month, count(*) as cnt from public.tenants where created_at >= v_first group by 1
      ) n on n.month = m.month
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(p.name, 'No plan'), 'count', x.cnt) order by x.cnt desc)
      from (select plan_id, count(*) as cnt from public.tenants where status in ('trial', 'active') group by plan_id) x
      left join public.plans p on p.id = x.plan_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.platform_dashboard() from public, anon;
grant execute on function public.platform_dashboard() to authenticated;

-- ===== supabase/migrations/20260927001500_platform_control.sql =====
-- =============================================================================
-- 1500 PLATFORM CONTROL: integrations (payments, shipping, tracking, social), theme marketplace,
-- social posts, creative studio, attribution, and the super-admin store list.
-- =============================================================================

-- 1. Integrations: one row per tenant+provider. Secrets are AES-256-GCM ciphertext written by the
--    server (lib/crypto encryptSecret) and never readable through the API: RLS is on with NO policies,
--    so only the secret-key client (server, after an explicit permission check) touches this table.
create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('payment', 'shipping', 'tracking', 'social')),
  provider text not null check (provider in ('razorpay', 'cashfree', 'payu', 'shiprocket', 'delhivery', 'ga4', 'google_ads', 'meta_pixel', 'facebook', 'instagram', 'pinterest', 'youtube')),
  enabled boolean not null default false,
  environment text not null default 'test' check (environment in ('test', 'live')),
  public_config jsonb not null default '{}'::jsonb,
  secrets_encrypted text,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error', 'expired', 'disabled')),
  status_message text check (char_length(status_message) <= 300),
  last_verified_at timestamptz,
  connected_at timestamptz,
  expires_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);
create trigger trg_tenant_integrations_updated_at before update on public.tenant_integrations for each row execute function app.set_updated_at();
alter table public.tenant_integrations enable row level security;
revoke all on public.tenant_integrations from anon, authenticated;
grant all on public.tenant_integrations to service_role;

-- Existing Razorpay settings move across (same ciphertext; key secret + webhook secret as JSON is
-- written by the app on next save, so keep the legacy columns readable until then).
insert into public.tenant_integrations (tenant_id, kind, provider, enabled, environment, public_config, secrets_encrypted, status, connected_at)
select tenant_id, 'payment', 'razorpay', enabled, mode,
       jsonb_build_object('key_id', key_id, 'legacy', true),
       null,
       case when key_id is not null and key_secret_encrypted is not null then (case when enabled then 'connected' else 'disabled' end) else 'not_connected' end,
       case when key_id is not null then updated_at end
from public.tenant_payment_settings
on conflict (tenant_id, provider) do nothing;

-- Analytics IDs previously kept in stores.integrations.analytics (never injected) move across as
-- saved-but-disabled tags, so sellers re-enable them deliberately in Settings -> Analytics.
insert into public.tenant_integrations (tenant_id, kind, provider, enabled, environment, public_config, status, status_message)
select tenant_id, 'tracking', 'ga4', false, 'live', jsonb_build_object('measurement_id', integrations->'analytics'->>'ga4'), 'connected', 'ID saved. Enable it to start tracking.'
from public.stores where integrations->'analytics'->>'ga4' ~ '^G-[A-Z0-9]{4,16}$'
on conflict (tenant_id, provider) do nothing;
insert into public.tenant_integrations (tenant_id, kind, provider, enabled, environment, public_config, status, status_message)
select tenant_id, 'tracking', 'meta_pixel', false, 'live', jsonb_build_object('pixel_id', integrations->'analytics'->>'meta_pixel'), 'connected', 'ID saved. Enable it to start tracking.'
from public.stores where integrations->'analytics'->>'meta_pixel' ~ '^[0-9]{10,20}$'
on conflict (tenant_id, provider) do nothing;

-- 2. New providers in payment/shipment records.
alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('cod', 'razorpay', 'cashfree', 'payu', 'manual'));
alter table public.shipments drop constraint shipments_provider_check;
alter table public.shipments add constraint shipments_provider_check check (provider in ('manual', 'shiprocket', 'delhivery'));

-- 3. Campaign attribution (utm_*, gclid, fbclid, landing path, first-touch time). No personal data.
alter table public.orders add column attribution jsonb not null default '{}'::jsonb;
alter table public.customers add column attribution jsonb not null default '{}'::jsonb;

-- 4. Feature flags for the new modules (super admin can override per tenant).
insert into public.feature_flags (key, description, default_enabled) values
  ('payments_cashfree', 'Cashfree online payments', true),
  ('payments_payu', 'PayU online payments', true),
  ('delhivery', 'Delhivery shipping integration', true),
  ('theme_marketplace', 'Theme marketplace', true),
  ('google_analytics', 'Google Analytics 4 tracking', true),
  ('google_ads', 'Google Ads conversion tracking', true),
  ('meta_pixel', 'Meta Pixel tracking', true),
  ('social_media', 'Social media hub', true),
  ('creative_studio', 'Creative studio', true)
on conflict (key) do nothing;
update public.feature_flags set default_enabled = true, description = 'Shiprocket shipping integration' where key = 'shiprocket';
update public.feature_flags set description = 'Razorpay online payments' where key = 'online_payments';

-- 5. Theme marketplace. Presets are platform-managed; applying one copies its config into the store's
--    draft (theme_versions), so products, orders, media and SEO are never touched.
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  tagline text check (char_length(tagline) <= 160),
  description text check (char_length(description) <= 2000),
  category text not null check (char_length(category) <= 40),
  tags text[] not null default '{}',
  features text[] not null default '{}',
  supported_sections text[] not null default '{}',
  config jsonb not null,
  preview_paths text[] not null default '{}',
  demo_host text,
  version text not null default '1.0.0',
  author text not null default 'The Paliya',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_themes_updated_at before update on public.themes for each row execute function app.set_updated_at();
alter table public.themes enable row level security;
create policy themes_read on public.themes for select to anon, authenticated using (active or app.has_platform_permission('platform.settings.manage'));
create policy themes_platform_write on public.themes for all to authenticated
  using (app.has_platform_permission('platform.settings.manage')) with check (app.has_platform_permission('platform.settings.manage'));
grant select on public.themes to anon, authenticated;
grant insert, update, delete on public.themes to authenticated;
grant all on public.themes to service_role;

-- 6. Social posts (tokens live in tenant_integrations, encrypted).
create or replace function app.paths_in_tenant(p_paths text[], p_tenant uuid)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(split_part(x, '/', 1) = 'tenant' and split_part(x, '/', 2) = p_tenant::text), true) from unnest(p_paths) x;
$$;
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  hashtags text[] not null default '{}',
  media_paths text[] not null default '{}' check (cardinality(media_paths) <= 10),
  product_id uuid,
  link_url text check (char_length(link_url) <= 500),
  platforms text[] not null default '{}' check (platforms <@ array['facebook', 'instagram', 'pinterest']::text[]),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  results jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (app.paths_in_tenant(media_paths, tenant_id)),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete set null (product_id)
);
create trigger trg_social_posts_updated_at before update on public.social_posts for each row execute function app.set_updated_at();
create index social_posts_due_idx on public.social_posts (scheduled_at) where status = 'scheduled';
alter table public.social_posts enable row level security;
create policy social_posts_read on public.social_posts for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy social_posts_write on public.social_posts for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
grant select, insert, update, delete on public.social_posts to authenticated;
grant all on public.social_posts to service_role;

-- 7. Creative studio: versioned platform templates (elements JSON) + tenant creatives.
create table public.creative_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9-]{2,40}$'),
  version int not null default 1,
  name text not null,
  category text not null check (category in ('new_arrival', 'sale', 'festival', 'product_highlight', 'collection_launch', 'bestseller', 'limited_edition', 'discount', 'announcement')),
  width int not null check (width between 200 and 4000),
  height int not null check (height between 200 and 4000),
  elements jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (key, version)
);
alter table public.creative_templates enable row level security;
create policy creative_templates_read on public.creative_templates for select to authenticated using (true);
create policy creative_templates_platform_write on public.creative_templates for all to authenticated
  using (app.has_platform_permission('platform.settings.manage')) with check (app.has_platform_permission('platform.settings.manage'));
grant select on public.creative_templates to authenticated;
grant insert, update, delete on public.creative_templates to authenticated;
grant all on public.creative_templates to service_role;

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template_key text not null,
  template_version int not null,
  name text not null check (char_length(name) between 1 and 120),
  values jsonb not null default '{}'::jsonb,
  output_path text check (output_path is null or split_part(output_path, '/', 2) = tenant_id::text),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create trigger trg_creatives_updated_at before update on public.creatives for each row execute function app.set_updated_at();
alter table public.creatives enable row level security;
create policy creatives_read on public.creatives for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy creatives_write on public.creatives for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
grant select, insert, update, delete on public.creatives to authenticated;
grant all on public.creatives to service_role;

-- 8. Super admin store list: search (name, slug, owner email, domain, tenant id), filters, server-side
--    sort + pagination, one call. Platform staff with tenants.read only.
create or replace function public.platform_list_stores(
  p_q text default null, p_status text default null, p_plan uuid default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_sort text default 'newest', p_limit int default 25, p_offset int default 0
)
returns table (
  tenant_id uuid, name text, slug text, status text, plan_name text, created_at timestamptz,
  owner_email text, primary_domain text, products bigint, orders bigint, customers bigint,
  revenue numeric, last_activity timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not app.has_platform_permission('platform.tenants.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with base as (
    select t.id, t.name, t.slug, t.status, p.name as plan_name, t.created_at,
      (select u.email::text from public.tenant_memberships m join auth.users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
      (select d.hostname from public.domains d where d.tenant_id = t.id and d.is_primary limit 1) as primary_domain
    from public.tenants t
    left join public.plans p on p.id = t.plan_id
    where (p_status is null or t.status = p_status)
      and (p_plan is null or t.plan_id = p_plan)
      and (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at < p_to)
  ), filtered as (
    select b.* from base b
    where v_q is null
       or b.name ilike '%' || v_q || '%' or b.slug ilike '%' || v_q || '%'
       or b.owner_email ilike '%' || v_q || '%' or b.primary_domain ilike '%' || v_q || '%'
       or b.id::text = lower(v_q)
       or exists (select 1 from public.domains d where d.tenant_id = b.id and d.hostname ilike '%' || v_q || '%')
  ), stats as (
    select f.*,
      (select count(*) from public.products x where x.tenant_id = f.id) as products,
      (select count(*) from public.orders o where o.tenant_id = f.id and o.status <> 'pending') as orders,
      (select count(*) from public.customers c where c.tenant_id = f.id) as customers,
      coalesce((select sum(o.grand_total) from public.orders o where o.tenant_id = f.id and o.status <> 'cancelled'
                 and o.payment_status in ('paid', 'partially_refunded', 'cod_pending')), 0) as revenue,
      greatest(
        (select max(o.placed_at) from public.orders o where o.tenant_id = f.id),
        (select max(a.created_at) from public.audit_logs a where a.tenant_id = f.id),
        f.created_at
      ) as last_activity
    from filtered f
  )
  select s.id, s.name, s.slug, s.status, s.plan_name, s.created_at, s.owner_email, s.primary_domain,
         s.products, s.orders, s.customers, s.revenue, s.last_activity, count(*) over () as total_count
  from stats s
  order by
    case when p_sort = 'oldest' then s.created_at end asc,
    case when p_sort = 'revenue' then s.revenue end desc,
    case when p_sort = 'orders' then s.orders end desc,
    case when p_sort = 'products' then s.products end desc,
    case when p_sort = 'activity' then s.last_activity end desc,
    s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.platform_list_stores(text, text, uuid, timestamptz, timestamptz, text, int, int) from public, anon;
grant execute on function public.platform_list_stores(text, text, uuid, timestamptz, timestamptz, text, int, int) to authenticated;

-- ===== supabase/migrations/20260927001600_creative_templates_seed.sql =====
-- 1600 CREATIVE STUDIO: built-in templates, version 1 (generated from src/features/creative/templates.ts).
-- Idempotent: re-running leaves existing (key, version) rows untouched.
insert into public.creative_templates (key, version, name, category, width, height, elements) values
  ('new-arrival-split', 1, 'New arrival — split', 'new_arrival', 1080, 1080, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":48,"placeholder":"Just landed","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"Hand block-printed cotton kurta sets"},{"key":"price","label":"Price","max":16,"placeholder":"₹2,490"},{"key":"cta","label":"Button text","max":22,"placeholder":"Shop now"}],"layers":[{"type":"image","x":0,"y":0,"w":600,"h":1080},{"type":"logo","x":660,"y":70,"w":360,"h":60,"color":"primary"},{"type":"text","x":660,"y":300,"w":360,"text":"NEW ARRIVAL","size":26,"font":"body","weight":700,"color":"accent","tracking":4},{"type":"text","x":660,"y":350,"w":370,"field":"headline","size":76,"font":"heading","weight":600,"color":"text","maxLines":3,"lineHeight":1.05},{"type":"text","x":660,"y":640,"w":360,"field":"subheadline","size":30,"font":"body","color":"text","maxLines":3,"lineHeight":1.3},{"type":"text","x":660,"y":810,"w":360,"field":"price","size":44,"font":"body","weight":700,"color":"primary"},{"type":"badge","x":660,"y":900,"w":280,"h":76,"field":"cta","fill":"primary","color":"white","size":26,"radius":6}]}'::jsonb),
  ('sale-bold', 1, 'Sale — bold', 'sale', 1080, 1080, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"discount","label":"Offer","max":16,"placeholder":"UP TO 50% OFF"},{"key":"headline","label":"Headline","max":36,"placeholder":"End of season sale","required":true},{"key":"date","label":"Date / timing","max":40,"placeholder":"Ends Sunday midnight"},{"key":"cta","label":"Button text","max":22,"placeholder":"Shop the sale"}],"layers":[{"type":"image","x":0,"y":0,"w":1080,"h":1080},{"type":"rect","x":0,"y":560,"w":1080,"h":520,"fill":"sale","opacity":0.94},{"type":"text","x":60,"y":600,"w":960,"field":"discount","size":120,"font":"heading","weight":800,"color":"white","align":"middle","uppercase":true},{"type":"text","x":60,"y":760,"w":960,"field":"headline","size":48,"font":"body","weight":600,"color":"white","align":"middle","maxLines":1},{"type":"text","x":60,"y":840,"w":960,"field":"date","size":30,"font":"body","color":"white","align":"middle"},{"type":"badge","x":390,"y":930,"w":300,"h":76,"field":"cta","fill":"white","color":"sale","size":26},{"type":"logo","x":40,"y":40,"w":300,"h":60,"color":"white"}]}'::jsonb),
  ('festival-frame', 1, 'Festival — framed', 'festival', 1080, 1350, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":40,"placeholder":"Diwali edit is here","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"Festive silks and brocades for the season of light"},{"key":"discount","label":"Offer","max":16,"placeholder":"Flat 20% off"},{"key":"cta","label":"Button text","max":22,"placeholder":"Explore"}],"layers":[{"type":"rect","x":0,"y":0,"w":1080,"h":1350,"fill":"primary"},{"type":"rect","x":36,"y":36,"w":1008,"h":1278,"fill":"accent","radius":4,"opacity":0.35},{"type":"rect","x":52,"y":52,"w":976,"h":1246,"fill":"primary","radius":2},{"type":"image","x":110,"y":170,"w":860,"h":700,"radius":430},{"type":"logo","x":110,"y":80,"w":860,"h":60,"color":"white","align":"middle"},{"type":"text","x":110,"y":910,"w":860,"field":"headline","size":72,"font":"heading","weight":600,"color":"white","align":"middle","maxLines":2,"lineHeight":1.05},{"type":"text","x":150,"y":1080,"w":780,"field":"subheadline","size":30,"font":"body","color":"white","align":"middle","maxLines":2,"lineHeight":1.3},{"type":"badge","x":390,"y":1190,"w":300,"h":70,"field":"discount","fill":"accent","color":"white","size":26}]}'::jsonb),
  ('product-highlight-card', 1, 'Product highlight', 'product_highlight', 1080, 1080, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":40,"placeholder":"The Indigo Anarkali","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"Hand-dyed in Bagru. 100% cotton."},{"key":"price","label":"Price","max":16,"placeholder":"₹2,490"},{"key":"compareAt","label":"Original price","max":16,"placeholder":"₹3,290"}],"layers":[{"type":"rect","x":0,"y":0,"w":1080,"h":1080,"fill":"background"},{"type":"image","x":90,"y":90,"w":900,"h":680,"radius":24},{"type":"text","x":90,"y":810,"w":640,"field":"headline","size":56,"font":"heading","weight":600,"color":"text","maxLines":1},{"type":"text","x":90,"y":890,"w":640,"field":"subheadline","size":28,"font":"body","color":"text","maxLines":2,"lineHeight":1.3},{"type":"text","x":740,"y":815,"w":250,"field":"price","size":52,"font":"body","weight":700,"color":"primary","align":"end"},{"type":"text","x":740,"y":885,"w":250,"field":"compareAt","size":30,"font":"body","color":"text","align":"end","strike":true},{"type":"logo","x":90,"y":990,"w":400,"h":50,"color":"primary"}]}'::jsonb),
  ('collection-launch-editorial', 1, 'Collection launch', 'collection_launch', 1080, 1350, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":32,"placeholder":"Monsoon Stories","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"A new collection in hand-woven chanderi"},{"key":"date","label":"Date / timing","max":40,"placeholder":"Launching 5 Oct, 7 pm"},{"key":"cta","label":"Button text","max":22,"placeholder":"Get notified"}],"layers":[{"type":"image","x":0,"y":0,"w":1080,"h":1350},{"type":"rect","x":0,"y":0,"w":1080,"h":1350,"fill":"black","opacity":0.28},{"type":"logo","x":60,"y":60,"w":960,"h":60,"color":"white","align":"middle"},{"type":"text","x":60,"y":820,"w":960,"text":"INTRODUCING","size":28,"font":"body","weight":600,"color":"white","align":"middle","tracking":8},{"type":"text","x":60,"y":870,"w":960,"field":"headline","size":104,"font":"heading","weight":500,"color":"white","align":"middle","maxLines":2,"lineHeight":1},{"type":"text","x":120,"y":1100,"w":840,"field":"subheadline","size":32,"font":"body","color":"white","align":"middle","maxLines":2},{"type":"text","x":120,"y":1200,"w":840,"field":"date","size":30,"font":"body","weight":700,"color":"white","align":"middle"}]}'::jsonb),
  ('bestseller-stamp', 1, 'Bestseller', 'bestseller', 1080, 1080, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":32,"placeholder":"Back in stock","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"Our most-loved kurta, in 6 new colours"},{"key":"price","label":"Price","max":16,"placeholder":"₹2,490"},{"key":"cta","label":"Button text","max":22,"placeholder":"Shop now"}],"layers":[{"type":"image","x":0,"y":0,"w":1080,"h":1080},{"type":"rect","x":700,"y":60,"w":320,"h":320,"fill":"accent","radius":160},{"type":"text","x":700,"y":170,"w":320,"text":"BEST","size":56,"font":"heading","weight":700,"color":"white","align":"middle"},{"type":"text","x":700,"y":235,"w":320,"text":"SELLER","size":44,"font":"heading","weight":700,"color":"white","align":"middle"},{"type":"rect","x":60,"y":780,"w":960,"h":240,"fill":"background","radius":16,"opacity":0.95},{"type":"text","x":100,"y":810,"w":620,"field":"headline","size":54,"font":"heading","weight":600,"color":"text","maxLines":1},{"type":"text","x":100,"y":890,"w":620,"field":"subheadline","size":28,"font":"body","color":"text","maxLines":2,"lineHeight":1.3},{"type":"text","x":740,"y":830,"w":240,"field":"price","size":48,"font":"body","weight":700,"color":"primary","align":"end"},{"type":"badge","x":760,"y":920,"w":220,"h":64,"field":"cta","fill":"primary","color":"white","size":22}]}'::jsonb),
  ('limited-edition-dark', 1, 'Limited edition', 'limited_edition', 1080, 1350, '{"fields":[{"key":"image","label":"Product image","max":300,"placeholder":""},{"key":"headline","label":"Headline","max":30,"placeholder":"Only 25 pieces","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"Hand-embroidered by a single artisan over 40 days"},{"key":"price","label":"Price","max":16,"placeholder":"₹2,490"},{"key":"cta","label":"Button text","max":22,"placeholder":"Reserve yours"}],"layers":[{"type":"rect","x":0,"y":0,"w":1080,"h":1350,"fill":"black"},{"type":"image","x":140,"y":140,"w":800,"h":800,"radius":8},{"type":"text","x":60,"y":60,"w":960,"text":"LIMITED EDITION","size":26,"font":"body","weight":700,"color":"accent","align":"middle","tracking":10},{"type":"text","x":60,"y":990,"w":960,"field":"headline","size":80,"font":"heading","weight":500,"color":"white","align":"middle","maxLines":1},{"type":"text","x":140,"y":1100,"w":800,"field":"subheadline","size":30,"font":"body","color":"white","align":"middle","maxLines":2,"lineHeight":1.3},{"type":"text","x":60,"y":1225,"w":960,"field":"price","size":40,"font":"body","weight":700,"color":"accent","align":"middle"},{"type":"logo","x":60,"y":1285,"w":960,"h":40,"color":"white","align":"middle"}]}'::jsonb),
  ('discount-code', 1, 'Discount code', 'discount', 1080, 1080, '{"fields":[{"key":"discount","label":"Offer","max":16,"placeholder":"Extra 15% off"},{"key":"headline","label":"Headline","max":30,"placeholder":"Use code FESTIVE15","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"On orders above ₹1,999. Valid till 31 Oct."},{"key":"cta","label":"Button text","max":22,"placeholder":"Shop now"},{"key":"image","label":"Product image","max":300,"placeholder":""}],"layers":[{"type":"rect","x":0,"y":0,"w":1080,"h":1080,"fill":"accent"},{"type":"image","x":540,"y":0,"w":540,"h":1080},{"type":"rect","x":0,"y":0,"w":620,"h":1080,"fill":"accent"},{"type":"logo","x":70,"y":80,"w":480,"h":60,"color":"white"},{"type":"text","x":70,"y":300,"w":500,"field":"discount","size":96,"font":"heading","weight":800,"color":"white","maxLines":2,"lineHeight":1},{"type":"rect","x":70,"y":560,"w":480,"h":110,"fill":"white","radius":12},{"type":"text","x":70,"y":590,"w":480,"field":"headline","size":38,"font":"body","weight":700,"color":"text","align":"middle","maxLines":1},{"type":"text","x":70,"y":710,"w":480,"field":"subheadline","size":28,"font":"body","color":"white","maxLines":3,"lineHeight":1.3},{"type":"badge","x":70,"y":900,"w":260,"h":70,"field":"cta","fill":"primary","color":"white","size":24}]}'::jsonb),
  ('announcement-minimal', 1, 'Announcement', 'announcement', 1080, 1080, '{"fields":[{"key":"headline","label":"Headline","max":60,"placeholder":"Free shipping across India","required":true},{"key":"subheadline","label":"Supporting line","max":90,"placeholder":"On every order, no minimum. Easy 7-day returns."},{"key":"cta","label":"Button text","max":22,"placeholder":"Shop now"}],"layers":[{"type":"rect","x":0,"y":0,"w":1080,"h":1080,"fill":"background"},{"type":"rect","x":80,"y":80,"w":920,"h":920,"fill":"primary","radius":0,"opacity":0.06},{"type":"logo","x":80,"y":150,"w":920,"h":70,"color":"primary","align":"middle"},{"type":"text","x":140,"y":380,"w":800,"field":"headline","size":84,"font":"heading","weight":600,"color":"text","align":"middle","maxLines":3,"lineHeight":1.05},{"type":"text","x":180,"y":700,"w":720,"field":"subheadline","size":32,"font":"body","color":"text","align":"middle","maxLines":2,"lineHeight":1.35},{"type":"badge","x":390,"y":850,"w":300,"h":76,"field":"cta","fill":"primary","color":"white","size":26}]}'::jsonb)
on conflict (key, version) do nothing;

-- ===== supabase/seed.sql =====
-- =============================================================================
-- LOCAL / DEV SEED. Never run against production.
-- Users (password for all: Paliya@12345):
--   owner@aangan.test      owner of "Aangan Jaipur"   (aangan.localhost)
--   staff@aangan.test      staff of "Aangan Jaipur"
--   owner@rangrez.test     owner of "Rangrez Studio"  (rangrez.localhost)
--   shopper@example.test   customer of Aangan
--   admin@paliya.test      platform super_admin
-- =============================================================================

do $$
declare
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-a000-000000000001'::uuid, 'owner@aangan.test', 'Asha Mehta'),
    ('00000000-0000-4000-a000-000000000002'::uuid, 'staff@aangan.test', 'Ravi Kumar'),
    ('00000000-0000-4000-a000-000000000003'::uuid, 'owner@rangrez.test', 'Farah Khan'),
    ('00000000-0000-4000-a000-000000000004'::uuid, 'shopper@example.test', 'Neha Sharma'),
    ('00000000-0000-4000-a000-000000000005'::uuid, 'admin@paliya.test', 'Platform Admin')
  ) as t(id, email, name)
  loop
    -- Token columns must be '' (not NULL) or GoTrue sign-in fails with "Database error querying schema".
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('Paliya@12345', extensions.gen_salt('bf')), now(), '', '', '', '',
            '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name), now(), now())
    on conflict (id) do nothing;
    -- Real Supabase needs an identity row for email/password sign-in.
    if to_regclass('auth.identities') is not null then
      execute 'insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, ''email'', jsonb_build_object(''sub'', $1::text, ''email'', $2), now(), now(), now())
               on conflict do nothing' using u.id, u.email;
    end if;
  end loop;
end $$;

insert into public.platform_memberships (user_id, role) values ('00000000-0000-4000-a000-000000000005', 'super_admin') on conflict do nothing;

-- Tenants ----------------------------------------------------------------------
insert into public.tenants (id, name, slug, status, plan_id, trial_ends_at, created_by)
select '10000000-0000-4000-a000-00000000000a'::uuid, 'Aangan Jaipur', 'aangan', 'active', (select id from public.plans where code = 'growth'), null::timestamptz, '00000000-0000-4000-a000-000000000001'::uuid
union all
select '10000000-0000-4000-a000-00000000000b'::uuid, 'Rangrez Studio', 'rangrez', 'trial', (select id from public.plans where code = 'starter'), now() + interval '14 days', '00000000-0000-4000-a000-000000000003'::uuid
on conflict do nothing;

insert into public.stores (tenant_id, name, tagline, email, phone, address, social, gstin, legal_name, seo) values
  ('10000000-0000-4000-a000-00000000000a', 'Aangan Jaipur', 'Hand block printed everyday wear from Jaipur', 'hello@aangan.test', '+919876543210',
   '{"line1": "12 Johari Bazaar", "city": "Jaipur", "state": "Rajasthan", "postal_code": "302003", "country": "IN"}',
   '{"instagram": "https://instagram.com/aangan", "facebook": "https://facebook.com/aangan"}', '08AABCU9603R1ZM', 'Aangan Textiles Pvt Ltd',
   '{"title": "Aangan Jaipur — Hand block printed kurtas, suits & sarees", "description": "Shop hand block printed cotton kurtas, suit sets, sarees and dupattas, made by artisans in Jaipur."}'),
  ('10000000-0000-4000-a000-00000000000b', 'Rangrez Studio', 'Natural dyes, modern silhouettes', 'studio@rangrez.test', '+919812345678',
   '{"city": "Ahmedabad", "state": "Gujarat", "postal_code": "380001", "country": "IN"}', '{}', null, null, '{}')
on conflict do nothing;

insert into public.domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary) values
  ('10000000-0000-4000-a000-00000000000a', 'aangan.localhost', 'platform_subdomain', 'verified', now(), 'not_applicable', true),
  ('10000000-0000-4000-a000-00000000000b', 'rangrez.localhost', 'platform_subdomain', 'verified', now(), 'not_applicable', true)
on conflict do nothing;

insert into public.tenant_memberships (tenant_id, user_id, role) values
  ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000002', 'staff'),
  ('10000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-000000000003', 'owner')
on conflict do nothing;

insert into public.inventory_locations (id, tenant_id, name, is_default) values
  ('20000000-0000-4000-a000-00000000000a', '10000000-0000-4000-a000-00000000000a', 'Jaipur warehouse', true),
  ('20000000-0000-4000-a000-00000000000b', '10000000-0000-4000-a000-00000000000b', 'Studio', true)
on conflict do nothing;

-- Catalog (Aangan) --------------------------------------------------------------
insert into public.size_charts (id, tenant_id, name, unit, chart) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'Women''s kurta', 'in',
   '{"columns": ["Size", "Bust", "Waist", "Hip", "Length"], "rows": [["XS","32","26","36","44"],["S","34","28","38","44"],["M","36","30","40","45"],["L","38","32","42","45"],["XL","40","34","44","46"],["XXL","42","36","46","46"]], "note": "Garment measurements. For a relaxed fit, choose one size up."}')
on conflict do nothing;

insert into public.categories (id, tenant_id, name, slug, position) values
  ('31000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'Kurtas', 'kurtas', 1),
  ('31000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'Suit sets', 'suit-sets', 2),
  ('31000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', 'Sarees', 'sarees', 3),
  ('31000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', 'Dupattas', 'dupattas', 4),
  ('31000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-00000000000a', 'Co-ord sets', 'co-ord-sets', 5)
on conflict do nothing;

insert into public.products (id, tenant_id, category_id, size_chart_id, title, slug, short_description, description, product_type, brand, status, featured, tags, attributes, care_instructions, shipping_info, return_info, hsn_code) values
  ('32000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Indigo Dabu Straight Kurta', 'indigo-dabu-straight-kurta', 'Mud-resist dabu print on soft cotton.',
   'A straight-cut kurta in breathable cotton, hand printed with the dabu mud-resist technique and dyed in natural indigo. Three-quarter sleeves, side slits, and a round neck with a keyhole placket.',
   'kurta', 'Aangan', 'active', true, '{new,bestseller,indigo}', '{"fabric": "Cotton", "occasion": ["Casual", "Work"], "style": "Straight", "length": "Calf", "work": "Dabu print"}',
   'Hand wash separately in cold water. Dry in shade.', 'Ships in 2-3 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Rose Sanganeri A-line Kurta', 'rose-sanganeri-a-line-kurta', 'Delicate Sanganeri florals, A-line flare.',
   'An A-line kurta with fine Sanganeri floral buttis, finished with pintucks at the yoke and lace at the hem.',
   'kurta', 'Aangan', 'active', true, '{new,floral}', '{"fabric": "Cotton", "occasion": ["Casual", "Festive"], "style": "A-line", "length": "Calf", "work": "Hand block print"}',
   'Hand wash separately in cold water.', 'Ships in 2-3 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
   'Mustard Bagru Suit Set with Dupatta', 'mustard-bagru-suit-set', 'Kurta, pants and mulmul dupatta.',
   'Three-piece set: straight kurta, straight pants with elasticated waist, and a mulmul dupatta, all hand printed in Bagru.',
   'suit', 'Aangan', 'active', false, '{festive,bestseller}', '{"fabric": "Cotton", "occasion": ["Festive"], "style": "Straight", "work": "Bagru print"}',
   'Dry clean recommended for the first wash.', 'Ships in 3-5 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000003', null,
   'Ajrakh Mul Cotton Saree', 'ajrakh-mul-cotton-saree', 'Ajrakh-printed mul cotton with a running blouse piece.',
   'A lightweight mul cotton saree hand printed with traditional ajrakh geometry. 5.5 m saree with 0.8 m running blouse piece.',
   'saree', 'Aangan', 'active', true, '{sale}', '{"fabric": "Mul cotton", "occasion": ["Festive", "Work"], "work": "Ajrakh"}',
   'Dry clean only.', 'Ships in 2-3 working days.', 'Returns accepted if unused with tags.', '5208'),
  ('32000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000004', null,
   'Kota Doria Leheriya Dupatta', 'kota-doria-leheriya-dupatta', 'Tie-dyed leheriya on sheer Kota doria.',
   'A sheer Kota doria dupatta, tie-dyed in the leheriya wave pattern with gota trim.',
   'dupatta', 'Aangan', 'active', false, '{new}', '{"fabric": "Kota doria", "occasion": ["Festive"], "work": "Leheriya"}',
   'Dry clean only.', 'Ships in 2-3 working days.', 'Non-returnable.', '6214'),
  ('32000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000005', '30000000-0000-4000-a000-000000000001',
   'Sage Kalamkari Co-ord Set', 'sage-kalamkari-co-ord-set', 'Relaxed shirt and pant co-ord.',
   'A relaxed button-down shirt and straight pant in sage, printed with kalamkari motifs.',
   'co_ord_set', 'Aangan', 'draft', false, '{}', '{"fabric": "Cotton", "occasion": ["Casual"]}', null, null, null, '6204')
on conflict do nothing;

insert into public.product_options (tenant_id, product_id, position, name)
select '10000000-0000-4000-a000-00000000000a', p, 1, 'Size'
from unnest(array['32000000-0000-4000-a000-000000000001','32000000-0000-4000-a000-000000000002','32000000-0000-4000-a000-000000000003','32000000-0000-4000-a000-000000000006']::uuid[]) p
on conflict do nothing;

-- sized products: XS..XXL
insert into public.product_variants (tenant_id, product_id, sku, title, option1, price, compare_at_price, position)
select '10000000-0000-4000-a000-00000000000a', p.id, p.sku || '-' || s.size, s.size, s.size, p.price, p.cmp, s.pos
from (values
  ('32000000-0000-4000-a000-000000000001'::uuid, 'AAN-IDK', 1499.00, 1999.00),
  ('32000000-0000-4000-a000-000000000002'::uuid, 'AAN-RSK', 1699.00, null),
  ('32000000-0000-4000-a000-000000000003'::uuid, 'AAN-MBS', 3299.00, 3999.00),
  ('32000000-0000-4000-a000-000000000006'::uuid, 'AAN-SKC', 2799.00, null)
) as p(id, sku, price, cmp)
cross join (values ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6)) as s(size, pos)
on conflict do nothing;

insert into public.product_variants (tenant_id, product_id, sku, title, price, compare_at_price) values
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000004', 'AAN-AJS', 'Default', 2499.00, 3499.00),
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000005', 'AAN-KDL', 'Default', 899.00, null)
on conflict do nothing;

-- opening stock
insert into public.inventory_movements (tenant_id, location_id, variant_id, delta, available_after, reason, reference_type, note)
select v.tenant_id, '20000000-0000-4000-a000-00000000000a', v.id, q.qty, q.qty, 'initial', 'import', 'Seed'
from public.product_variants v
cross join lateral (select case when v.option1 in ('XS', 'XXL') then 2 when v.sku = 'AAN-KDL' then 25 else 8 end as qty) q
where v.tenant_id = '10000000-0000-4000-a000-00000000000a'
  and not exists (select 1 from public.inventory_movements m where m.variant_id = v.id and m.reason = 'initial');
update public.inventory_levels l set available = case when v.option1 in ('XS', 'XXL') then 2 when v.sku = 'AAN-KDL' then 25 else 8 end
from public.product_variants v where v.id = l.variant_id and v.tenant_id = '10000000-0000-4000-a000-00000000000a';

insert into public.collections (id, tenant_id, title, slug, description, type, rules, sort_order, position) values
  ('33000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'New Arrivals', 'new-arrivals', 'Fresh off the printing tables.', 'automated',
   '{"match": "all", "conditions": [{"field": "tag", "op": "eq", "value": "new"}]}', 'newest', 1),
  ('33000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'Bestsellers', 'bestsellers', 'Our most-loved pieces.', 'automated',
   '{"match": "all", "conditions": [{"field": "tag", "op": "eq", "value": "bestseller"}]}', 'best_selling', 2),
  ('33000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', 'Festive Edit', 'festive-edit', 'Celebration-ready prints.', 'manual',
   '{"match": "all", "conditions": []}', 'manual', 3),
  ('33000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', 'Sale', 'sale', 'Limited-time prices.', 'automated',
   '{"match": "all", "conditions": [{"field": "on_sale", "op": "eq", "value": true}]}', 'price_asc', 4)
on conflict do nothing;
insert into public.collection_products (tenant_id, collection_id, product_id, position) values
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000003', 1),
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000005', 2),
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000004', 3)
on conflict do nothing;

-- re-runnable: skip when Aangan already has shipping_rates
do $$ begin
  if not exists (select 1 from public.shipping_rates where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.shipping_rates (tenant_id, name, price, min_subtotal, max_subtotal, estimated_days_min, estimated_days_max, position) values
  ('10000000-0000-4000-a000-00000000000a', 'Standard', 99, 0, 1499.99, 3, 6, 1),
  ('10000000-0000-4000-a000-00000000000a', 'Free shipping', 0, 1500, null, 3, 6, 2),
  ('10000000-0000-4000-a000-00000000000b', 'Standard', 79, 0, null, 4, 8, 1);
  end if;
end $$;

insert into public.discounts (tenant_id, code, title, type, value, min_subtotal, max_discount) values
  ('10000000-0000-4000-a000-00000000000a', 'WELCOME10', '10% off your first order', 'percentage', 10, 999, 500)
on conflict do nothing;

insert into public.menus (id, tenant_id, handle, title) values
  ('34000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'main', 'Main menu'),
  ('34000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'footer', 'Footer')
on conflict do nothing;
-- re-runnable: skip when Aangan already has menu_items
do $$ begin
  if not exists (select 1 from public.menu_items where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.menu_items (tenant_id, menu_id, title, link_type, link_ref, url, position, highlight) values
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'New', 'collection', '33000000-0000-4000-a000-000000000001', null, 1, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Kurtas', 'category', '31000000-0000-4000-a000-000000000001', null, 2, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Suit sets', 'category', '31000000-0000-4000-a000-000000000002', null, 3, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Sarees', 'category', '31000000-0000-4000-a000-000000000003', null, 4, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Festive', 'collection', '33000000-0000-4000-a000-000000000003', null, 5, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Sale', 'collection', '33000000-0000-4000-a000-000000000004', null, 6, true),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Shipping policy', 'url', null, '/pages/shipping-policy', 1, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Returns & exchanges', 'url', null, '/pages/returns', 2, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Contact us', 'url', null, '/pages/contact', 3, false);
  end if;
end $$;

insert into public.pages (tenant_id, title, slug, kind, status, published_at, body) values
  ('10000000-0000-4000-a000-00000000000a', 'Shipping policy', 'shipping-policy', 'policy', 'published', now(),
   '[{"type": "paragraph", "text": "We ship across India. Orders are dispatched within 2-3 working days and usually arrive in 3-6 days."}, {"type": "paragraph", "text": "Shipping is free on orders above ₹1,500."}]'),
  ('10000000-0000-4000-a000-00000000000a', 'Returns & exchanges', 'returns', 'policy', 'published', now(),
   '[{"type": "paragraph", "text": "Unused items with tags can be returned within 7 days of delivery."}]'),
  ('10000000-0000-4000-a000-00000000000a', 'Contact us', 'contact', 'contact', 'published', now(),
   '[{"type": "paragraph", "text": "Write to hello@aangan.test or WhatsApp us at +91 98765 43210, Monday to Saturday, 10am to 6pm."}]')
on conflict do nothing;

-- re-runnable: skip when Aangan already has faqs
do $$ begin
  if not exists (select 1 from public.faqs where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.faqs (tenant_id, question, answer, position) values
  ('10000000-0000-4000-a000-00000000000a', 'Do you offer Cash on Delivery?', 'Yes, COD is available on orders up to ₹10,000 across most PIN codes.', 1),
  ('10000000-0000-4000-a000-00000000000a', 'Will the colours bleed?', 'Hand block prints use natural dyes; wash separately in cold water for the first few washes.', 2);
  end if;
end $$;

insert into public.customers (id, tenant_id, auth_user_id, email, phone, first_name, last_name, accepts_marketing) values
  ('35000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000004', 'shopper@example.test', '+919900112233', 'Neha', 'Sharma', true)
on conflict do nothing;

-- re-runnable: skip when Aangan already has reviews
do $$ begin
  if not exists (select 1 from public.reviews where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.reviews (tenant_id, product_id, rating, title, body, author_name, status, verified_purchase) values
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000001', 5, 'Beautiful indigo', 'The print is crisp and the cotton is so soft.', 'Priya', 'approved', true),
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000001', 4, 'Runs slightly large', 'Lovely kurta, size down if between sizes.', 'Meera', 'approved', true);
  end if;
end $$;

-- Rangrez: one product so isolation tests have something to (not) see
insert into public.products (id, tenant_id, title, slug, product_type, status) values
  ('32000000-0000-4000-a000-0000000000b1', '10000000-0000-4000-a000-00000000000b', 'Madder Red Wrap Dress', 'madder-red-wrap-dress', 'dress', 'active')
on conflict do nothing;
insert into public.product_variants (tenant_id, product_id, sku, title, price) values
  ('10000000-0000-4000-a000-00000000000b', '32000000-0000-4000-a000-0000000000b1', 'RGZ-MRD', 'Default', 4200.00)
on conflict do nothing;
