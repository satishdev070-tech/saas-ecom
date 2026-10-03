import { NextResponse, type NextRequest } from "next/server";
import { getRequestHost } from "@/lib/tenant/resolve";
import { handlePayuWebhook } from "@/features/payments/gateways";

/** PayU webhook for a store (https://{store host}/api/webhooks/payu), form-encoded with a reverse hash. */
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > 64 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const params: Record<string, string> = {};
  const contentType = request.headers.get("content-type") ?? "";
  try {
    const source = contentType.includes("json") ? Object.entries(JSON.parse(text) as Record<string, unknown>) : [...new URLSearchParams(text).entries()];
    for (const [k, v] of source) if (typeof v === "string" && k.length <= 40) params[k] = v.slice(0, 500);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const res = await handlePayuWebhook({ host: await getRequestHost(), params });
  return NextResponse.json(res.body, { status: res.status });
}
