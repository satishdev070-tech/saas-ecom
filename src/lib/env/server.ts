import "server-only";
import { parseEnv, serverEnvSchema, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/**
 * Validated server environment. Parsed lazily on first use so `next build` can
 * prerender env-independent pages, but any request path that needs config fails
 * fast with a clear message listing missing variable names.
 */
export function serverEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env);
  return cached;
}
