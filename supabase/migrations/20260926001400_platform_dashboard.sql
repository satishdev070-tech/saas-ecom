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
