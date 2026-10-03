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
