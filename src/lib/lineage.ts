import type { Brick } from '../types';

/** Descendants of `id` (its whole subtree, excluding itself). Used to prevent
 *  cycles when re-parenting. */
export function descendantIds(bricks: Brick[], id: string): Set<string> {
  const out = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const b of bricks) {
      if (b.parentId && (b.parentId === id || out.has(b.parentId)) && !out.has(b.id)) {
        out.add(b.id);
        added = true;
      }
    }
  }
  return out;
}

/**
 * The brick at the top of `id`'s lineage — follow parentId until it runs out.
 * Returns `id` itself for a root. Guards against a cycle, which shouldn't be
 * reachable (setParent refuses them) but would otherwise hang.
 */
export function rootOf(bricks: Brick[], id: string): string {
  const byId = new Map(bricks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = byId.get(cur)?.parentId;
    if (!parent || !byId.has(parent)) return cur;
    cur = parent;
  }
  return cur;
}

/** Roots of every lineage that actually has more than one brick — a lone
 *  brick isn't a lineage worth labelling. */
export function lineageRoots(bricks: Brick[]): Brick[] {
  const counts = new Map<string, number>();
  for (const b of bricks) {
    const r = rootOf(bricks, b.id);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return bricks.filter((b) => (counts.get(b.id) ?? 0) > 1);
}

/** All bricks connected to `id` through parent/child links (the whole lineage
 *  tree it belongs to), including `id` itself. */
export function familyIds(bricks: Brick[], id: string): Set<string> {
  const byId = new Map(bricks.map((b) => [b.id, b]));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const b of bricks) {
    if (b.parentId && byId.has(b.parentId)) {
      link(b.id, b.parentId);
      link(b.parentId, b.id);
    }
  }
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen;
}
