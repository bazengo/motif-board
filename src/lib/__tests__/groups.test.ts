import { describe, it, expect } from 'vitest';
import { brickInGroup, bricksInGroup, groupsForBrick } from '../groups';
import { tagsForBrick, allTags } from '../tags';
import { testBrick } from './fixtures';
import type { Group } from '../../types';

function testGroup(partial: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Group',
    color: '#7bdff2',
    board: { x: 0, y: 0, w: 400, h: 300 },
    notes: '',
    ...partial,
  };
}

describe('brickInGroup', () => {
  const group = testGroup({ board: { x: 100, y: 100, w: 400, h: 300 } });

  it('contains a card sitting inside the frame', () => {
    // card centre is x+105, header y+20
    expect(brickInGroup(group, testBrick({ board: { x: 150, y: 150, rotation: 0 } }))).toBe(true);
  });

  it('excludes a card to the left of the frame', () => {
    expect(brickInGroup(group, testBrick({ board: { x: -300, y: 150, rotation: 0 } }))).toBe(false);
  });

  it('excludes a card above the frame', () => {
    expect(brickInGroup(group, testBrick({ board: { x: 150, y: 0, rotation: 0 } }))).toBe(false);
  });

  it('excludes a card past the bottom-right', () => {
    expect(brickInGroup(group, testBrick({ board: { x: 900, y: 900, rotation: 0 } }))).toBe(false);
  });
});

describe('membership helpers', () => {
  const inside = testBrick({ board: { x: 150, y: 150, rotation: 0 } });
  const outside = testBrick({ board: { x: 2000, y: 2000, rotation: 0 } });
  const group = testGroup({ board: { x: 100, y: 100, w: 400, h: 300 } });

  it('collects only the contained bricks', () => {
    expect(bricksInGroup(group, [inside, outside]).map((b) => b.id)).toEqual([
      inside.id,
    ]);
  });

  it('finds the groups a brick sits in', () => {
    expect(groupsForBrick(inside, [group]).map((g) => g.id)).toEqual(['g1']);
    expect(groupsForBrick(outside, [group])).toHaveLength(0);
  });

  it('lets overlapping groups both claim a brick', () => {
    const other = testGroup({ id: 'g2', board: { x: 120, y: 120, w: 400, h: 300 } });
    expect(groupsForBrick(inside, [group, other])).toHaveLength(2);
  });
});

describe('group tags', () => {
  const group = testGroup({ name: 'Verse', notes: '#sketch' });
  const inside = testBrick({ board: { x: 50, y: 50, rotation: 0 } });
  const outside = testBrick({ board: { x: 2000, y: 2000, rotation: 0 } });

  it('a contained brick inherits the group tag', () => {
    const ids = tagsForBrick(inside, [], [group]).map((t) => t.id);
    expect(ids).toContain('group:g1');
  });

  it('and the group’s own hashtags', () => {
    const ids = tagsForBrick(inside, [], [group]).map((t) => t.id);
    expect(ids).toContain('#sketch');
  });

  it('a brick outside inherits nothing', () => {
    expect(tagsForBrick(outside, [], [group])).toHaveLength(0);
  });

  it('groups appear in the tag list', () => {
    const ids = allTags([inside], [], [group]).map((t) => t.id);
    expect(ids).toContain('group:g1');
    expect(ids).toContain('#sketch');
  });
});
