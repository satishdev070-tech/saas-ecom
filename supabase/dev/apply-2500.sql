-- Paste into the Supabase SQL editor. Additive only; one transaction; safe to run more than once.
-- Works whether or not apply-2000.sql (social suite) was applied.
begin;
-- =============================================================================
-- 2500 PLATFORM BRANDING, ANALYTICS, EMAIL PROVIDER AND STORE CHECKOUT OPTIONS
-- Additive only. No existing row is updated; every new option defaults to today's behaviour.
--
-- 1. Public platform settings. platform_settings stays readable only by platform staff, EXCEPT
--    keys under the `public.` prefix (marketing-site logos, favicon, GA4 measurement id), which
--    the public marketing site reads with the anon key. Writes still need
--    platform.settings.manage (existing platform_settings_manage policy).
-- 2. `platform-branding` storage bucket for those logo / favicon files: public read, writes only
--    by platform staff with platform.settings.manage. Raster images and .ico only (no SVG).
-- 3. `resend` becomes a platform app credential (API key stored encrypted, server-only table;
--    RLS on with no policies). Creates the table if migration 2000 was never applied.
-- 4. stores.checkout_settings: per-store checkout options. Missing keys mean the current
--    behaviour (guest checkout allowed, "use my location" offered).
--
-- Down:
--   drop policy platform_settings_public_select on public.platform_settings;
--   drop policy platform_branding_public_read / _insert / _update / _delete on storage.objects;
--   delete from storage.buckets where id = 'platform-branding';  (after emptying it)
--   alter table public.platform_app_credentials drop constraint platform_app_credentials_provider_check, add the 2000 list back;
--   alter table public.stores drop column checkout_settings;
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
drop policy if exists platform_settings_public_select on public.platform_settings;
create policy platform_settings_public_select on public.platform_settings for select to anon, authenticated
  using (key like 'public.%');

-- 2 ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platform-branding', 'platform-branding', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists platform_branding_public_read on storage.objects;
drop policy if exists platform_branding_insert on storage.objects;
drop policy if exists platform_branding_update on storage.objects;
drop policy if exists platform_branding_delete on storage.objects;
create policy platform_branding_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'platform-branding');
create policy platform_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'platform-branding' and app.has_platform_permission('platform.settings.manage'));
create policy platform_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'platform-branding' and app.has_platform_permission('platform.settings.manage'));
create policy platform_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'platform-branding' and app.has_platform_permission('platform.settings.manage'));

-- 3 ---------------------------------------------------------------------------
-- platform_app_credentials normally comes from migration 2000; databases that skipped it get
-- the same table here (identical definition), so the Resend key can be stored either way.
create table if not exists public.platform_app_credentials (
  provider text primary key,
  client_id text check (char_length(client_id) <= 300),
  secret_ciphertext text,
  extra jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_app_credentials enable row level security;
grant all on public.platform_app_credentials to service_role;
alter table public.platform_app_credentials drop constraint if exists platform_app_credentials_provider_check;
alter table public.platform_app_credentials add constraint platform_app_credentials_provider_check
  check (provider in ('meta', 'pinterest', 'google', 'whatsapp', 'gemini', 'groq', 'anthropic', 'resend'));

-- 4 ---------------------------------------------------------------------------
alter table public.stores
  add column if not exists checkout_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checkout_settings) = 'object');
comment on column public.stores.checkout_settings is 'Per-store checkout options: {"guest_checkout": bool (default true), "location_autofill": bool (default true)}.';
commit;
