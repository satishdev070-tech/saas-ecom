import "server-only";
import { cookies } from "next/headers";

export const EVENT_FLAG_COOKIE = "pl_ev";

/** Marks a login / sign_up for the browser tag layer to send after the redirect (60 s, no personal data). */
export async function flagClientEvent(name: "login" | "sign_up", method: string) {
  (await cookies()).set(EVENT_FLAG_COOKIE, `${name}:${method}`, { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
}
