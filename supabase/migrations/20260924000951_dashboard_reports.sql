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
