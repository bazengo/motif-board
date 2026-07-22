import { describe, it, expect } from 'vitest';
import { scalePitchClasses, chordMidi, parseProgression } from '../theory';

describe('scalePitchClasses', () => {
  it('returns the seven pitch classes of a major scale', () => {
    expect([...scalePitchClasses('C major')].sort((a, b) => a - b)).toEqual([
      0, 2, 4, 5, 7, 9, 11,
    ]);
  });

  it('transposes with the root', () => {
    expect(scalePitchClasses('G major').has(6)).toBe(true); // F#
    expect(scalePitchClasses('G major').has(5)).toBe(false); // F natural
  });

  it('is empty for an unrecognised scale', () => {
    expect(scalePitchClasses('C nonsense').size).toBe(0);
  });
});

describe('chordMidi', () => {
  it('builds a root-position triad', () => {
    expect(chordMidi('C', 4)).toEqual([60, 64, 67]);
  });

  it('respects the octave', () => {
    expect(chordMidi('C', 3)).toEqual([48, 52, 55]);
  });

  it('voices slash chords as inversions with the bass lowest', () => {
    // C/E -> E G C, ascending from the bass
    expect(chordMidi('C/E', 4)).toEqual([64, 67, 72]);
  });

  it('keeps every voicing strictly ascending', () => {
    for (const sym of ['Cmaj7', 'G7', 'Am11', 'F/A', 'Bm7b5']) {
      const notes = chordMidi(sym, 4);
      expect(notes.length).toBeGreaterThan(0);
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i]).toBeGreaterThan(notes[i - 1]);
      }
    }
  });

  it('returns nothing for an unparseable symbol', () => {
    expect(chordMidi('N.C.', 4)).toEqual([]);
  });
});

describe('parseProgression', () => {
  it('splits on spaces, dashes and bars', () => {
    expect(parseProgression('Am - F | C G')).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('accepts lowercase', () => {
    expect(parseProgression('am f')).toEqual(['am', 'f']);
  });

  it('drops tokens that are not chords', () => {
    expect(parseProgression('Am N.C. F')).toEqual(['Am', 'F']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseProgression('')).toEqual([]);
  });
});
