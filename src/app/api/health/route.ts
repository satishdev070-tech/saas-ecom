import { NextResponse } from "next/server";

/** Liveness probe for load balancers / uptime checks. No secrets, no DB access. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
