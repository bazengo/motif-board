import type { Brick, Group, Mix } from '../types';
import { CARD_W } from '../layout';
import { rootOf } from './lineage';
import { brickTextTags } from './tags';

export type SortMode = 'root' | 'mix' | 'tag';

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'root', label: 'lineage' },
  { id: 'mix', label: 'mix' },
  { id: 'tag', label: 'tag' },
];

/** Layout metrics. Rows are generous because cards vary in height. */
const COL_GAP = 40;
const ROW_GAP = 34;
const CARD_SLOT_H = 150;
const ORIGIN_X = 40;
const ORIGIN_Y = 56;
const FRAME_PAD = 18;
const FRAME_TOP = 30; // room for the group's title bar

export interface Column {
  key: string;
  label: string;
  color: string;
  brickIds: string[];
}

export interface ArrangeResult {
  positions: Record<string, { x: number; y: number }>;
  /** One labelled frame per column, keyed so re-running reuses them. */
  frames: {
    autoKey: string;
    name: string;
    color: string;
    board: { x: number; y: number; w: number; h: number };
  }[];
}

/**
 * Bucket bricks for a sort. A brick can legitimately belong to several mixes
 * or carry several tags; it's placed in the first matching column so the
 * layout stays a partition and no card is asked to be in two places.
 */
export function buildColumns(
  bricks: Brick[],
  mixes: Mix[],
  mode: SortMode
): Column[] {
  const cols: Column[] = [];
  const placed = new Set<string>();
  const push = (key: string, label: string, color: string, id: string) => {
    let col = cols.find((c) => c.key === key);
    if (!col) {
      col = { key, label, color, brickIds: [] };
      cols.push(col);
    }
    col.brickIds.push(id);
    placed.add(id);
  };

  if (mode === 'mix') {
    for (const m of mixes) {
      for (const l of m.layers) {
        if (placed.has(l.brickId)) continue;
        if (!bricks.some((b) => b.id === l.brickId)) continue;
        push(`mix:${m.id}`, m.name, m.color, l.brickId);
      }
    }
  } else if (mode === 'tag') {
    for (const b of bricks) {
      const tag = brickTextTags(b)[0];
      if (tag) push(`tag:${tag}`, `#${tag}`, '#8ecae6', b.id);
    }
  } else {
    for (const b of bricks) {
      const rootId = rootOf(bricks, b.id);
      const root = bricks.find((x) => x.id === rootId);
      if (root) push(`root:${rootId}`, root.name, root.color, b.id);
    }
  }

  // everything the sort didn't account for, so nothing is left stranded
  const rest = bricks.filter((b) => !placed.has(b.id));
  if (rest.length) {
    cols.push({
      key: 'unsorted',
      label: mode === 'tag' ? 'Untagged' : 'Unsorted',
      color: '#6a7385',
      brickIds: rest.map((b) => b.id),
    });
  }

  // lineage columns read best largest-first; the others keep source order
  if (mode === 'root') {
    cols.sort((a, b) =>
      a.key === 'unsorted' ? 1 : b.key === 'unsorted' ? -1 : b.brickIds.length - a.brickIds.length
    );
  }
  return cols;
}

/** Positions and labelled frames for a sort. Pure — the caller applies it. */
export function arrangeBoard(
  bricks: Brick[],
  mixes: Mix[],
  mode: SortMode
): ArrangeResult {
  const cols = buildColumns(bricks, mixes, mode);
  const positions: Record<string, { x: number; y: number }> = {};
  const frames: ArrangeResult['frames'] = [];

  cols.forEach((col, ci) => {
    const x = ORIGIN_X + ci * (CARD_W + COL_GAP);
    col.brickIds.forEach((id, ri) => {
      positions[id] = { x, y: ORIGIN_Y + ri * (CARD_SLOT_H + ROW_GAP) };
    });
    const rows = Math.max(1, col.brickIds.length);
    frames.push({
      autoKey: `${mode}:${col.key}`,
      name: col.label,
      color: col.color,
      board: {
        x: x - FRAME_PAD,
        y: ORIGIN_Y - FRAME_TOP,
        w: CARD_W + FRAME_PAD * 2,
        h: rows * (CARD_SLOT_H + ROW_GAP) - ROW_GAP + FRAME_TOP + FRAME_PAD,
      },
    });
  });

  return { positions, frames };
}

/** Frames a previous arrange left behind. */
export function isAutoFrame(g: Group): boolean {
  return !!g.autoKey;
}
