/**
 * Fingerprints every row a tenant owns (per table: row count + SHA-256 of the canonical rows),
 * so a later run can prove the tenant was not modified. Read-only.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/protect/snapshot-tenant.mts <tenant-id> [compare-with.json]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const env = (n: string) => {
  const v = process.env[n] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1)] ?? "") : v;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const KEY = env("SUPABASE_SECRET_KEY");
const [tenantId, compareFile] = process.argv.slice(2);
if (!tenantId || !/^[0-9a-f-]{36}$/.test(tenantId)) throw new Error("usage: snapshot-tenant.mts <tenant-id> [compare.json]");

const TABLES = [
  "stores", "products", "product_variants", "product_options", "product_option_values", "product_media", "categories", "collections", "collection_products",
  "pages", "blog_posts", "faqs", "menus", "menu_items", "theme_versions", "media_assets", "domains", "reviews", "inventory_levels", "size_charts",
  "shipping_rates", "pincode_rules", "tenant_memberships", "tenant_integrations", "redirects", "discounts", "customers", "orders", "social_posts", "creatives",
];

async function rows(table: string): Promise<unknown[] | null> {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*&tenant_id=eq.${tenantId}&order=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (res.status === 400 || res.status === 404) {
      // Table without an id column or not present in this schema: retry without ordering.
      const r2 = await fetch(`${URL_}/rest/v1/${table}?select=*&tenant_id=eq.${tenantId}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (!r2.ok) return null;
      return (await r2.json()) as unknown[];
    }
    const page = (await res.json()) as unknown[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
/**
 * Columns added by later migrations are left out of the hash, as table.column
 * (e.g. SNAPSHOT_IGNORE_COLUMNS=tenants.store_type,stores.category_id for migration 1800).
 */
const IGNORE = new Set((process.env.SNAPSHOT_IGNORE_COLUMNS ?? "").split(",").map((c) => c.trim()).filter(Boolean));
const strip = (table: string) => (r: unknown) => (r && typeof r === "object" && !Array.isArray(r) ? Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k]) => !IGNORE.has(`${table}.${k}`))) : r);

const snapshot: Record<string, { count: number; sha256: string }> = {};
const tenantRow = await (await fetch(`${URL_}/rest/v1/tenants?select=*&id=eq.${tenantId}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
snapshot.tenants = { count: tenantRow.length, sha256: createHash("sha256").update(JSON.stringify(canon((tenantRow as unknown[]).map(strip("tenants"))))).digest("hex") };
for (const t of TABLES) {
  const r = await rows(t);
  if (r === null) continue;
  const sorted = [...r].map((x) => JSON.stringify(canon(strip(t)(x)))).sort();
  snapshot[t] = { count: r.length, sha256: createHash("sha256").update(sorted.join("\n")).digest("hex") };
}
if (compareFile) {
  const before = JSON.parse(readFileSync(compareFile, "utf8")) as Record<string, { count: number; sha256: string }>;
  let changed = 0;
  for (const [t, v] of Object.entries(before)) {
    const now = snapshot[t];
    const same = now && now.count === v.count && now.sha256 === v.sha256;
    if (!same) changed++;
    console.log(`${same ? "✓" : "✗"} ${t.padEnd(22)} ${v.count} → ${now?.count ?? "missing"}`);
  }
  console.log(changed ? `✗ ${changed} table(s) changed` : "✓ tenant unchanged (all tables identical)");
  process.exit(changed ? 1 : 0);
} else {
  const file = `paliya-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  writeFileSync(process.env.SNAPSHOT_OUT ?? file, JSON.stringify(snapshot, null, 1));
  console.log(JSON.stringify(snapshot, null, 1));
}
