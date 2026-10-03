import type { InboxChannel } from "./webhook";

/**
 * Customer-service window (pure; shared by server and UI).
 * Messenger, Instagram and WhatsApp all allow free-form replies only within 24 hours of the
 * customer's last message. After that, WhatsApp needs a pre-approved message template and
 * Messenger/Instagram need an approved message tag (e.g. HUMAN_AGENT); neither is supported yet.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowState = { open: boolean; closesAt: string | null; remainingMs: number };

export function serviceWindow(lastInboundAt: string | null | undefined, now: number = Date.now()): WindowState {
  const t = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  if (Number.isNaN(t)) return { open: false, closesAt: null, remainingMs: 0 };
  const closes = t + WINDOW_MS;
  const remainingMs = Math.max(0, closes - now);
  return { open: remainingMs > 0, closesAt: new Date(closes).toISOString(), remainingMs };
}

/** "5h 12m left", "40m left", "Closed". */
export function windowLabel(w: WindowState): string {
  if (!w.open) return "Closed";
  const mins = Math.max(1, Math.floor(w.remainingMs / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m left` : `${mins}m left`;
}

export function windowClosedMessage(channel: InboxChannel): string {
  return channel === "whatsapp"
    ? "More than 24 hours have passed since the customer's last message. WhatsApp only allows a pre-approved message template now, which isn't supported here yet. Reply once the customer messages again, or use WhatsApp Business Manager."
    : "More than 24 hours have passed since the customer's last message. Meta only allows replies with an approved message tag after that, which isn't supported here yet. Reply once the customer messages again, or use Meta Business Suite.";
}

export const CHANNEL_NAME: Record<InboxChannel, string> = { facebook: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" };
export const INBOX_CHANNELS = ["facebook", "instagram", "whatsapp"] as const satisfies readonly InboxChannel[];
