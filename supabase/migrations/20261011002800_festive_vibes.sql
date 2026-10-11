-- =============================================================================
-- 2800 FESTIVE VIBES
-- Per-store festival looks (Navratri, Diwali, ...) scheduled by date range:
-- {"campaigns": [{id, preset, start, end, message, link, banner, garland, petals}]}.
-- Additive: existing stores get '{}' (no campaign). Public (anon) reads follow stores_public_select;
-- writes follow stores_update (settings.write). Application code treats a missing column as
-- "no campaign", so deploying before this migration is safe.
-- Down: alter table public.stores drop column festive_settings;
-- =============================================================================
alter table public.stores
  add column if not exists festive_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(festive_settings) = 'object');
comment on column public.stores.festive_settings is 'Scheduled festival looks for the storefront: {"campaigns": [...]} (see src/features/storefront/festive.ts).';
