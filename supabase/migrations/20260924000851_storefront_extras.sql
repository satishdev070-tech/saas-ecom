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
