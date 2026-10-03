/**
 * Minimal structured JSON logger. Redacts obvious secrets/PII keys so accidental
 * `logger.info({ user })` calls don't leak tokens, passwords or phone numbers.
 * Swap the sink for a provider (Sentry/Axiom/Logflare) in the hardening phase.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|signature|otp|card|cvv|phone|email/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

function minLevel(): Level {
  const l = process.env.LOG_LEVEL;
  return l === "debug" || l === "info" || l === "warn" || l === "error" ? l : "info";
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[minLevel()]) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
