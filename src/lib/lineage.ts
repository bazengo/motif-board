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
