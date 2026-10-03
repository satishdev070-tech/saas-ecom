-- =============================================================================
-- 1800 STORE CATEGORIES + STORE TYPE
-- Business categories for stores and themes (fashion, electronics, beauty, ...), and a store
-- type so demo/showcase and test tenants are distinguishable from real sellers.
-- Additive and reversible (see the "down" notes at the end). Real stores keep store_type =
-- 'real' and category NULL until their owner picks one: no business values are changed.
-- =============================================================================

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  icon text check (char_length(icon) <= 40),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.store_categories enable row level security;
create policy store_categories_read on public.store_categories for select to anon, authenticated using (active);
create policy store_categories_platform_write on public.store_categories for all to authenticated
  using (app.has_platform_permission('platform.settings.manage')) with check (app.has_platform_permission('platform.settings.manage'));
grant select on public.store_categories to anon, authenticated;
grant insert, update, delete on public.store_categories to authenticated;
grant all on public.store_categories to service_role;

insert into public.store_categories (slug, name, description, icon, position) values
  ('fashion', 'Fashion & Clothing', 'Apparel, ethnic and western wear, accessories.', 'shirt', 1),
  ('electronics', 'Electronics & Gadgets', 'Audio, chargers, computer accessories, gadgets.', 'headphones', 2),
  ('beauty', 'Beauty & Cosmetics', 'Skincare, makeup, haircare and fragrance.', 'sparkles', 3),
  ('jewellery', 'Jewellery & Accessories', 'Fine and fashion jewellery, accessories.', 'gem', 4),
  ('furniture', 'Home & Furniture', 'Furniture, decor, lighting and furnishings.', 'sofa', 5),
  ('grocery', 'Grocery & Food', 'Daily essentials, staples, snacks and beverages.', 'shopping-basket', 6),
  ('health', 'Health & Wellness', 'Supplements, wellness and personal care.', 'heart-pulse', 7),
  ('sports', 'Sports & Fitness', 'Equipment, activewear and outdoor gear.', 'dumbbell', 8),
  ('footwear', 'Footwear', 'Sneakers, formal, ethnic and kids'' footwear.', 'footprints', 9),
  ('kids', 'Kids & Baby', 'Baby care, toys and kids'' clothing.', 'baby', 10),
  ('books', 'Books & Stationery', 'Books, journals, art and office supplies.', 'book-open', 11),
  ('pets', 'Pet Supplies', 'Food, toys, grooming and accessories for pets.', 'paw-print', 12),
  ('automotive', 'Automotive Accessories', 'Car and bike accessories and care.', 'car', 13),
  ('smart-home', 'Smart Home & Appliances', 'Smart devices and home appliances.', 'house-plug', 14),
  ('handicrafts', 'Handicrafts & Ethnic', 'Handmade crafts, textiles and decor.', 'palette', 15),
  ('bags', 'Bags & Travel', 'Backpacks, luggage and travel accessories.', 'briefcase', 16),
  ('watches', 'Watches & Luxury Accessories', 'Watches, eyewear and luxury accessories.', 'watch', 17),
  ('organic', 'Organic & Natural Products', 'Organic food, natural care and eco products.', 'leaf', 18),
  ('gourmet', 'Bakery & Gourmet Food', 'Bakery, sweets, gourmet and gifting.', 'cake', 19),
  ('general', 'General / Multi-category', 'Stores selling across many categories.', 'store', 20)
on conflict (slug) do nothing;

alter table public.stores add column if not exists category_id uuid references public.store_categories (id) on delete set null;
create index if not exists stores_category_idx on public.stores (category_id);

alter table public.tenants add column if not exists store_type text not null default 'real' check (store_type in ('real', 'demo', 'test'));

-- Known seed/demo tenants by slug (never The Paliya or unknown tenants; they stay 'real').
update public.tenants set store_type = 'test' where slug in ('aangan', 'rangrez');
update public.tenants set store_type = 'demo'
  where slug in ('chinar', 'gulaabrang', 'pinkcity', 'mitti', 'rangeela', 'noor', 'vivaah', 'studioneel', 'desidrip', 'anaya');
update public.stores s set category_id = (select id from public.store_categories where slug = 'fashion')
  from public.tenants t
  where t.id = s.tenant_id and t.store_type = 'demo' and s.category_id is null
    and t.slug in ('chinar', 'gulaabrang', 'pinkcity', 'mitti', 'rangeela', 'noor', 'vivaah', 'studioneel', 'desidrip', 'anaya');

-- Super-admin store list: store type + category, filterable.
drop function if exists public.platform_list_stores(text, text, uuid, timestamptz, timestamptz, text, int, int);
create or replace function public.platform_list_stores(
  p_q text default null, p_status text default null, p_plan uuid default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_sort text default 'newest', p_limit int default 25, p_offset int default 0,
  p_type text default null, p_category uuid default null
)
returns table (
  tenant_id uuid, name text, slug text, status text, plan_name text, created_at timestamptz,
  owner_email text, primary_domain text, products bigint, orders bigint, customers bigint,
  revenue numeric, last_activity timestamptz, total_count bigint,
  store_type text, category_name text
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
    select t.id, t.name, t.slug, t.status, p.name as plan_name, t.created_at, t.store_type,
      (select sc.name from public.stores st join public.store_categories sc on sc.id = st.category_id where st.tenant_id = t.id) as category_name,
      (select st.category_id from public.stores st where st.tenant_id = t.id) as category_id,
      (select u.email::text from public.tenant_memberships m join auth.users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
      (select d.hostname from public.domains d where d.tenant_id = t.id and d.is_primary limit 1) as primary_domain
    from public.tenants t
    left join public.plans p on p.id = t.plan_id
    where (p_status is null or t.status = p_status)
      and (p_plan is null or t.plan_id = p_plan)
      and (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at < p_to)
      and (p_type is null or t.store_type = p_type)
  ), filtered as (
    select b.* from base b
    where (p_category is null or b.category_id = p_category)
      and (v_q is null
       or b.name ilike '%' || v_q || '%' or b.slug ilike '%' || v_q || '%'
       or b.owner_email ilike '%' || v_q || '%' or b.primary_domain ilike '%' || v_q || '%'
       or b.id::text = lower(v_q)
       or exists (select 1 from public.domains d where d.tenant_id = b.id and d.hostname ilike '%' || v_q || '%'))
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
         s.products, s.orders, s.customers, s.revenue, s.last_activity, count(*) over () as total_count,
         s.store_type, s.category_name
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
revoke all on function public.platform_list_stores(text, text, uuid, timestamptz, timestamptz, text, int, int, text, uuid) from public, anon;
grant execute on function public.platform_list_stores(text, text, uuid, timestamptz, timestamptz, text, int, int, text, uuid) to authenticated;

-- Down (manual): drop function platform_list_stores(...10 args) and recreate the 1500 version;
-- alter table tenants drop column store_type; alter table stores drop column category_id;
-- drop table store_categories.
