import { NextResponse } from "next/server";
import { EnvValidationError, parseEnv, serverEnvSchema } from "@/lib/env/schema";

/**
 * Readiness probe for new deployments (e.g. Hostinger, where runtime logs are hard to reach).
 * Reports which environment variables are missing or invalid (names and reasons only, never
 * values) and whether Supabase answers. No DB access, no secrets in the response.
 */
export const dynamic = "force-dynamic";

async function supabaseReachable(url: string | undefined, key: string | undefined): Promise<{ ok: boolean; detail: string }> {
  if (!url || !key) return { ok: false, detail: "skipped: Supabase URL or publishable key is not set" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, detail: res.ok ? "reachable" : `answered HTTP ${res.status} (check the URL and publishable key)` };
  } catch (e) {
    return { ok: false, detail: `unreachable: ${e instanceof Error ? e.name : "error"}` };
  }
}

export async function GET() {
  let envIssues: string[] = [];
  try {
    parseEnv(serverEnvSchema, process.env);
  } catch (e) {
    envIssues = e instanceof EnvValidationError ? e.issues : ["environment could not be validated"];
  }
  const supabase = await supabaseReachable(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const ok = envIssues.length === 0 && supabase.ok;
  return NextResponse.json(
    { ok, env: envIssues.length ? { ok: false, issues: envIssues } : { ok: true }, supabase, node: process.version },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
