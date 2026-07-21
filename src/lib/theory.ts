import { Scale, Chord, Note } from 'tonal';

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export const SCALE_TYPES = [
  'major',
  'minor',
  'harmonic minor',
  'melodic minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major pentatonic',
  'minor pentatonic',
  'blues',
];

/** Pitch classes (0-11) that belong to a "C major"-style key string. */
export function scalePitchClasses(key: string): Set<number> {
  const s = Scale.get(key);
  const set = new Set<number>();
  for (const n of s.notes) {
    const midi = Note.midi(n + '4');
    if (midi != null) set.add(((midi % 12) + 12) % 12);
  }
  return set;
}

export function scaleNotes(key: string): string[] {
  return Scale.get(key).notes;
}

/** Notes of a chord as MIDI numbers around a given octave. e.g. "Cmaj7". */
export function chordMidi(symbol: string, octave = 4): number[] {
  const c = Chord.get(symbol);
  if (c.empty) return [];
  const out: number[] = [];
  let last = -Infinity;
  for (const n of c.notes) {
    let midi = Note.midi(n + octave);
    if (midi == null) continue;
    // keep the chord ascending so voicings don't collapse
    while (midi <= last) midi += 12;
    out.push(midi);
    last = midi;
  }
  return out;
}

/** Parse a freeform progression like "Am - F | C G" into chord symbols. */
export function parseProgression(text: string): string[] {
  return text
    .split(/[\s|,\-–—>]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !Chord.get(t).empty);
}
