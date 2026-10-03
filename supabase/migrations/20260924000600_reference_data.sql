-- =============================================================================
-- 0600 REFERENCE DATA + GRANTS
-- role_permissions MUST match src/lib/permissions/matrix.ts
-- (enforced by tests/unit/permissions-sql.test.ts)
-- =============================================================================

insert into public.role_permissions (role, permission) values
  -- viewer
  ('viewer','store.read'),('viewer','catalog.read'),('viewer','inventory.read'),('viewer','orders.read'),
  ('viewer','customers.read'),('viewer','marketing.read'),('viewer','analytics.read'),
  -- staff
  ('staff','store.read'),('staff','catalog.read'),('staff','inventory.read'),('staff','orders.read'),
  ('staff','customers.read'),('staff','marketing.read'),('staff','analytics.read'),
  ('staff','catalog.write'),('staff','inventory.write'),('staff','orders.write'),('staff','customers.write'),
  -- manager
  ('manager','store.read'),('manager','catalog.read'),('manager','inventory.read'),('manager','orders.read'),
  ('manager','customers.read'),('manager','marketing.read'),('manager','analytics.read'),
  ('manager','catalog.write'),('manager','inventory.write'),('manager','orders.write'),('manager','customers.write'),
  ('manager','orders.refund'),('manager','marketing.write'),('manager','content.write'),('manager','theme.edit'),('manager','reviews.moderate'),
  -- admin
  ('admin','store.read'),('admin','catalog.read'),('admin','inventory.read'),('admin','orders.read'),
  ('admin','customers.read'),('admin','marketing.read'),('admin','analytics.read'),
  ('admin','catalog.write'),('admin','inventory.write'),('admin','orders.write'),('admin','customers.write'),
  ('admin','orders.refund'),('admin','marketing.write'),('admin','content.write'),('admin','theme.edit'),('admin','reviews.moderate'),
  ('admin','theme.publish'),('admin','settings.write'),('admin','payments.manage'),('admin','domains.manage'),('admin','members.manage'),
  -- owner
  ('owner','store.read'),('owner','catalog.read'),('owner','catalog.write'),('owner','inventory.read'),('owner','inventory.write'),
  ('owner','orders.read'),('owner','orders.write'),('owner','orders.refund'),('owner','customers.read'),('owner','customers.write'),
  ('owner','marketing.read'),('owner','marketing.write'),('owner','content.write'),('owner','theme.edit'),('owner','theme.publish'),
  ('owner','reviews.moderate'),('owner','analytics.read'),('owner','settings.write'),('owner','payments.manage'),('owner','domains.manage'),
  ('owner','members.manage'),('owner','billing.manage')
on conflict do nothing;

insert into public.platform_role_permissions (role, permission) values
  ('super_admin','platform.tenants.read'),('super_admin','platform.tenants.manage'),('super_admin','platform.plans.manage'),
  ('super_admin','platform.flags.manage'),('super_admin','platform.users.manage'),('super_admin','platform.audit.read'),
  ('super_admin','platform.support.impersonate'),('super_admin','platform.settings.manage'),('super_admin','platform.usage.read'),
  ('support','platform.tenants.read'),('support','platform.audit.read'),('support','platform.support.impersonate'),('support','platform.usage.read'),
  ('finance','platform.tenants.read'),('finance','platform.plans.manage'),('finance','platform.usage.read')
on conflict do nothing;

insert into public.feature_flags (key, description, default_enabled) values
  ('custom_domains', 'Connect a custom domain', false),
  ('blog', 'Blog / journal', true),
  ('store_locator', 'Store locator page', false),
  ('reviews', 'Product reviews', true),
  ('cod', 'Cash on delivery', true),
  ('online_payments', 'Razorpay online payments', true),
  ('shiprocket', 'Shiprocket shipping integration', false),
  ('analytics_export', 'CSV exports of analytics', false)
on conflict do nothing;

insert into public.plans (code, name, description, price_monthly, price_yearly, limits, features, trial_days, sort_order) values
  ('starter', 'Starter', 'For new labels getting online', 999, 9990,
   '{"products": 200, "staff": 2, "storage_mb": 2048, "custom_domains": 0}', '{"custom_domains": false, "blog": true}', 14, 1),
  ('growth', 'Growth', 'For growing D2C brands', 2999, 29990,
   '{"products": 2000, "staff": 8, "storage_mb": 10240, "custom_domains": 1}', '{"custom_domains": true, "blog": true, "store_locator": true}', 14, 2),
  ('scale', 'Scale', 'For established fashion houses', 7999, 79990,
   '{"products": 20000, "staff": 30, "storage_mb": 51200, "custom_domains": 3}', '{"custom_domains": true, "blog": true, "store_locator": true, "analytics_export": true}', 14, 3)
on conflict (code) do nothing;

insert into public.platform_settings (key, value) values
  ('signup.enabled', 'true'::jsonb),
  ('support.email', '"support@example.com"'::jsonb)
on conflict do nothing;

-- Supabase grants table privileges to API roles by default; RLS then restricts rows.
-- Stated explicitly so a fresh database behaves identically.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- Tables without any anon policy are still deny-by-default for anon thanks to RLS.
