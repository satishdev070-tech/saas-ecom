# RBAC

Single source: `src/lib/permissions/matrix.ts` (27 tenant permissions, 12 system roles + custom
roles, 8 platform permissions). SQL helpers `app.has_tenant_permission` and
`app.has_platform_permission` enforce the same keys in RLS. Full design, escalation guards and
tests: [RBAC_AUDIT.md](RBAC_AUDIT.md).

## Phase 3 permission map

| Capability | Permission | Enforced in |
|---|---|---|
| View / connect / disconnect payment gateways | payments.manage | `saveCredentials`, `setEnabled`, `disconnect` (registry `permission`) |
| Courier + analytics integrations, default courier, SEO settings | settings.write | same + `setDefaultCourierAction`, `saveSeoSettingsAction` |
| Book, label, pickup, cancel shipments | orders.write (tracking: orders.read) | `features/shipping/service.ts` |
| Social accounts, posts, creative studio | marketing.write (view: marketing.read) | social and creative actions, OAuth routes; RLS on `social_posts`, `creatives` |
| Apply marketplace theme | theme.edit (publish: theme.publish) | `applyMarketplaceThemeAction`; RLS on `theme_versions` |
| Security & activity page | members.manage | page guard + `audit_logs` RLS |
| Store directory / detail | platform.tenants.read (actions: platform.tenants.manage) | `requirePlatform`, `platform_list_stores` |
| Store integrations overview, creative template writes | platform.settings.manage | page guard; RLS on `creative_templates` |

`tenant_integrations` has **no** RLS policies: no client role can read or write it, and all access
goes through server functions that take a server-resolved tenant id and check the permission
first (DB test: `tests/rls/platform-control.test.ts`).
