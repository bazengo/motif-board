import { describe, it, expect } from 'vitest';
import { mixBpm, layerLevels, mixAllItems, mixPlayItems } from '../mix';
import { testBrick, testMix, testLayer } from './fixtures';

describe('mixBpm', () => {
  it('follows the project tempo when locked', () => {
    expect(mixBpm(testMix({ lockBpm: true, bpm: 90 }), 140)).toBe(140);
  });
  it('uses its own tempo when unlocked', () => {
    expect(mixBpm(testMix({ lockBpm: false, bpm: 90 }), 140)).toBe(90);
  });
});

describe('layerLevels', () => {
  it('passes gain through when nothing is muted or soloed', () => {
    const a = testBrick();
    const mix = testMix({ layers: [testLayer(a.id, { gain: 0.6 })] });
    expect(layerLevels(mix).get(a.id)).toBe(0.6);
  });

  it('silences a muted layer', () => {
    const a = testBrick();
    const mix = testMix({ layers: [testLayer(a.id, { mute: true })] });
    expect(layerLevels(mix).get(a.id)).toBe(0);
  });

  it('silences everything except the soloed layer', () => {
    const a = testBrick();
    const b = testBrick();
    const mix = testMix({
      layers: [testLayer(a.id, { solo: true, gain: 0.7 }), testLayer(b.id)],
    });
    const levels = layerLevels(mix);
    expect(levels.get(a.id)).toBe(0.7);
    expect(levels.get(b.id)).toBe(0);
  });

  it('mute still wins over that layer being soloed', () => {
    const a = testBrick();
    const mix = testMix({ layers: [testLayer(a.id, { solo: true, mute: true })] });
    expect(layerLevels(mix).get(a.id)).toBe(0);
  });
});

describe('mixAllItems vs mixPlayItems', () => {
  const a = testBrick();
  const b = testBrick();
  const mix = testMix({
    layers: [testLayer(a.id), testLayer(b.id, { mute: true })],
  });

  it('mixAllItems keeps muted layers so they can be un-muted live', () => {
    const items = mixAllItems(mix, [a, b]);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.brick.id === b.id)?.gain).toBe(0);
  });

  it('mixPlayItems omits muted layers (used for baked timeline export)', () => {
    const items = mixPlayItems(mix, [a, b]);
    expect(items).toHaveLength(1);
    expect(items[0].brick.id).toBe(a.id);
  });

  it('both skip layers whose brick is gone', () => {
    const orphaned = testMix({ layers: [testLayer('missing')] });
    expect(mixAllItems(orphaned, [])).toHaveLength(0);
    expect(mixPlayItems(orphaned, [])).toHaveLength(0);
  });
});
