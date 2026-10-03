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
