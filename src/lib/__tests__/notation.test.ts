import { describe, it, expect } from 'vitest';
import { notatable, layoutSheet, beamUnitFor } from '../notation';
import { testBrick, testNote } from './fixtures';

describe('notatable', () => {
  it('accepts grid-aligned notes', () => {
    const b = testBrick({ notes: [testNote({ start: 0, duration: 1 })] });
    expect(notatable(b).ok).toBe(true);
  });

  it('rejects percussion, empty bricks, and off-grid notes', () => {
    expect(notatable(testBrick({ percussion: true, notes: [testNote()] })).ok).toBe(false);
    expect(notatable(testBrick({ notes: [] })).ok).toBe(false);
    const off = testBrick({ notes: [testNote({ start: 0.1 })] });
    expect(notatable(off).ok).toBe(false);
    const offDur = testBrick({ notes: [testNote({ duration: 0.3 })] });
    expect(notatable(offDur).ok).toBe(false);
  });

  it('rejects chords with mixed durations and overlapping voices', () => {
    const mixed = testBrick({
      notes: [
        testNote({ start: 0, pitch: 60, duration: 1 }),
        testNote({ start: 0, pitch: 64, duration: 2 }),
      ],
    });
    expect(notatable(mixed).ok).toBe(false);
    const overlap = testBrick({
      notes: [
        testNote({ start: 0, pitch: 60, duration: 2 }),
        testNote({ start: 1, pitch: 64, duration: 1 }),
      ],
    });
    expect(notatable(overlap).ok).toBe(false);
  });

  it('accepts a chord sharing one duration', () => {
    const chord = testBrick({
      notes: [
        testNote({ start: 0, pitch: 60, duration: 2 }),
        testNote({ start: 0, pitch: 64, duration: 2 }),
        testNote({ start: 0, pitch: 67, duration: 2 }),
      ],
    });
    expect(notatable(chord).ok).toBe(true);
  });
});

describe('layoutSheet', () => {
  it('renders a quarter note as one event, no tie', () => {
    const b = testBrick({ notes: [testNote({ start: 0, duration: 1, pitch: 60 })] });
    const lay = layoutSheet(b);
    const notes = lay.events.filter((e) => e.kind === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0].base).toBe('q');
    expect(notes[0].tieToNext).toBe(false);
  });

  it('splits a note crossing the barline into tied pieces', () => {
    // 4/4: 3 beats in, lasting 2 beats → 1 beat + tied 1 beat
    const b = testBrick({
      lengthBeats: 8,
      notes: [testNote({ start: 3, duration: 2, pitch: 60 })],
    });
    const lay = layoutSheet(b);
    const notes = lay.events.filter((e) => e.kind === 'note');
    expect(notes).toHaveLength(2);
    expect(notes[0].tieToNext).toBe(true);
    expect(notes[0].startBeat).toBe(3);
    expect(notes[1].startBeat).toBe(4);
    expect(notes[1].tieToNext).toBe(false);
  });

  it('uses a dotted half for three beats', () => {
    const b = testBrick({ notes: [testNote({ start: 0, duration: 3 })] });
    const n = layoutSheet(b).events.find((e) => e.kind === 'note')!;
    expect(n.base).toBe('h');
    expect(n.dotted).toBe(true);
  });

  it('fills gaps with rests', () => {
    const b = testBrick({
      lengthBeats: 4,
      notes: [testNote({ start: 2, duration: 1 })],
    });
    const lay = layoutSheet(b);
    const rests = lay.events.filter((e) => e.kind === 'rest');
    // 2 beats of rest before, 1 after
    expect(rests.map((r) => r.beats).reduce((a, b) => a + b, 0)).toBe(3);
    expect(rests[0].base).toBe('h');
  });

  it('chooses bass clef for low material, treble for high', () => {
    expect(layoutSheet(testBrick({ notes: [testNote({ pitch: 40 })] })).clef).toBe('bass');
    expect(layoutSheet(testBrick({ notes: [testNote({ pitch: 72 })] })).clef).toBe('treble');
  });

  it('spells the black key by the key: F# in D major, Gb in Db major', () => {
    const sharpKey = testBrick({
      key: 'D major',
      notes: [testNote({ pitch: 66 })], // F#4 / Gb4
    });
    const flatKey = testBrick({
      key: 'Db major',
      notes: [testNote({ pitch: 66 })],
    });
    // in D major F# is diatonic → no inline accidental
    const e1 = layoutSheet(sharpKey).events.find((e) => e.kind === 'note')!;
    expect(e1.heads[0].accidental).toBeNull();
    // in Db major, Gb is diatonic too → also none
    const e2 = layoutSheet(flatKey).events.find((e) => e.kind === 'note')!;
    expect(e2.heads[0].accidental).toBeNull();
    // but they sit on DIFFERENT staff steps (F line vs G space)
    expect(e1.heads[0].step).not.toBe(e2.heads[0].step);
  });

  it('marks a chromatic note with an accidental once per bar', () => {
    const b = testBrick({
      key: 'C major',
      lengthBeats: 8,
      notes: [
        testNote({ start: 0, pitch: 61, duration: 1 }), // C#
        testNote({ start: 1, pitch: 61, duration: 1 }), // C# again, same bar
        testNote({ start: 4, pitch: 61, duration: 1 }), // C# next bar
      ],
    });
    const notes = layoutSheet(b).events.filter((e) => e.kind === 'note');
    expect(notes[0].heads[0].accidental).toBe('♯');
    expect(notes[1].heads[0].accidental).toBeNull(); // carried within the bar
    expect(notes[2].heads[0].accidental).toBe('♯'); // new bar, restated
  });

  it('C major has an empty key signature; D major shows two sharps', () => {
    expect(layoutSheet(testBrick({ key: 'C major', notes: [testNote()] })).keySig).toHaveLength(0);
    expect(layoutSheet(testBrick({ key: 'D major', notes: [testNote()] })).keySig).toHaveLength(2);
  });

  it('honours the time signature for barlines', () => {
    const b = testBrick({
      timeSig: { num: 3, den: 4 },
      lengthBeats: 6,
      notes: [testNote({ start: 0, duration: 1 })],
    });
    expect(layoutSheet(b).barlines).toEqual([3, 6]);
  });

  it('a natural cancels the key signature', () => {
    // F natural in G major (key has F#)
    const b = testBrick({
      key: 'G major',
      notes: [testNote({ pitch: 65, duration: 1 })], // F4
    });
    const n = layoutSheet(b).events.find((e) => e.kind === 'note')!;
    expect(n.heads[0].accidental).toBe('♮');
  });
});

describe('beaming', () => {
  const eighths = (starts: number[]) =>
    starts.map((st) => testNote({ start: st, duration: 0.5, pitch: 64 }));

  it('beams two eighths sharing a beat', () => {
    const b = testBrick({ lengthBeats: 4, notes: eighths([0, 0.5]) });
    const lay = layoutSheet(b);
    expect(lay.beams).toHaveLength(1);
    expect(lay.beams[0].eventIndices).toHaveLength(2);
    // beamed notes carry the id and drop their flags
    for (const i of lay.beams[0].eventIndices) {
      expect(lay.events[i].beamId).toBe(lay.beams[0].id);
    }
  });

  it('does not beam across a beat boundary', () => {
    // second eighth of beat 1 and first of beat 2 are separate groups
    const b = testBrick({ lengthBeats: 4, notes: eighths([0.5, 1]) });
    expect(layoutSheet(b).beams).toHaveLength(0);
  });

  it('leaves a lone eighth with its flag', () => {
    const b = testBrick({ lengthBeats: 4, notes: eighths([0]) });
    const lay = layoutSheet(b);
    expect(lay.beams).toHaveLength(0);
    expect(lay.events.find((e) => e.kind === 'note')!.beamId).toBeNull();
  });

  it('a rest breaks the run', () => {
    // eighth, gap, eighth — all inside beat 1, but not contiguous
    const b = testBrick({
      lengthBeats: 4,
      notes: [
        testNote({ start: 0, duration: 0.25, pitch: 64 }),
        testNote({ start: 0.75, duration: 0.25, pitch: 64 }),
      ],
    });
    expect(layoutSheet(b).beams).toHaveLength(0);
  });

  it('gives every note in a group one stem direction', () => {
    // one note low, one high — they must still agree
    const b = testBrick({
      lengthBeats: 4,
      notes: [
        testNote({ start: 0, duration: 0.5, pitch: 55 }),
        testNote({ start: 0.5, duration: 0.5, pitch: 84 }),
      ],
    });
    const lay = layoutSheet(b);
    const dirs = lay.beams[0].eventIndices.map((i) => lay.events[i].stemUp);
    expect(new Set(dirs).size).toBe(1);
  });

  it('beams four sixteenths within one beat', () => {
    const b = testBrick({
      lengthBeats: 4,
      notes: [0, 0.25, 0.5, 0.75].map((st) =>
        testNote({ start: st, duration: 0.25, pitch: 64 })
      ),
    });
    const lay = layoutSheet(b);
    expect(lay.beams).toHaveLength(1);
    expect(lay.beams[0].eventIndices).toHaveLength(4);
  });

  it('never beams quarters or longer', () => {
    const b = testBrick({
      lengthBeats: 4,
      notes: [
        testNote({ start: 0, duration: 1 }),
        testNote({ start: 1, duration: 1 }),
      ],
    });
    expect(layoutSheet(b).beams).toHaveLength(0);
  });
});

describe('beamUnitFor', () => {
  it('uses the quarter in simple meters', () => {
    expect(beamUnitFor(4, 4)).toBe(1);
    expect(beamUnitFor(3, 4)).toBe(1);
  });

  it('groups compound meters in threes', () => {
    expect(beamUnitFor(6, 8)).toBe(1.5);
    expect(beamUnitFor(9, 8)).toBe(1.5);
    expect(beamUnitFor(12, 8)).toBe(1.5);
  });

  it('treats an irregular eighth meter as simple', () => {
    expect(beamUnitFor(7, 8)).toBe(1);
  });
});
