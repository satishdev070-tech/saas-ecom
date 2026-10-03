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
