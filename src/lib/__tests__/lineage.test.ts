import { describe, it, expect } from 'vitest';
import { descendantIds, familyIds } from '../lineage';
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
