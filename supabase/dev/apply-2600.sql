-- Paste into the Supabase SQL editor (after apply-2500.sql). Additive only (two functions); safe to re-run.
begin;
drop function if exists public.move_custom_domain(uuid, uuid);
-- =============================================================================
-- 2600 MOVE A CUSTOM DOMAIN BETWEEN STORES; OWNER CAN CLOSE A STORE
-- Additive (two functions). No data is changed by applying this file.
--
-- move_custom_domain: a seller who manages BOTH stores moves an already-connected custom domain
--   (e.g. thepaliya.com) to their other store. Ownership was proven when the domain was verified
--   and the hostname is unchanged, so it stays verified: no DNS change, no downtime. A verified
--   domain becomes the target store's primary address; the source store falls back to its
--   platform subdomain if it was primary there.
-- close_own_store: the store OWNER closes a store they no longer use (status 'cancelled').
--   Nothing is deleted: products, orders and customers are kept and platform support can reopen
--   it (Admin → Stores → status). Refused while it still has a custom domain (move or remove it
--   first) and requires typing the store's address (slug) to confirm.
-- Down: drop function public.move_custom_domain(uuid, uuid);  (moved rows stay moved) drop function public.close_own_store(uuid, text);
-- =============================================================================

create or replace function public.move_custom_domain(p_domain uuid, p_target uuid)
returns table (source_tenant uuid, target_tenant uuid, hostname text, made_primary boolean, new_domain uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.domains%rowtype;
  v_target_status text;
  v_primary boolean := false;
  v_new uuid;
begin
  select * into d from public.domains where id = p_domain for update;
  if not found or d.status = 'removed' or not app.has_tenant_permission(d.tenant_id, 'domains.manage') then
    raise exception 'domain not found' using errcode = 'P0002';
  end if;
  if d.type <> 'custom' then
    raise exception 'the platform subdomain cannot be moved' using errcode = '22023', hint = 'PLATFORM_SUBDOMAIN';
  end if;
  if p_target = d.tenant_id then
    raise exception 'the domain is already on this store' using errcode = '22023', hint = 'SAME_STORE';
  end if;
  if not app.has_tenant_permission(p_target, 'domains.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select status into v_target_status from public.tenants where id = p_target for update;
  if not found or v_target_status = 'cancelled' then
    raise exception 'store not found' using errcode = 'P0002';
  end if;

  -- Source: hand the primary role back to its platform subdomain.
  if d.is_primary then
    update public.domains set is_primary = false where id = d.id;
    update public.domains set is_primary = true
    where id = (select x.id from public.domains x where x.tenant_id = d.tenant_id and x.type = 'platform_subdomain' and x.status = 'verified' order by x.created_at limit 1);
  end if;

  -- Target: a verified domain becomes the store's primary address.
  if d.status = 'verified' then
    update public.domains set is_primary = false where tenant_id = p_target and is_primary;
    v_primary := true;
  end if;
  -- tenant_id is frozen on every row (app.freeze_tenant_id), so the source row is retired (kept
  -- for history, like remove_custom_domain) and an identical row is created for the target in
  -- the same transaction: same hostname, verification and edge state.
  update public.domains set status = 'removed', is_primary = false where id = d.id;
  insert into public.domains (tenant_id, hostname, type, status, verification_token, verified_at, ssl_status, is_primary,
    provider_ref, last_checked_at, last_error, provider, provider_status, dns_records, redirect_hostname)
  values (p_target, d.hostname, d.type, d.status, d.verification_token, d.verified_at, d.ssl_status, v_primary,
    d.provider_ref, d.last_checked_at, d.last_error, d.provider, d.provider_status, d.dns_records, d.redirect_hostname)
  returning id into v_new;

  perform app.audit(d.tenant_id, 'domain.moved_out', 'domain', d.id::text, jsonb_build_object('hostname', d.hostname, 'to_tenant', p_target, 'new_domain', v_new), 'user');
  perform app.audit(p_target, 'domain.moved_in', 'domain', v_new::text, jsonb_build_object('hostname', d.hostname, 'from_tenant', d.tenant_id, 'from_domain', d.id, 'primary', v_primary), 'user');
  return query select d.tenant_id, p_target, d.hostname, v_primary, v_new;
end;
$$;

create or replace function public.close_own_store(p_tenant uuid, p_confirm_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.tenants%rowtype;
begin
  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = p_tenant and m.user_id = app.uid() and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'only the store owner can close this store' using errcode = '42501';
  end if;
  select * into t from public.tenants where id = p_tenant for update;
  if not found or t.status = 'cancelled' then
    raise exception 'store not found' using errcode = 'P0002';
  end if;
  if lower(trim(coalesce(p_confirm_slug, ''))) <> t.slug then
    raise exception 'type the store address to confirm' using errcode = '22023', hint = 'CONFIRM_MISMATCH';
  end if;
  if exists (select 1 from public.domains x where x.tenant_id = p_tenant and x.type = 'custom' and x.status <> 'removed') then
    raise exception 'move or remove the custom domain first' using errcode = '22023', hint = 'HAS_CUSTOM_DOMAIN';
  end if;
  update public.tenants set status = 'cancelled', status_reason = 'Closed by the store owner' where id = p_tenant;
  perform app.audit(p_tenant, 'tenant.closed_by_owner', 'tenant', p_tenant::text, jsonb_build_object('from', t.status), 'user');
end;
$$;

revoke all on function public.move_custom_domain(uuid, uuid) from public, anon;
revoke all on function public.close_own_store(uuid, text) from public, anon;
grant execute on function public.move_custom_domain(uuid, uuid) to authenticated;
grant execute on function public.close_own_store(uuid, text) to authenticated;
commit;
