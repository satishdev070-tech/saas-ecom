/**
 * FormData -> plain object for zod parsing. Repeated keys become arrays; keys ending in
 * "[]" are always arrays. File entries are kept as File. Empty strings become undefined
 * so optional zod fields behave.
 */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    const v = typeof value === "string" ? (value === "" ? undefined : value) : value.size === 0 ? undefined : value;
    if (isArray) {
      const arr = (out[key] as unknown[] | undefined) ?? [];
      if (v !== undefined) arr.push(v);
      out[key] = arr;
    } else if (key in out && out[key] !== undefined) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Checkbox helper: "on"/"true" -> true, anything else -> false. */
export const checkbox = (v: unknown) => v === "on" || v === "true" || v === true;
