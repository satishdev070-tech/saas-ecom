-- =============================================================================
-- 0100 FOUNDATION: extensions, private `app` schema, shared trigger helpers
-- =============================================================================
-- Conventions (see docs/DECISIONS.md):
--   * uuid PKs, timestamptz, numeric(12,2) money, text + CHECK for statuses
--   * every tenant-owned table: tenant_id NOT NULL + UNIQUE (tenant_id, id);
--     children reference (tenant_id, parent_id) so cross-tenant links are impossible
--   * RLS enabled on every table, default deny; policies call app.* helpers
--   * helper functions: SECURITY DEFINER, search_path = '' , fully qualified names
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema: NOT exposed through PostgREST (only `public` is), so nothing
-- here is callable as an RPC from the browser.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- updated_at maintenance -------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Prevent tenant_id from ever being changed on an existing row.
create or replace function app.freeze_tenant_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Attach both triggers to a table in one call (used by later migrations).
create or replace function app.add_standard_triggers(p_table regclass, p_has_tenant boolean default true, p_has_updated_at boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_table::text;
  n text := replace(replace(p_table::text, 'public.', ''), '"', '');
begin
  if p_has_updated_at then
    execute format('create trigger %I before update on %s for each row execute function app.set_updated_at()', 'trg_' || n || '_updated_at', t);
  end if;
  if p_has_tenant then
    execute format('create trigger %I before update of tenant_id on %s for each row execute function app.freeze_tenant_id()', 'trg_' || n || '_freeze_tenant', t);
  end if;
end;
$$;
