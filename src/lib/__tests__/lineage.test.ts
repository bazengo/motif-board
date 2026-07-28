import { describe, it, expect } from 'vitest';
import {
  descendantIds,
  familyIds,
  rootOf,
  lineageRoots,
  reparentAfterDelete,
} from '../lineage';
import { testBrick } from './fixtures';

// root -> child -> grandchild, plus a sibling of child, plus an unrelated brick
function tree() {
  const root = testBrick({ name: 'root' });
  const child = testBrick({ name: 'child', parentId: root.id });
  const sibling = testBrick({ name: 'sibling', parentId: root.id });
  const grandchild = testBrick({ name: 'grandchild', parentId: child.id });
  const loner = testBrick({ name: 'loner' });
  return { root, child, sibling, grandchild, loner, all: [root, child, sibling, grandchild, loner] };
}

describe('descendantIds', () => {
  it('collects the whole subtree, excluding the node itself', () => {
    const { root, child, sibling, grandchild, all } = tree();
    expect(descendantIds(all, root.id)).toEqual(
      new Set([child.id, sibling.id, grandchild.id])
    );
  });

  it('reaches through multiple generations', () => {
    const { child, grandchild, all } = tree();
    expect(descendantIds(all, child.id)).toEqual(new Set([grandchild.id]));
  });

  it('is empty for a leaf', () => {
    const { grandchild, all } = tree();
    expect(descendantIds(all, grandchild.id).size).toBe(0);
  });
});

describe('familyIds', () => {
  it('includes the whole connected tree regardless of direction', () => {
    const { root, child, sibling, grandchild, all } = tree();
    const fam = familyIds(all, grandchild.id);
    expect(fam).toEqual(new Set([root.id, child.id, sibling.id, grandchild.id]));
  });

  it('always contains the brick itself', () => {
    const { loner, all } = tree();
    expect(familyIds(all, loner.id)).toEqual(new Set([loner.id]));
  });

  it('excludes unrelated bricks', () => {
    const { root, loner, all } = tree();
    expect(familyIds(all, root.id).has(loner.id)).toBe(false);
  });

  it('ignores parent links pointing at deleted bricks', () => {
    const orphan = testBrick({ parentId: 'deleted' });
    expect(familyIds([orphan], orphan.id)).toEqual(new Set([orphan.id]));
  });
});

describe('rootOf', () => {
  it('returns the brick itself when it has no parent', () => {
    const a = testBrick();
    expect(rootOf([a], a.id)).toBe(a.id);
  });

  it('walks up a chain to the top', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const c = testBrick({ parentId: b.id });
    expect(rootOf([a, b, c], c.id)).toBe(a.id);
  });

  it('treats a missing parent as the top', () => {
    const orphan = testBrick({ parentId: 'gone' });
    expect(rootOf([orphan], orphan.id)).toBe(orphan.id);
  });

  it('terminates on a cycle rather than hanging', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const cyclic = [{ ...a, parentId: b.id }, b];
    expect(() => rootOf(cyclic, b.id)).not.toThrow();
  });
});

describe('lineageRoots', () => {
  it('ignores bricks that stand alone', () => {
    const a = testBrick();
    const b = testBrick();
    expect(lineageRoots([a, b])).toHaveLength(0);
  });

  it('reports the root of a real lineage', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    expect(lineageRoots([a, b]).map((x) => x.id)).toEqual([a.id]);
  });
});

describe('reparentAfterDelete', () => {
  it('adopts orphans to the grandparent when a middle link goes', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const c = testBrick({ parentId: b.id });
    const out = reparentAfterDelete([a, b, c], new Set([b.id]));
    expect(out.map((x) => x.id)).toEqual([a.id, c.id]);
    expect(out.find((x) => x.id === c.id)!.parentId).toBe(a.id);
  });

  it('skips past a whole run of deleted ancestors', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const c = testBrick({ parentId: b.id });
    const d = testBrick({ parentId: c.id });
    const out = reparentAfterDelete([a, b, c, d], new Set([b.id, c.id]));
    expect(out.find((x) => x.id === d.id)!.parentId).toBe(a.id);
  });

  it('orphans a child when the whole line above it is deleted', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const out = reparentAfterDelete([a, b], new Set([a.id]));
    expect(out.find((x) => x.id === b.id)!.parentId).toBeNull();
  });

  it('leaves untouched bricks as the same objects', () => {
    const a = testBrick();
    const b = testBrick();
    const out = reparentAfterDelete([a, b], new Set([b.id]));
    expect(out[0]).toBe(a);
  });
});
