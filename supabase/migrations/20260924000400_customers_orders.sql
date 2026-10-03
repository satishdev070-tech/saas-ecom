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
