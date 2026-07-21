import type { Brick, Mix } from '../types';

/** Resolve a mix's layers into playable items, honoring mute/solo. */
export function mixPlayItems(mix: Mix, bricks: Brick[]) {
  const rows = mix.layers
    .map((l) => ({ l, brick: bricks.find((b) => b.id === l.brickId) }))
    .filter((r): r is { l: (typeof mix.layers)[number]; brick: Brick } => !!r.brick);
  const anySolo = rows.some((r) => r.l.solo);
  return rows
    .filter((r) => !r.l.mute && (!anySolo || r.l.solo))
    .map((r) => ({ brick: r.brick, loop: r.l.loop, gain: r.l.gain }));
}
