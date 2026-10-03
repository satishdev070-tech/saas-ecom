-- Give every store a subdomain under a NEW platform root domain (ops script, not a migration).
--
-- Store subdomains resolve only through verified `domains` rows (ADR-005), created as
-- `{slug}.{root}` with the root configured when the store was made. After changing
-- NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN, run this once in the Supabase SQL editor so existing stores
-- answer on `{slug}.{new root}`. New stores pick up the new root automatically.
--
-- What it does, per non-cancelled tenant:
--   1. Adds a verified `platform_subdomain` row `{slug}.{new root}` (skipped if it exists).
--   2. Makes it the primary (canonical) host ONLY when the current primary is a platform
--      subdomain. A verified custom domain stays primary, e.g. The Paliya's own domain.
-- Old `{slug}.{old root}` rows are left in place and keep working; nothing is deleted.
-- Idempotent: safe to run more than once. Change `new_root` below before running.

do $$
declare
  new_root constant text := 'buildbrighten.in';
  added int;
  promoted int;
begin
  if new_root !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception 'new_root must be a bare lowercase hostname, got %', new_root;
  end if;

  insert into public.domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary)
  select t.id, t.slug || '.' || new_root, 'platform_subdomain', 'verified', now(), 'not_applicable', false
  from public.tenants t
  where t.status <> 'cancelled'
    and not exists (
      select 1 from public.domains d
      where d.hostname = t.slug || '.' || new_root and d.status <> 'removed'
    );
  get diagnostics added = row_count;

  -- Tenants whose primary is a platform subdomain under another root: move primary to the new one.
  -- Clear the old primary first (one primary per tenant is enforced by a unique index).
  with targets as (
    select old.id as old_id, new.id as new_id
    from public.domains old
    join public.tenants t on t.id = old.tenant_id
    join public.domains new
      on new.tenant_id = old.tenant_id and new.hostname = t.slug || '.' || new_root
     and new.status = 'verified' and not new.is_primary
    where old.is_primary and old.status <> 'removed' and old.type = 'platform_subdomain'
  ), cleared as (
    update public.domains d set is_primary = false from targets where d.id = targets.old_id returning targets.new_id
  )
  select count(*) into promoted from cleared;

  update public.domains d set is_primary = true
  from public.tenants t
  where d.tenant_id = t.id and d.hostname = t.slug || '.' || new_root and d.status = 'verified'
    and not exists (select 1 from public.domains p where p.tenant_id = d.tenant_id and p.is_primary and p.status <> 'removed');

  raise notice 'move-platform-root: % subdomain rows added, % primaries moved to %', added, promoted, new_root;
end $$;
