import type { Brick, Group } from '../types';
import { CARD_W } from '../layout';

/** A brick belongs to a group when its card sits inside the frame. */
export function brickInGroup(group: Group, brick: Brick): boolean {
  const cx = brick.board.x + CARD_W / 2;
  const cy = brick.board.y + 20; // near the card's header, not its full height
  return (
    cx >= group.board.x &&
    cx <= group.board.x + group.board.w &&
    cy >= group.board.y &&
    cy <= group.board.y + group.board.h
  );
}

export function bricksInGroup(group: Group, bricks: Brick[]): Brick[] {
  return bricks.filter((b) => brickInGroup(group, b));
}

export function groupsForBrick(brick: Brick, groups: Group[]): Group[] {
  return groups.filter((g) => brickInGroup(g, brick));
}
