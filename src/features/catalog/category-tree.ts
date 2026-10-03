import { MAX_CATEGORY_DEPTH } from "./constants";

/**
 * Pure helpers for the nested category tree (dashboard list, parent pickers, cycle checks).
 * The DB only forbids a category being its own parent; deeper cycles and depth are checked
 * here before every write (see server/categories.ts).
 */

export type CategoryLike = { id: string; parentId: string | null; name: string; position: number };
export type FlatCategory<T extends CategoryLike> = T & { depth: number; path: string[] };

function childrenMap<T extends CategoryLike>(rows: T[]): Map<string | null, T[]> {
  const ids = new Set(rows.map((r) => r.id));
  const map = new Map<string | null, T[]>();
  for (const r of rows) {
    // orphans (parent missing / hidden by RLS) are shown at the top level
    const key = r.parentId && ids.has(r.parentId) && r.parentId !== r.id ? r.parentId : null;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return map;
}

/**
 * Depth-first, position-ordered list with depth (0 = top level) and the ancestor name path.
 * Rows caught in a cycle (bad data) are appended at the top level instead of looping.
 */
export function flattenCategoryTree<T extends CategoryLike>(rows: T[]): FlatCategory<T>[] {
  const map = childrenMap(rows);
  const out: FlatCategory<T>[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number, path: string[]) => {
    for (const r of map.get(parent) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ ...r, depth, path });
      walk(r.id, depth + 1, [...path, r.name]);
    }
  };
  walk(null, 0, []);
  for (const r of rows) if (!seen.has(r.id)) out.push({ ...r, depth: 0, path: [] });
  return out;
}

/** All descendants of `id` (not including itself). */
export function descendantIds<T extends CategoryLike>(rows: T[], id: string): Set<string> {
  const map = childrenMap(rows);
  const out = new Set<string>();
  const stack = [...(map.get(id) ?? [])];
  while (stack.length) {
    const r = stack.pop()!;
    if (out.has(r.id) || r.id === id) continue;
    out.add(r.id);
    stack.push(...(map.get(r.id) ?? []));
  }
  return out;
}

/** True when making `newParentId` the parent of `id` would create a loop. */
export function wouldCreateCycle<T extends CategoryLike>(rows: T[], id: string | null, newParentId: string | null): boolean {
  if (!id || !newParentId) return false;
  if (id === newParentId) return true;
  return descendantIds(rows, id).has(newParentId);
}

/** Number of ancestors of `id` (0 for a top-level category). Stops on cycles. */
export function depthOf<T extends CategoryLike>(rows: T[], id: string | null): number {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let depth = 0;
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth++;
    cur = byId.get(cur.parentId);
  }
  return depth;
}

/** Height of the subtree under `id` (0 when it has no children). */
export function subtreeHeight<T extends CategoryLike>(rows: T[], id: string): number {
  const map = childrenMap(rows);
  const height = (n: string, guard: Set<string>): number => {
    const kids = (map.get(n) ?? []).filter((k) => !guard.has(k.id));
    if (!kids.length) return 0;
    return 1 + Math.max(...kids.map((k) => height(k.id, new Set([...guard, k.id]))));
  };
  return height(id, new Set([id]));
}

/**
 * Validates a parent change. Returns an error message or null.
 * Levels are 1-based: a top-level category is level 1; MAX_CATEGORY_DEPTH levels allowed.
 */
export function validateCategoryParent<T extends CategoryLike>(rows: T[], id: string | null, parentId: string | null, maxDepth = MAX_CATEGORY_DEPTH): string | null {
  if (!parentId) return null;
  if (!rows.some((r) => r.id === parentId)) return "Choose an existing parent category";
  if (wouldCreateCycle(rows, id, parentId)) return "A category can't be placed inside itself or one of its subcategories";
  const levels = depthOf(rows, parentId) + 2 + (id ? subtreeHeight(rows, id) : 0);
  if (levels > maxDepth) return `Categories can be nested at most ${maxDepth} levels deep`;
  return null;
}

/** "Women › Kurtas › Straight" */
export function categoryLabel<T extends CategoryLike>(flat: FlatCategory<T>): string {
  return [...flat.path, flat.name].join(" › ");
}
