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
