import { describe, it, expect } from 'vitest';
import {
  mixLengthBeats,
  sectionBpm,
  sectionBeats,
  sectionSeconds,
  buildTimelinePlan,
  formatDuration,
} from '../timeline';
import { testBrick, testMix, testLayer, testSection, testNote } from './fixtures';

describe('mixLengthBeats', () => {
  it('is the longest member brick', () => {
    const a = testBrick({ lengthBeats: 4 });
    const b = testBrick({ lengthBeats: 16 });
    const mix = testMix({ layers: [testLayer(a.id), testLayer(b.id)] });
    expect(mixLengthBeats(mix, [a, b])).toBe(16);
  });

  it('falls back to 4 beats when the mix is empty', () => {
    expect(mixLengthBeats(testMix(), [])).toBe(4);
  });

  it('ignores layers whose brick no longer exists', () => {
    const a = testBrick({ lengthBeats: 4 });
    const mix = testMix({ layers: [testLayer(a.id), testLayer('missing')] });
    expect(mixLengthBeats(mix, [a])).toBe(4);
  });
});

describe('section tempo', () => {
  it('follows the master tempo when locked', () => {
    expect(sectionBpm(testSection('m', { lockBpm: true, bpm: 60 }), 140)).toBe(140);
  });

  it('uses its own tempo when unlocked', () => {
    expect(sectionBpm(testSection('m', { lockBpm: false, bpm: 60 }), 140)).toBe(60);
  });
});

describe('section length', () => {
  const brick = testBrick({ lengthBeats: 4 });
  const mix = testMix({ layers: [testLayer(brick.id)] });

  it('multiplies mix length by repeats', () => {
    const s = testSection(mix.id, { repeats: 3 });
    expect(sectionBeats(s, mix, [brick])).toBe(12);
  });

  it('converts to seconds using the effective tempo', () => {
    // 4 beats at 120bpm = 2s; twice = 4s
    const s = testSection(mix.id, { repeats: 2 });
    expect(sectionSeconds(s, mix, [brick], 120)).toBeCloseTo(4);
    // the same section at its own 60bpm is twice as long
    const slow = testSection(mix.id, { repeats: 2, lockBpm: false, bpm: 60 });
    expect(sectionSeconds(slow, mix, [brick], 120)).toBeCloseTo(8);
  });
});

describe('buildTimelinePlan', () => {
  it('lays sections out end to end and reports their starts', () => {
    const brick = testBrick({ lengthBeats: 4, notes: [testNote({ start: 0 })] });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    // 4 beats @120 = 2s, then 4 beats @60 x2 = 8s
    const timeline = [
      testSection(mix.id),
      testSection(mix.id, { lockBpm: false, bpm: 60, repeats: 2 }),
    ];
    const plan = buildTimelinePlan(timeline, [mix], [brick], 120);
    expect(plan.starts).toEqual([0, 2]);
    expect(plan.totalSeconds).toBeCloseTo(10);
  });

  it('bakes each section tempo into absolute note times', () => {
    const brick = testBrick({ lengthBeats: 4, notes: [testNote({ start: 2 })] });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    const timeline = [
      testSection(mix.id), // @120: beat 2 -> 1s
      testSection(mix.id, { lockBpm: false, bpm: 60 }), // @60: beat 2 -> 2s, offset 2s
    ];
    const plan = buildTimelinePlan(timeline, [mix], [brick], 120);
    expect(plan.notes.map((n) => n.time)).toEqual([1, 4]);
  });

  it('repeats a section by offsetting each pass by the loop length', () => {
    const brick = testBrick({ lengthBeats: 4, notes: [testNote({ start: 0 })] });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    const plan = buildTimelinePlan(
      [testSection(mix.id, { repeats: 3 })],
      [mix],
      [brick],
      120
    );
    // 4 beats @120 = 2s per pass
    expect(plan.notes.map((n) => n.time)).toEqual([0, 2, 4]);
    expect(plan.totalSeconds).toBeCloseTo(6);
  });

  it('scales note duration by the section tempo', () => {
    const brick = testBrick({
      lengthBeats: 4,
      notes: [testNote({ start: 0, duration: 2 })],
    });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    const plan = buildTimelinePlan(
      [testSection(mix.id, { lockBpm: false, bpm: 60 })],
      [mix],
      [brick],
      120
    );
    expect(plan.notes[0].dur).toBeCloseTo(2); // 2 beats @60bpm
  });

  it('folds layer gain into velocity', () => {
    const brick = testBrick({ notes: [testNote({ velocity: 0.8 })], lengthBeats: 4 });
    const mix = testMix({ layers: [testLayer(brick.id, { gain: 0.5 })] });
    const plan = buildTimelinePlan([testSection(mix.id)], [mix], [brick], 120);
    expect(plan.notes[0].velocity).toBeCloseTo(0.4);
  });

  it('omits muted layers but still reserves the section time', () => {
    const brick = testBrick({ notes: [testNote()], lengthBeats: 4 });
    const mix = testMix({ layers: [testLayer(brick.id, { mute: true })] });
    const plan = buildTimelinePlan([testSection(mix.id)], [mix], [brick], 120);
    expect(plan.notes).toHaveLength(0);
    expect(plan.totalSeconds).toBeCloseTo(2);
  });

  it('skips sections whose mix was deleted without shifting time', () => {
    const plan = buildTimelinePlan([testSection('gone')], [], [], 120);
    expect(plan.notes).toHaveLength(0);
    expect(plan.totalSeconds).toBe(0);
  });

  it('returns notes in chronological order', () => {
    const brick = testBrick({
      lengthBeats: 4,
      notes: [testNote({ start: 3 }), testNote({ start: 1 }), testNote({ start: 2 })],
    });
    const mix = testMix({ layers: [testLayer(brick.id)] });
    const plan = buildTimelinePlan([testSection(mix.id)], [mix], [brick], 120);
    const times = plan.notes.map((n) => n.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('formatDuration', () => {
  it('formats as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
  });
});
