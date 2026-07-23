import { describe, it, expect } from 'vitest';
import { bounceMix, bounceTimeline } from '../bounce';
import { testBrick, testMix, testLayer, testSection, testNote } from './fixtures';

describe('bounceMix', () => {
  it('sums all layers into one note list at the mix length', () => {
    const a = testBrick({ lengthBeats: 4, notes: [testNote({ pitch: 60, start: 0 })] });
    const b = testBrick({ lengthBeats: 4, notes: [testNote({ pitch: 64, start: 2 })] });
    const mix = testMix({ layers: [testLayer(a.id), testLayer(b.id)] });
    const out = bounceMix(mix, [a, b], 120);
    expect(out.lengthBeats).toBe(4);
    expect(out.notes.map((n) => n.pitch).sort()).toEqual([60, 64]);
  });

  it('tiles a short looping clip to fill the pass', () => {
    const long = testBrick({ lengthBeats: 8, notes: [] });
    const short = testBrick({ lengthBeats: 2, notes: [testNote({ start: 0 })] });
    const mix = testMix({ layers: [testLayer(long.id), testLayer(short.id)] });
    const out = bounceMix(mix, [long, short], 120);
    expect(out.notes.map((n) => n.start)).toEqual([0, 2, 4, 6]);
  });

  it('folds gain into velocity and drops muted layers', () => {
    const a = testBrick({ lengthBeats: 4, notes: [testNote({ velocity: 0.8 })] });
    const b = testBrick({ lengthBeats: 4, notes: [testNote({ velocity: 0.8 })] });
    const mix = testMix({
      layers: [testLayer(a.id, { gain: 0.5 }), testLayer(b.id, { mute: true })],
    });
    const out = bounceMix(mix, [a, b], 120);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].velocity).toBeCloseTo(0.4);
  });

  it('runs at the mix tempo', () => {
    const a = testBrick({ notes: [testNote()] });
    const mix = testMix({ lockBpm: false, bpm: 90, layers: [testLayer(a.id)] });
    expect(bounceMix(mix, [a], 120).bpm).toBe(90);
  });

  it('bounces an all-percussion mix to a drum card', () => {
    const d = testBrick({ percussion: true, notes: [testNote({ pitch: 38 })] });
    const mix = testMix({ layers: [testLayer(d.id)] });
    const out = bounceMix(mix, [d], 120);
    expect(out.percussion).toBe(true);
  });

  it('bounces a mixed mix to a melodic card', () => {
    const mel = testBrick({ instrument: 'square', notes: [testNote()] });
    const drum = testBrick({ percussion: true, notes: [testNote({ pitch: 36 })] });
    const mix = testMix({ layers: [testLayer(drum.id), testLayer(mel.id)] });
    const out = bounceMix(mix, [drum, mel], 120);
    expect(out.percussion).toBe(false);
    expect(out.instrument).toBe('square');
  });

  it('gives every bounced note a fresh id', () => {
    const a = testBrick({ notes: [testNote(), testNote({ start: 1 })] });
    const mix = testMix({ layers: [testLayer(a.id)] });
    const ids = bounceMix(mix, [a], 120).notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('bounceTimeline', () => {
  it('preserves the real-time length in beats at the project tempo', () => {
    const brick = testBrick({ lengthBeats: 4, notes: [testNote()] });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    // 4 beats @120 = 2s, then 4 beats @60 = 4s -> 6s total; at 120bpm that's 12 beats
    const timeline = [
      testSection(mix.id),
      testSection(mix.id, { lockBpm: false, bpm: 60 }),
    ];
    const out = bounceTimeline(timeline, [mix], [brick], 120);
    expect(out.bpm).toBe(120);
    expect(out.lengthBeats).toBeCloseTo(12);
  });

  it('places notes at the right beat for a slower section', () => {
    const brick = testBrick({ lengthBeats: 4, notes: [testNote({ start: 0 })] });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    const timeline = [
      testSection(mix.id), // note at 0s -> beat 0
      testSection(mix.id, { lockBpm: false, bpm: 60 }), // starts at 2s -> beat 4 @120
    ];
    const out = bounceTimeline(timeline, [mix], [brick], 120);
    expect(out.notes.map((n) => n.start)).toEqual([0, 4]);
  });

  it('is empty for an empty timeline', () => {
    const out = bounceTimeline([], [], [], 120);
    expect(out.notes).toHaveLength(0);
  });
});
