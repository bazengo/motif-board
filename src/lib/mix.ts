import type { Brick, Mix, MixLayer } from '../types';

/**
 * The rate a mix plays at: the project tempo, or its own override.
 * Falls back to the project tempo if the mix has no usable bpm — saves made
 * before mix tempo existed can carry undefined here, and letting that through
 * set the transport to NaN and silenced playback entirely.
 */
export function mixBpm(mix: Mix, globalBpm: number): number {
  const fallback = Number.isFinite(globalBpm) && globalBpm > 0 ? globalBpm : 120;
  if (mix.lockBpm !== false) return fallback;
  return Number.isFinite(mix.bpm) && mix.bpm > 0 ? mix.bpm : fallback;
}

/** A mix is as long as its longest member brick (in quarter-note beats). */
export function mixLengthBeats(mix: Mix, bricks: Brick[]): number {
  let len = 0;
  for (const l of mix.layers) {
    const b = bricks.find((x) => x.id === l.brickId);
    if (b) len = Math.max(len, b.lengthBeats);
  }
  return len || 4;
}

/** Effective gain for a layer, accounting for mute and any active solo. */
export function layerLevels(mix: Mix): Map<string, number> {
  const anySolo = mix.layers.some((l) => l.solo);
  const out = new Map<string, number>();
  for (const l of mix.layers) {
    const audible = !l.mute && (!anySolo || l.solo);
    out.set(l.brickId, audible ? l.gain : 0);
  }
  return out;
}

/**
 * Every layer as a playable item, with muted/un-soloed layers at gain 0 rather
 * than omitted. Live playback uses this so a voice exists for each layer and
 * un-muting mid-playback can simply raise it.
 */
export function mixAllItems(mix: Mix, bricks: Brick[]) {
  const levels = layerLevels(mix);
  // automation spans one full pass of the whole mix, not each brick's own loop
  const autoLenBeats = mixLengthBeats(mix, bricks);
  return mix.layers
    .map((l) => ({ l, brick: bricks.find((b) => b.id === l.brickId) }))
    .filter((r): r is { l: MixLayer; brick: Brick } => !!r.brick)
    .map((r) => ({
      brick: r.brick,
      loop: r.l.loop,
      gain: levels.get(r.l.brickId) ?? 0,
      automation: r.l.automation ?? [],
      autoLenBeats,
    }));
}

/** Resolve a mix's layers into playable items, honoring mute/solo. */
export function mixPlayItems(mix: Mix, bricks: Brick[]) {
  const rows = mix.layers
    .map((l) => ({ l, brick: bricks.find((b) => b.id === l.brickId) }))
    .filter((r): r is { l: (typeof mix.layers)[number]; brick: Brick } => !!r.brick);
  const anySolo = rows.some((r) => r.l.solo);
  return rows
    .filter((r) => !r.l.mute && (!anySolo || r.l.solo))
    .map((r) => ({
      brick: r.brick,
      loop: r.l.loop,
      gain: r.l.gain,
      automation: r.l.automation ?? [],
    }));
}
