/**
 * Adds SAMPLE reviews to the-paliya's products so the review UI can be previewed. Every row has
 * source = 'sample': the storefront shows a "Sample review" label on each one, and
 * Dashboard → Reviews → "Remove sample reviews" deletes them all. Remove them before launch.
 * Requires migration 1700 (supabase/dev/apply-1700.sql). Idempotent: skips if samples exist.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/import-thepaliya/sample-reviews.mts
 */
const env = (n: string) => {
  const v = process.env[n] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1)] ?? "") : v;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const rest = async <T = unknown,>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${t.slice(0, 300)}`);
  return (t ? JSON.parse(t) : null) as T;
};

const probe = await fetch(`${URL_}/rest/v1/reviews?select=source&limit=1`, { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } });
if (!probe.ok) {
  console.error("✗ Apply supabase/dev/apply-1700.sql in the Supabase SQL Editor first (adds reviews.source).");
  process.exit(1);
}
const [tenant] = await rest<{ id: string }[]>("GET", "tenants?select=id&slug=eq.the-paliya");
const T = tenant!.id;
const have = await rest<{ id: string }[]>("GET", `reviews?select=id&tenant_id=eq.${T}&source=eq.sample&limit=1`);
if (have.length) {
  console.log("Sample reviews already exist; nothing to do.");
  process.exit(0);
}
const products = await rest<{ id: string; title: string }[]>("GET", `products?select=id,title&tenant_id=eq.${T}&status=eq.active`);
const NAMES = ["Priya S.", "Neha R.", "Ananya M.", "Kavya J.", "Ritika P.", "Sneha K.", "Pooja T.", "Aditi V.", "Meera D.", "Isha B.", "Divya N.", "Shreya G."];
const TEXTS: [number, string, string][] = [
  [5, "Lovely print and fabric", "The block print is even prettier in person and the cotton feels soft and breathable. Perfect for summer days."],
  [5, "Fits beautifully", "Ordered my usual size and the fit is spot on. Stitching is neat and the colour hasn't faded after washing."],
  [4, "Very comfortable", "Comfortable for a full day at work. Slightly longer than I expected, but it looks graceful."],
  [5, "Got so many compliments", "Wore it to a family lunch and everyone asked where it's from. Quick delivery and nice packaging too."],
  [4, "Good quality for the price", "Nice finish and the colours are true to the photos. Would love more sizes in this design."],
  [5, "Will order again", "Beautiful handcrafted piece. The fabric is light and the print is crisp. Already eyeing my next order."],
];
const rows = products.flatMap((p, i) =>
  [0, 1, 2].map((k) => {
    const [rating, title, body] = TEXTS[(i * 2 + k) % TEXTS.length]!;
    const daysAgo = 3 + ((i * 7 + k * 11) % 80);
    return { tenant_id: T, product_id: p.id, rating, title, body, author_name: NAMES[(i * 3 + k) % NAMES.length], status: "approved", verified_purchase: false, source: "sample", created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() };
  }),
);
await rest("POST", "reviews", rows);
console.log(`✓ Added ${rows.length} SAMPLE reviews (labelled "Sample review" on the store). Remove them in Dashboard → Reviews before launch.`);
