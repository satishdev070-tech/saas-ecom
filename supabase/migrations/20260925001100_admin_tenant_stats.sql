-- Super admin tenant table: owner, catalogue size, orders and GMV for a page of tenants in ONE call
-- (avoids calling platform_tenant_counts once per row). Platform staff with usage.read only.

create or replace function public.platform_tenant_list_stats(p_tenants uuid[])
returns table (tenant_id uuid, owner_email text, products bigint, orders bigint, gmv numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_platform_permission('platform.usage.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    t.id,
    (select u.email::text
       from public.tenant_memberships m
       join auth.users u on u.id = m.user_id
      where m.tenant_id = t.id and m.role = 'owner'
      order by m.created_at
      limit 1),
    (select count(*) from public.products p where p.tenant_id = t.id),
    (select count(*) from public.orders o where o.tenant_id = t.id and o.status <> 'pending'),
    coalesce((select sum(o.grand_total) from public.orders o
               where o.tenant_id = t.id and o.status <> 'cancelled'
                 and o.payment_status in ('paid', 'partially_refunded', 'cod_pending')), 0)
  from public.tenants t
  where t.id = any(p_tenants[1:200]);
end;
$$;

revoke all on function public.platform_tenant_list_stats(uuid[]) from public, anon;
grant execute on function public.platform_tenant_list_stats(uuid[]) to authenticated;
