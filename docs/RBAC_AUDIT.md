# RBAC Audit

## Before

Five hard-coded tenant roles (`owner admin manager staff viewer`) enforced by `role_permissions`, with coarse permissions
(`catalog.write` also allowed deleting and publishing; `orders.write` also allowed cancelling). No custom roles; the team page only
offered four roles; any `members.manage` holder could assign any non-owner role, including one more powerful than their own.
A latent bug: accepting an invitation overwrote an existing membership's role, which could downgrade a Store Owner.

## After (migration `20260926001200_rbac.sql`)

### Permissions (27)

`store.read` · `catalog.read/write/delete/publish` · `inventory.read/write` · `orders.read/write/cancel/refund` ·
`customers.read/write` · `marketing.read/write` · `reviews.moderate` · `content.write` · `theme.edit/publish` · `analytics.read` ·
`settings.write` · `payments.manage` · `domains.manage` · `members.read/manage` · `roles.manage` · `billing.manage` (owner only).

The keys differ in spelling from the brief's examples (e.g. `catalog.write` rather than `products.create` + `products.update`),
because RLS policies across 66 tables already use them. Labels and descriptions in the UI use plain language
(`lib/permissions/labels.ts`). New keys were added only where the database can actually enforce them:

| Permission | Enforced by |
|---|---|
| `catalog.delete` | separate DELETE policies on products, collections, categories + server actions |
| `catalog.publish` | trigger `guard_product_publish` (status → active) + server action |
| `orders.cancel` | `cancel_order` RPC + server action |
| `members.read` | `list_tenant_members` RPC |
| `roles.manage` | RLS on `tenant_custom_roles` |

### System roles (12)

Store Owner · Store Admin · Store Manager · Catalog Manager · Order Manager · Inventory Manager · Marketing Manager · Content Manager ·
Analyst · Support Agent · Staff (legacy) · Viewer (legacy). The matrix lives in `lib/permissions/matrix.ts` and the SQL seed must match it
(`tests/unit/permissions-sql.test.ts`). **Store Owner never has platform permissions**: platform access comes only from `platform_memberships`.

### Custom roles

`tenant_custom_roles` (name, description, permissions[]), assigned via `tenant_memberships.custom_role_id` (role = `custom`).
`app.has_tenant_permission` checks system role grants or the custom role's array. Custom roles can never include `billing.manage`.

### Escalation guards (database triggers; the service role is exempt)

- Creating or editing a custom role: every permission must be held by the caller (`guard_custom_role`).
- Assigning a role (membership update or invitation): the role's permissions must all be held by the caller (`guard_membership_role`).
- Nobody can change their own role. Owner memberships stay untouchable (existing RLS).
- Invitation acceptance no longer changes an owner's role.
- All role create/update/delete actions are audited (`role.created|updated|deleted`), as are member invite/resend/role/deactivate/remove.

## UI

- **Settings → Team** (`members.read`): members with role, status, last active; invite dialog (shows the link), inline role change,
  deactivate/reactivate/remove with confirmation; pending invitations with resend/revoke. Roles the current user can't grant are disabled.
- **Settings → Roles & permissions** (`roles.manage`): custom roles (member counts, edit, delete-when-unused) and a read-only view of every
  standard role's permissions. The role editor groups permissions, with search, select/clear per group and overall, descriptions,
  and locks the permissions the editor doesn't hold.

## Tests (`tests/rls/rbac.test.ts`, 8 cases)

Custom roles grant exactly their list and are audited · billing can't be granted · other tenants can't see/edit them · a team lead can't
create or assign roles beyond their own permissions, can't change their own role, and can't invite someone as admin · admins can't
touch the owner · delete/publish need their own permissions · cancelling needs `orders.cancel` · new system roles resolve correctly.

## Remaining

- Ownership transfer between members is not built (owner stays fixed).
- Brief-style keys like `products.view` aren't used literally (see above). The mapping is 1:1 in the permission editor.
- Custom-role changes apply on the member's next request; there is no push invalidation.
