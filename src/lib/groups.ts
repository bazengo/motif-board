import type { Brick, Group, Mix } from '../types';
import { CARD_W, MIX_W } from '../layout';

/** True when a header point sits inside the frame. */
function pointInGroup(group: Group, x: number, y: number): boolean {
  return (
    x >= group.board.x &&
    x <= group.board.x + group.board.w &&
    y >= group.board.y &&
    y <= group.board.y + group.board.h
  );
}

/** A brick belongs to a group when its card sits inside the frame. */
export function brickInGroup(group: Group, brick: Brick): boolean {
  return pointInGroup(group, brick.board.x + CARD_W / 2, brick.board.y + 20);
}

/** A mix node belongs to a group when its node sits inside the frame. */
export function mixInGroup(group: Group, mix: Mix): boolean {
  return pointInGroup(group, mix.board.x + MIX_W / 2, mix.board.y + 16);
}

export function bricksInGroup(group: Group, bricks: Brick[]): Brick[] {
  return bricks.filter((b) => brickInGroup(group, b));
}

export function mixesInGroup(group: Group, mixes: Mix[]): Mix[] {
  return mixes.filter((m) => mixInGroup(group, m));
}

export function groupsForBrick(brick: Brick, groups: Group[]): Group[] {
  return groups.filter((g) => brickInGroup(g, brick));
}
