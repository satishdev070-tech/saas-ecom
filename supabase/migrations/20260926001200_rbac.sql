-- =============================================================================
-- 1200 RBAC: more system roles, finer permissions, tenant-defined custom roles.
-- role_permissions MUST match src/lib/permissions/matrix.ts (tests/unit/permissions-sql.test.ts).
-- =============================================================================

-- 1. System roles ---------------------------------------------------------------
alter table public.role_permissions drop constraint role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check check (role in ('owner', 'admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer'));

delete from public.role_permissions;
insert into public.role_permissions (role, permission) values
-- owner
  ('owner','store.read'),('owner','catalog.read'),('owner','catalog.write'),('owner','catalog.delete'),('owner','catalog.publish'),('owner','inventory.read'),('owner','inventory.write'),('owner','orders.read'),('owner','orders.write'),('owner','orders.cancel'),('owner','orders.refund'),('owner','customers.read'),('owner','customers.write'),('owner','marketing.read'),('owner','marketing.write'),('owner','content.write'),('owner','theme.edit'),('owner','theme.publish'),('owner','reviews.moderate'),('owner','analytics.read'),('owner','settings.write'),('owner','payments.manage'),('owner','domains.manage'),('owner','members.read'),('owner','members.manage'),('owner','roles.manage'),('owner','billing.manage'),
  -- admin
  ('admin','store.read'),('admin','catalog.read'),('admin','inventory.read'),('admin','orders.read'),('admin','customers.read'),('admin','marketing.read'),('admin','analytics.read'),('admin','catalog.write'),('admin','catalog.delete'),('admin','catalog.publish'),('admin','inventory.write'),('admin','orders.write'),('admin','orders.cancel'),('admin','customers.write'),('admin','orders.refund'),('admin','marketing.write'),('admin','content.write'),('admin','theme.edit'),('admin','reviews.moderate'),('admin','members.read'),('admin','theme.publish'),('admin','settings.write'),('admin','payments.manage'),('admin','domains.manage'),('admin','members.manage'),('admin','roles.manage'),
  -- manager
  ('manager','store.read'),('manager','catalog.read'),('manager','inventory.read'),('manager','orders.read'),('manager','customers.read'),('manager','marketing.read'),('manager','analytics.read'),('manager','catalog.write'),('manager','catalog.delete'),('manager','catalog.publish'),('manager','inventory.write'),('manager','orders.write'),('manager','orders.cancel'),('manager','customers.write'),('manager','orders.refund'),('manager','marketing.write'),('manager','content.write'),('manager','theme.edit'),('manager','reviews.moderate'),('manager','members.read'),
  -- catalog_manager
  ('catalog_manager','store.read'),('catalog_manager','catalog.read'),('catalog_manager','catalog.write'),('catalog_manager','catalog.delete'),('catalog_manager','catalog.publish'),('catalog_manager','inventory.read'),('catalog_manager','inventory.write'),
  -- order_manager
  ('order_manager','store.read'),('order_manager','catalog.read'),('order_manager','inventory.read'),('order_manager','orders.read'),('order_manager','orders.write'),('order_manager','orders.cancel'),('order_manager','orders.refund'),('order_manager','customers.read'),('order_manager','customers.write'),
  -- inventory_manager
  ('inventory_manager','store.read'),('inventory_manager','catalog.read'),('inventory_manager','inventory.read'),('inventory_manager','inventory.write'),('inventory_manager','orders.read'),
  -- marketing_manager
  ('marketing_manager','store.read'),('marketing_manager','catalog.read'),('marketing_manager','customers.read'),('marketing_manager','marketing.read'),('marketing_manager','marketing.write'),('marketing_manager','reviews.moderate'),('marketing_manager','analytics.read'),
  -- content_manager
  ('content_manager','store.read'),('content_manager','catalog.read'),('content_manager','content.write'),('content_manager','theme.edit'),
  -- analyst
  ('analyst','store.read'),('analyst','catalog.read'),('analyst','inventory.read'),('analyst','orders.read'),('analyst','customers.read'),('analyst','marketing.read'),('analyst','analytics.read'),
  -- support_agent
  ('support_agent','store.read'),('support_agent','catalog.read'),('support_agent','orders.read'),('support_agent','orders.write'),('support_agent','customers.read'),('support_agent','customers.write'),('support_agent','reviews.moderate'),
  -- staff
  ('staff','store.read'),('staff','catalog.read'),('staff','inventory.read'),('staff','orders.read'),('staff','customers.read'),('staff','marketing.read'),('staff','analytics.read'),('staff','catalog.write'),('staff','catalog.delete'),('staff','catalog.publish'),('staff','inventory.write'),('staff','orders.write'),('staff','orders.cancel'),('staff','customers.write'),
  -- viewer
  ('viewer','store.read'),('viewer','catalog.read'),('viewer','inventory.read'),('viewer','orders.read'),('viewer','customers.read'),('viewer','marketing.read'),('viewer','analytics.read')
on conflict do nothing;

-- 2. Custom roles -----------------------------------------------------------------
create table public.tenant_custom_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (char_length(description) <= 240),
  permissions text[] not null default '{}'
    check (permissions <@ array['store.read', 'catalog.read', 'catalog.write', 'catalog.delete', 'catalog.publish', 'inventory.read', 'inventory.write', 'orders.read', 'orders.write', 'orders.cancel', 'orders.refund', 'customers.read', 'customers.write', 'marketing.read', 'marketing.write', 'content.write', 'theme.edit', 'theme.publish', 'reviews.moderate', 'analytics.read', 'settings.write', 'payments.manage', 'domains.manage', 'members.read', 'members.manage', 'roles.manage', 'billing.manage']::text[] and not ('billing.manage' = any (permissions))),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index tenant_custom_roles_name_key on public.tenant_custom_roles (tenant_id, lower(btrim(name)));
select app.add_standard_triggers('public.tenant_custom_roles');
alter table public.tenant_custom_roles enable row level security;

-- 3. Memberships & invitations can point at a custom role ------------------------
alter table public.tenant_memberships drop constraint tenant_memberships_role_check;
alter table public.tenant_memberships
  add constraint tenant_memberships_role_check check (role in ('owner', 'admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer', 'custom')),
  add column custom_role_id uuid,
  add constraint tenant_memberships_custom_role_fk foreign key (tenant_id, custom_role_id) references public.tenant_custom_roles (tenant_id, id) on delete restrict,
  add constraint tenant_memberships_custom_role_check check ((role = 'custom') = (custom_role_id is not null));

alter table public.tenant_invitations drop constraint tenant_invitations_role_check;
alter table public.tenant_invitations
  add constraint tenant_invitations_role_check check (role in ('admin', 'manager', 'catalog_manager', 'order_manager', 'inventory_manager', 'marketing_manager', 'content_manager', 'analyst', 'support_agent', 'staff', 'viewer', 'custom')),
  add column custom_role_id uuid,
  add constraint tenant_invitations_custom_role_fk foreign key (tenant_id, custom_role_id) references public.tenant_custom_roles (tenant_id, id) on delete cascade,
  add constraint tenant_invitations_custom_role_check check ((role = 'custom') = (custom_role_id is not null));

-- 4. Permission check now understands custom roles --------------------------------
create or replace function app.has_tenant_permission(p_tenant uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        (m.custom_role_id is null and exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = p_perm))
        or (m.custom_role_id is not null and exists (select 1 from public.tenant_custom_roles cr where cr.id = m.custom_role_id and p_perm = any (cr.permissions)))
      )
  )
  or exists (
    select 1
    from public.support_sessions s
    join public.role_permissions rp on rp.role = 'viewer' and rp.permission = p_perm
    where s.tenant_id = p_tenant
      and s.platform_user_id = (select auth.uid())
      and s.ended_at is null
      and s.expires_at > now()
  );
$$;

/** Permissions granted by a system role or custom role. */
create or replace function app.role_grants(p_role text, p_custom uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_custom is not null then (select permissions from public.tenant_custom_roles where id = p_custom)
    else coalesce((select array_agg(permission) from public.role_permissions where role = p_role), '{}')
  end;
$$;

/** True when the caller holds every permission in p_perms for the tenant (no privilege escalation). */
create or replace function app.caller_holds_all(p_tenant uuid, p_perms text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(app.has_tenant_permission(p_tenant, p)), true) from unnest(p_perms) p;
$$;

-- 5. Guards (skipped for service role / migrations where auth.uid() is null) --------
create or replace function app.guard_custom_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not app.caller_holds_all(new.tenant_id, new.permissions) then
    raise exception 'you can only grant permissions you hold yourself' using errcode = '42501';
  end if;
  new.permissions := array(select distinct unnest(new.permissions) order by 1);
  return new;
end;
$$;
create trigger trg_tenant_custom_roles_guard before insert or update on public.tenant_custom_roles
  for each row execute function app.guard_custom_role();

create or replace function app.guard_membership_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.custom_role_id is not distinct from old.custom_role_id then
    return new;
  end if;
  -- Nested IFs: PL/pgSQL does not short-circuit AND, and invitations have no user_id.
  if tg_table_name = 'tenant_memberships' and tg_op = 'UPDATE' then
    if old.user_id = (select auth.uid()) then
      raise exception 'you cannot change your own role' using errcode = '42501';
    end if;
  end if;
  if not app.caller_holds_all(new.tenant_id, app.role_grants(new.role, new.custom_role_id)) then
    raise exception 'you cannot assign a role with permissions you do not hold' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_tenant_memberships_role_guard before update on public.tenant_memberships
  for each row execute function app.guard_membership_role();
create trigger trg_tenant_invitations_role_guard before insert or update on public.tenant_invitations
  for each row execute function app.guard_membership_role();

create or replace function app.audit_custom_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.audit(coalesce(new.tenant_id, old.tenant_id),
    case tg_op when 'INSERT' then 'role.created' when 'UPDATE' then 'role.updated' else 'role.deleted' end,
    'custom_role', coalesce(new.id, old.id)::text,
    jsonb_build_object('name', coalesce(new.name, old.name), 'permissions', coalesce(to_jsonb(new.permissions), to_jsonb(old.permissions))));
  return coalesce(new, old);
end;
$$;
create trigger trg_tenant_custom_roles_audit after insert or update or delete on public.tenant_custom_roles
  for each row execute function app.audit_custom_role();

-- 6. RLS for custom roles -----------------------------------------------------------
create policy custom_roles_select on public.tenant_custom_roles for select to authenticated
  using (app.has_tenant_permission(tenant_id, 'store.read') or app.has_platform_permission('platform.tenants.read'));
create policy custom_roles_write on public.tenant_custom_roles for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'roles.manage'))
  with check (app.has_tenant_permission(tenant_id, 'roles.manage'));
grant select, insert, update, delete on public.tenant_custom_roles to authenticated;
grant all on public.tenant_custom_roles to service_role;

-- 7. catalog.delete: deletes need their own permission ------------------------------
drop policy products_staff_write on public.products;
create policy products_staff_insert on public.products for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy products_staff_update on public.products for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy products_staff_delete on public.products for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

drop policy collections_staff_write on public.collections;
create policy collections_staff_insert on public.collections for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy collections_staff_update on public.collections for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy collections_staff_delete on public.collections for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

drop policy categories_staff_write on public.categories;
create policy categories_staff_insert on public.categories for insert to authenticated with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy categories_staff_update on public.categories for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write')) with check (app.has_tenant_permission(tenant_id, 'catalog.write'));
create policy categories_staff_delete on public.categories for delete to authenticated using (app.has_tenant_permission(tenant_id, 'catalog.delete'));

-- 8. catalog.publish: making a product live needs its own permission ----------------
create or replace function app.guard_product_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and (select auth.uid()) is not null
     and not app.has_tenant_permission(new.tenant_id, 'catalog.publish') then
    raise exception 'you do not have permission to publish products' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_products_publish_guard before insert or update of status on public.products
  for each row execute function app.guard_product_publish();

-- 9. orders.cancel ----------------------------------------------------------------------
create or replace function public.cancel_order(p_order uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.orders where id = p_order;
  if v_tenant is null or not app.has_tenant_permission(v_tenant, 'orders.cancel') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform app.cancel_order_internal(p_order, p_reason, (select auth.uid()));
  perform app.audit(v_tenant, 'order.cancelled', 'order', p_order::text, jsonb_build_object('reason', p_reason));
end;
$$;

-- 10. Invitations carry custom roles; accepting never downgrades an owner ------------
create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  inv public.tenant_invitations%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_user;

  select * into inv from public.tenant_invitations
  where token_hash = p_token_hash and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invitation is invalid or expired' using errcode = 'P0002'; end if;
  if inv.email <> v_email then raise exception 'invitation was sent to a different email address' using errcode = '42501'; end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, custom_role_id, invited_by)
  values (inv.tenant_id, v_user, inv.role, inv.custom_role_id, inv.invited_by)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role, custom_role_id = excluded.custom_role_id, status = 'active'
    where public.tenant_memberships.role <> 'owner';
  update public.tenant_invitations set accepted_at = now() where id = inv.id;
  perform app.audit(inv.tenant_id, 'member.joined', 'membership', v_user::text, jsonb_build_object('role', inv.role, 'custom_role_id', inv.custom_role_id));
  return inv.tenant_id;
end;
$$;

-- 11. Team list: members.read, custom role name, last sign-in -----------------------
drop function public.list_tenant_members(uuid);
create function public.list_tenant_members(p_tenant uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  role text,
  custom_role_id uuid,
  custom_role_name text,
  status text,
  display_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_tenant_permission(p_tenant, 'members.read') or app.has_tenant_permission(p_tenant, 'members.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, m.role, m.custom_role_id, cr.name, m.status, p.display_name, u.email::text, m.created_at, u.last_sign_in_at
    from public.tenant_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    left join public.tenant_custom_roles cr on cr.id = m.custom_role_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end, m.created_at;
end;
$$;
revoke all on function public.list_tenant_members(uuid) from public, anon;
grant execute on function public.list_tenant_members(uuid) to authenticated;

revoke all on function app.role_grants(text, uuid), app.caller_holds_all(uuid, text[]) from public;
grant execute on function app.role_grants(text, uuid), app.caller_holds_all(uuid, text[]) to authenticated, service_role;
