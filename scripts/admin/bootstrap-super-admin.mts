/**
 * Creates (or re-activates) the platform super admin from environment variables.
 *
 *   SUPER_ADMIN_EMAIL=you@company.com SUPER_ADMIN_INITIAL_PASSWORD='…' \
 *     pnpm admin:bootstrap                 # uses .env / .env.local for the Supabase keys
 *   pnpm admin:bootstrap --reset-password   # also sets the password of an existing account
 *
 * - Credentials come only from the environment; nothing is hard-coded or printed.
 * - Idempotent: an existing auth user keeps their password unless --reset-password is passed.
 * - Uses the Supabase secret key (server-side script, ADR-006 "platform ops").
 * Remove SUPER_ADMIN_INITIAL_PASSWORD from the environment after the first sign-in and change
 * the password from the account menu.
 */

function env(name: string): string {
  const v = process.env[name] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
}

const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const EMAIL = env("SUPER_ADMIN_EMAIL").trim().toLowerCase();
const PASSWORD = env("SUPER_ADMIN_INITIAL_PASSWORD");
const RESET = process.argv.includes("--reset-password");

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!URL_ || !SECRET) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) fail("Set SUPER_ADMIN_EMAIL to a valid email address.");
if (PASSWORD.length < 12 || !/[a-z]/.test(PASSWORD) || !/[A-Z]/.test(PASSWORD) || !/\d/.test(PASSWORD)) {
  fail("SUPER_ADMIN_INITIAL_PASSWORD must be at least 12 characters with upper-case, lower-case and a digit.");
}

const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

async function api<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: T }> {
  const res = await fetch(`${URL_}${path}`, { method, headers: { ...headers, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

type AuthUser = { id: string; email?: string };

async function findUser(email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= 50; page++) {
    const { status, json } = await api<{ users: AuthUser[] }>("GET", `/auth/v1/admin/users?page=${page}&per_page=200`);
    if (status !== 200) fail(`Could not list users (HTTP ${status}).`);
    const hit = json.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (json.users.length < 200) return null;
  }
  return null;
}

let user = await findUser(EMAIL);
let created = false;
if (!user) {
  const { status, json } = await api<AuthUser & { msg?: string }>("POST", "/auth/v1/admin/users", { email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Super Admin" } });
  if (status >= 300 || !json?.id) fail(`Could not create the user (HTTP ${status}).`);
  user = json;
  created = true;
} else if (RESET) {
  const { status } = await api("PUT", `/auth/v1/admin/users/${user.id}`, { password: PASSWORD, email_confirm: true });
  if (status >= 300) fail(`Could not reset the password (HTTP ${status}).`);
}

const upsert = await api("POST", "/rest/v1/platform_memberships?on_conflict=user_id", { user_id: user.id, role: "super_admin", status: "active" }, { Prefer: "resolution=merge-duplicates,return=minimal" });
if (upsert.status >= 300) fail(`Could not grant the super_admin role (HTTP ${upsert.status}). Are all migrations applied?`);

await api("POST", "/rest/v1/audit_logs", { actor_user_id: user.id, actor_type: "system", action: "platform.super_admin_bootstrapped", entity_type: "user", entity_id: user.id, metadata: { created, password_reset: RESET && !created } }, { Prefer: "return=minimal" });

console.log(`✓ Super admin ${created ? "created" : "ready"}: ${EMAIL}${RESET && !created ? " (password reset)" : ""}`);
console.log("  Sign in at /admin/login, then remove SUPER_ADMIN_INITIAL_PASSWORD from your environment.");
