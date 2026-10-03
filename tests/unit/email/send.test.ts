import { beforeEach, describe, expect, it, vi } from "vitest";

const env: { RESEND_API_KEY?: string; EMAIL_FROM: string } = { EMAIL_FROM: "The Paliya <no-reply@mail.example.com>" };
const inserted: Record<string, unknown>[] = [];
let sentRows: string[] = [];

vi.mock("@/lib/env/server", () => ({ serverEnv: () => env }));
vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      let key = "";
      const q = {
        select: () => q,
        eq: (col: string, v: string) => ((col === "idempotency_key" ? (key = v) : null), q),
        limit: () => q,
        maybeSingle: async () => ({ data: sentRows.includes(key) ? { id: 1 } : null }),
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          if (row.status === "sent") sentRows.push(row.idempotency_key as string);
          return { error: null };
        },
      };
      return q;
    },
  }),
}));

const { sendEmail } = await import("@/lib/email/send");
const input = { tenantId: "t1", kind: "order_placed", to: "Asha@Example.in", subject: "S", html: "<p>secret body Asha</p>", text: "secret body", fromName: "Ramya", replyTo: "store@x.in", idempotencyKey: "t1:order:1:placed:email" };

describe("sendEmail", () => {
  beforeEach(() => {
    inserted.length = 0;
    sentRows = [];
    env.RESEND_API_KEY = undefined;
    vi.unstubAllGlobals();
  });

  it("without RESEND_API_KEY: logs metadata only and reports 'logged', not 'sent'", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await sendEmail(input);
    expect(r.status).toBe("logged");
    expect(f).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: "logged", provider: "log", recipient_masked: "a***@example.in" });
    expect(JSON.stringify(inserted)).not.toMatch(/secret body|asha@example\.in/i);
  });

  it("sends once per idempotency key", async () => {
    env.RESEND_API_KEY = "re_test_12345678";
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await sendEmail(input)).toEqual({ status: "sent", providerMessageId: "em_1" });
    expect(await sendEmail(input)).toEqual({ status: "skipped", error: "already sent" });
    expect(f).toHaveBeenCalledOnce();
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.from).toBe("Ramya <no-reply@mail.example.com>");
    expect(body.to).toEqual(["asha@example.in"]);
    expect(body.reply_to).toBe("store@x.in");
  });

  it("records failures and skips invalid recipients", async () => {
    env.RESEND_API_KEY = "re_test_12345678";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect((await sendEmail(input)).status).toBe("failed");
    expect(inserted.at(-1)).toMatchObject({ status: "failed" });
    expect((await sendEmail({ ...input, to: "not-an-email" })).status).toBe("skipped");
  });
});
