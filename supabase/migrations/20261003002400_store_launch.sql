-- =============================================================================
-- 2400 STORE LAUNCH STATUS
-- New stores created through seller onboarding start as a private draft ("coming soon" to
-- visitors) and go live when the owner publishes them from the dashboard.
--
-- Additive and backwards compatible:
--   * every EXISTING store gets launch_status = 'live' from the column default, so no live store
--     changes behaviour (no business data is updated);
--   * stores created by other paths (create_tenant called directly, admin tools, seeders) also
--     default to 'live'; only the onboarding flow sets 'draft' explicitly;
--   * application code treats a missing column as 'live', so deploying the code before this
--     migration is safe.
-- Down: alter table public.stores drop column launch_status, drop column launched_at;
-- =============================================================================

alter table public.stores
  add column if not exists launch_status text not null default 'live' check (launch_status in ('draft', 'live')),
  add column if not exists launched_at timestamptz;

comment on column public.stores.launch_status is 'draft = storefront shows a coming-soon page to visitors; live = open. Set by onboarding / the owner''s Publish action.';
comment on column public.stores.launched_at is 'When the owner published the store from draft (null for stores that were never drafts).';
