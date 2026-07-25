import { describe, it, expect } from 'vitest';
import { buildColumns, arrangeBoard } from '../arrange';
import { rootOf, lineageRoots, reparentAfterDelete } from '../lineage';
import { testBrick, testMix, testLayer } from './fixtures';

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

describe('buildColumns', () => {
  it('groups a lineage under its root', () => {
    const a = testBrick({ name: 'Theme' });
    const b = testBrick({ parentId: a.id });
    const cols = buildColumns([a, b], [], 'root');
    expect(cols).toHaveLength(1);
    expect(cols[0].label).toBe('Theme');
    expect(cols[0].brickIds).toEqual([a.id, b.id]);
  });

  it('groups by mix, and collects non-members as unsorted', () => {
    const a = testBrick();
    const loose = testBrick();
    const mix = testMix({ name: 'Verse', layers: [testLayer(a.id)] });
    const cols = buildColumns([a, loose], [mix], 'mix');
    expect(cols.map((c) => c.label)).toEqual(['Verse', 'Unsorted']);
    expect(cols[1].brickIds).toEqual([loose.id]);
  });

  it('places a brick in only one column when it is in several mixes', () => {
    const a = testBrick();
    const m1 = testMix({ name: 'One', layers: [testLayer(a.id)] });
    const m2 = testMix({ name: 'Two', layers: [testLayer(a.id)] });
    const cols = buildColumns([a], [m1, m2], 'mix');
    const total = cols.reduce((n, c) => n + c.brickIds.length, 0);
    expect(total).toBe(1);
  });

  it('groups by the first hashtag in the notes', () => {
    const a = testBrick({ processNotes: 'idea #verse' });
    const b = testBrick({ processNotes: 'nothing here' });
    const cols = buildColumns([a, b], [], 'tag');
    expect(cols.map((c) => c.label)).toEqual(['#verse', 'Untagged']);
  });

  it('never loses a brick', () => {
    const bricks = [testBrick(), testBrick(), testBrick()];
    for (const mode of ['root', 'mix', 'tag'] as const) {
      const total = buildColumns(bricks, [], mode).reduce(
        (n, c) => n + c.brickIds.length,
        0
      );
      expect(total).toBe(bricks.length);
    }
  });
});

describe('arrangeBoard', () => {
  it('puts each column at its own x and stacks rows down', () => {
    const a = testBrick({ name: 'Theme' });
    const b = testBrick({ parentId: a.id });
    const other = testBrick({ name: 'Solo' });
    const { positions } = arrangeBoard([a, b, other], [], 'root');
    // same lineage shares a column
    expect(positions[a.id].x).toBe(positions[b.id].x);
    expect(positions[b.id].y).toBeGreaterThan(positions[a.id].y);
    // a different lineage gets a different column
    expect(positions[other.id].x).not.toBe(positions[a.id].x);
  });

  it('emits one frame per column with a stable key', () => {
    const a = testBrick({ name: 'Theme' });
    const b = testBrick({ parentId: a.id });
    const first = arrangeBoard([a, b], [], 'root');
    const again = arrangeBoard([a, b], [], 'root');
    expect(first.frames).toHaveLength(1);
    expect(first.frames[0].autoKey).toBe(again.frames[0].autoKey);
  });

  it('sizes a frame to hold its column', () => {
    const a = testBrick();
    const b = testBrick({ parentId: a.id });
    const one = arrangeBoard([a], [], 'root');
    const two = arrangeBoard([a, b], [], 'root');
    expect(two.frames[0].board.h).toBeGreaterThan(one.frames[0].board.h);
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
