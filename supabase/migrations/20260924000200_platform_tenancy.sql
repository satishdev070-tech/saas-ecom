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
