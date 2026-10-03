-- =============================================================================
-- 0950 SELLER DASHBOARD OPS (Agent D)
--   * list_tenant_members(): team page needs member emails, which live in auth.users
--     (not readable through RLS). Returns rows only to callers with members.manage.
--   * replace_menu_items(): atomic save of a navigation menu tree (1 level of children).
--     SECURITY INVOKER, so the caller's RLS (content.write) applies to every statement.
-- =============================================================================

create or replace function public.list_tenant_members(p_tenant uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  role text,
  status text,
  display_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'members.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, m.role, m.status, p.display_name, u.email::text, m.created_at
    from public.tenant_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end, m.created_at;
end;
$$;

-- p_items: [{title, link_type, link_ref?, url?, highlight?, children?: [{title, link_type, link_ref?, url?, highlight?}]}]
create or replace function public.replace_menu_items(p_menu uuid, p_items jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_parent uuid;
  v_item jsonb;
  v_child jsonb;
  v_pos int := 0;
  v_cpos int;
  v_count int := 0;
begin
  select tenant_id into v_tenant from public.menus where id = p_menu;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'content.write') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid menu items' using errcode = '22023';
  end if;

  delete from public.menu_items where menu_id = p_menu;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.menu_items (tenant_id, menu_id, parent_id, title, link_type, link_ref, url, highlight, position)
    values (v_tenant, p_menu, null, v_item ->> 'title', v_item ->> 'link_type', nullif(v_item ->> 'link_ref', '')::uuid,
            nullif(v_item ->> 'url', ''), coalesce((v_item ->> 'highlight')::boolean, false), v_pos)
    returning id into v_parent;
    v_pos := v_pos + 1;
    v_count := v_count + 1;
    if jsonb_typeof(v_item -> 'children') = 'array' then
      if jsonb_array_length(v_item -> 'children') > 50 then
        raise exception 'invalid menu items' using errcode = '22023';
      end if;
      v_cpos := 0;
      for v_child in select * from jsonb_array_elements(v_item -> 'children') loop
        insert into public.menu_items (tenant_id, menu_id, parent_id, title, link_type, link_ref, url, highlight, position)
        values (v_tenant, p_menu, v_parent, v_child ->> 'title', v_child ->> 'link_type', nullif(v_child ->> 'link_ref', '')::uuid,
                nullif(v_child ->> 'url', ''), coalesce((v_child ->> 'highlight')::boolean, false), v_cpos);
        v_cpos := v_cpos + 1;
        v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  update public.menus set updated_at = now() where id = p_menu;
  return v_count;
end;
$$;

revoke all on function public.list_tenant_members(uuid) from public, anon;
revoke all on function public.replace_menu_items(uuid, jsonb) from public, anon;
grant execute on function public.list_tenant_members(uuid) to authenticated;
grant execute on function public.replace_menu_items(uuid, jsonb) to authenticated;
