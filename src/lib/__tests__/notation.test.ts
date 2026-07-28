import { describe, it, expect } from 'vitest';
import { notatable, layoutSheet } from '../notation';
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
