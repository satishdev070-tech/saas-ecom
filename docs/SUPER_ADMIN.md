# Super admin console

Console at `/admin` for platform staff (`platform_memberships`: super_admin, support, finance).
Every page calls `requirePlatform(permission)`, and RLS / SQL functions enforce the same keys.

| Area | Route | Permission |
|---|---|---|
| Dashboard (KPIs, GMV trend, plans, activity) | `/admin` | platform.tenants.read |
| Stores: search, filters, sort, pagination | `/admin/stores` | platform.tenants.read |
| Store detail, actions, configuration | `/admin/tenants/{id}` | read; actions need platform.tenants.manage |
| Read-only support session | `/admin/tenants/{id}/support` | platform.support.impersonate |
| Domains, plans, feature flags | `/admin/domains`, `/admin/plans`, `/admin/flags` | tenants.read / plans.manage / flags.manage |
| Store integrations (status only) | `/admin/integrations` | platform.settings.manage |
| Platform health (env presence, booleans only) | `/admin/health` | platform.settings.manage |
| Usage, audit log, platform users, settings | `/admin/usage`, `/admin/audit`, `/admin/users`, `/admin/settings` | respective permissions |

Bootstrap and the store directory are covered in [SUPER_ADMIN_SETUP.md](SUPER_ADMIN_SETUP.md).

Feature flags added in phase 3 (per plan, overridable per store): `payments_cashfree`,
`payments_payu`, `delhivery`, `theme_marketplace`, `google_analytics`, `google_ads`, `meta_pixel`,
`social_media`, `creative_studio`. All are checked server-side in the action or service, not only
in the UI.
