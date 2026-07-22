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

  // Mix playback loops each layer at its own length, so the arrangement has to
  // as well — otherwise a short brick played once and left the rest silent.
  describe('short bricks fill the section', () => {
    // long brick sets the mix length to 8 beats; short brick is 2
    const long = testBrick({ lengthBeats: 8, notes: [] });
    const short = testBrick({ lengthBeats: 2, notes: [testNote({ start: 0 })] });

    it('repeats a short brick across the pass', () => {
      const mix = testMix({
        layers: [testLayer(long.id), testLayer(short.id)],
      });
      const plan = buildTimelinePlan(
        [testSection(mix.id)],
        [mix],
        [long, short],
        120
      );
      // 8-beat pass / 2-beat brick = 4 plays, every 2 beats (1s at 120bpm)
      expect(plan.notes.map((n) => n.time)).toEqual([0, 1, 2, 3]);
    });

    it('keeps filling on every section repeat', () => {
      const mix = testMix({ layers: [testLayer(long.id), testLayer(short.id)] });
      const plan = buildTimelinePlan(
        [testSection(mix.id, { repeats: 2 })],
        [mix],
        [long, short],
        120
      );
      expect(plan.notes).toHaveLength(8);
      expect(plan.totalSeconds).toBeCloseTo(8);
    });

    it('plays once per pass when the layer is not looping', () => {
      const mix = testMix({
        layers: [testLayer(long.id), testLayer(short.id, { loop: false })],
      });
      const plan = buildTimelinePlan(
        [testSection(mix.id)],
        [mix],
        [long, short],
        120
      );
      expect(plan.notes.map((n) => n.time)).toEqual([0]);
    });

    it('does not start a repeat past the end of the pass', () => {
      // 3-beat brick in an 8-beat pass: plays at 0, 3, 6 — the note at
      // offset 6 + start 2.5 would land at 8.5, beyond the pass
      const three = testBrick({
        lengthBeats: 3,
        notes: [testNote({ start: 0 }), testNote({ start: 2.5 })],
      });
      const mix = testMix({ layers: [testLayer(long.id), testLayer(three.id)] });
      const plan = buildTimelinePlan(
        [testSection(mix.id)],
        [mix],
        [long, three],
        120
      );
      // beats 0, 2.5, 3, 5.5, 6 -> seconds at 120bpm
      expect(plan.notes.map((n) => n.time)).toEqual([0, 1.25, 1.5, 2.75, 3]);
    });

    it('leaves a brick the same length as the mix playing once', () => {
      const mix = testMix({ layers: [testLayer(long.id)] });
      const same = { ...long, notes: [testNote({ start: 0 })] };
      const plan = buildTimelinePlan([testSection(mix.id)], [mix], [same], 120);
      expect(plan.notes).toHaveLength(1);
    });
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
