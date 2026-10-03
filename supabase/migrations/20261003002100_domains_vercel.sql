-- =============================================================================
-- Custom domains on Vercel (additive). docs/DEPLOY_VERCEL.md
--   * provider           which edge registered the hostname ('vercel' | 'cloudflare'); null = none yet
--   * provider_status    detailed edge state from the provider API (never set by sellers)
--   * dns_records        the exact records the seller must create (from the provider API), cached
--                        so the settings page renders without calling the provider
--   * redirect_hostname  the apex <-> www companion registered on the edge as a 308 redirect
--                        to this hostname (it never routes to a store by itself)
-- Status = 'verified' is still only written by server code with the secret key.
-- =============================================================================

alter table public.domains
  add column if not exists provider text check (provider in ('vercel', 'cloudflare')),
  add column if not exists provider_status text check (provider_status in ('pending_dns', 'verifying', 'misconfigured', 'active', 'error')),
  add column if not exists dns_records jsonb not null default '[]'::jsonb check (jsonb_typeof(dns_records) = 'array'),
  add column if not exists redirect_hostname text check (
    redirect_hostname is null
    or (redirect_hostname = lower(redirect_hostname) and char_length(redirect_hostname) <= 253
        and redirect_hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$')
  );

-- Sellers may only insert a bare pending row: edge/provider fields are server-owned.
drop policy if exists domains_insert on public.domains;
create policy domains_insert on public.domains for insert to authenticated with check (
  app.has_tenant_permission(tenant_id, 'domains.manage')
  and type = 'custom' and status = 'pending' and not is_primary and verified_at is null
  and provider is null and provider_status is null and provider_ref is null
  and redirect_hostname is null and dns_records = '[]'::jsonb
);
