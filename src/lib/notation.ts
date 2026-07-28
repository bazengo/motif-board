import { Scale } from 'tonal';
import type { Brick, Note } from '../types';

// Turns a brick's piano-roll notes into a simple engraving layout: staff
// positions, accidentals, note symbols, rests, barlines and ties. Pure data —
// the SVG renderer just draws what this emits.
//
// Deliberately narrow (a card preview, not Finale): one staff, one voice,
// flags instead of beams, and only straightforwardly notatable rhythms. When
// content falls outside that, `notatable` says no and the card shows a short
// "not supported" note instead of guessing.

const GRID = 0.25; // sixteenth, in quarter-note beats
const EPS = 1e-6;

/** Renderable single-symbol lengths, in beats (quarter = 1). */
const SYMBOLS: { beats: number; base: 'w' | 'h' | 'q' | '8' | '16'; dotted: boolean }[] = [
  { beats: 4, base: 'w', dotted: false },
  { beats: 3, base: 'h', dotted: true },
  { beats: 2, base: 'h', dotted: false },
  { beats: 1.5, base: 'q', dotted: true },
  { beats: 1, base: 'q', dotted: false },
  { beats: 0.75, base: '8', dotted: true },
  { beats: 0.5, base: '8', dotted: false },
  { beats: 0.25, base: '16', dotted: false },
];

const onGrid = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < EPS;

export type NotatableResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Can this brick be rendered as notation at all? */
export function notatable(brick: Brick): NotatableResult {
  if (brick.percussion)
    return { ok: false, reason: 'Percussion notation is not supported yet' };
  if (brick.notes.length === 0) return { ok: false, reason: 'No notes yet' };
  for (const n of brick.notes) {
    if (!onGrid(n.start) || !onGrid(n.duration)) {
      return {
        ok: false,
        reason: 'Some notes are off the 1/16 grid — quantize to enable notation',
      };
    }
  }
  // chords must share a duration (one voice, one stem)
  const byStart = new Map<number, Note[]>();
  for (const n of brick.notes) {
    const key = Math.round(n.start / GRID);
    const arr = byStart.get(key) ?? [];
    arr.push(n);
    byStart.set(key, arr);
  }
  for (const group of byStart.values()) {
    const d = group[0].duration;
    if (group.some((n) => Math.abs(n.duration - d) > EPS)) {
      return {
        ok: false,
        reason: 'Notes starting together have different lengths',
      };
    }
  }
  // overlapping sustained notes = multiple voices, out of scope
  const events = [...byStart.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < events.length - 1; i++) {
    const [startKey, group] = events[i];
    const end = startKey * GRID + group[0].duration;
    if (end - EPS > events[i + 1][0] * GRID) {
      return { ok: false, reason: 'Overlapping notes need multiple voices' };
    }
  }
  return { ok: true };
}

// ---------- pitch spelling ----------

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface Spelled {
  letter: string;
  /** -1 flat, 0 natural, 1 sharp (double accidentals unsupported → nearest) */
  alter: number;
  octave: number; // scientific, C4 = middle C
}

/** Spell a MIDI pitch inside the brick's key: scale tones use the scale's own
 *  spelling; chromatic tones lean the same way the key does. */
function spellPitch(midi: number, scaleNotes: string[], keyUsesFlats: boolean): Spelled {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  for (const sn of scaleNotes) {
    const m = sn.match(/^([A-G])(bb|b|##|#)?$/);
    if (!m) continue;
    const alter = m[2] === '#' ? 1 : m[2] === '##' ? 2 : m[2] === 'b' ? -1 : m[2] === 'bb' ? -2 : 0;
    if (((LETTER_PC[m[1]] + alter) % 12 + 12) % 12 === pc) {
      // octave belongs to the LETTER, not the sounding pitch: Cb sounds in the
      // octave below its letter, B# above
      const soundsAs = LETTER_PC[m[1]] + alter;
      let oct = octave;
      if (soundsAs < 0) oct = octave + 1;
      if (soundsAs > 11) oct = octave - 1;
      if (Math.abs(alter) <= 1) return { letter: m[1], alter, octave: oct };
    }
  }
  // chromatic: spell with the key's preferred accidental
  if (keyUsesFlats) {
    const letterPc: [string, number][] = [['C',0],['D',2],['E',4],['F',5],['G',7],['A',9],['B',11]];
    for (const [L, lpc] of letterPc) {
      if ((lpc - 1 + 12) % 12 === pc) return { letter: L, alter: -1, octave };
    }
  }
  const letterPc: [string, number][] = [['C',0],['D',2],['E',4],['F',5],['G',7],['A',9],['B',11]];
  for (const [L, lpc] of letterPc) {
    if (lpc === pc) return { letter: L, alter: 0, octave };
  }
  for (const [L, lpc] of letterPc) {
    if ((lpc + 1) % 12 === pc) return { letter: L, alter: 1, octave };
  }
  return { letter: 'C', alter: 0, octave };
}

// ---------- layout types ----------

export interface LaidNoteHead {
  /** Diatonic staff step: 0 = the staff's bottom line, +1 per line/space up. */
  step: number;
  /** Accidental drawn before the head (null = none needed). */
  accidental: '♯' | '♭' | '♮' | null;
}

export interface LaidEvent {
  kind: 'note' | 'rest';
  startBeat: number;
  beats: number;
  base: 'w' | 'h' | 'q' | '8' | '16';
  dotted: boolean;
  heads: LaidNoteHead[]; // empty for rests
  stemUp: boolean;
  /** Tied to the next event (a split across a barline). */
  tieToNext: boolean;
}

export interface SheetLayout {
  clef: 'treble' | 'bass';
  /** Key-signature accidentals as staff steps (for the chosen clef). */
  keySig: { step: number; glyph: '♯' | '♭' }[];
  timeSig: { num: number; den: number };
  barBeats: number;
  totalBeats: number;
  barlines: number[]; // beat positions
  events: LaidEvent[];
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
// staff steps for key-signature glyphs, bottom line = 0
const TREBLE_SHARP_STEPS: Record<string, number> = { F: 8, C: 5, G: 9, D: 6, A: 3, E: 7, B: 4 };
const TREBLE_FLAT_STEPS: Record<string, number> = { B: 4, E: 7, A: 3, D: 6, G: 2, C: 5, F: 1 };

/** Diatonic step of a spelled pitch relative to the clef's bottom line. */
function stepOf(sp: Spelled, clef: 'treble' | 'bass'): number {
  const abs = sp.octave * 7 + LETTER_INDEX[sp.letter];
  // treble bottom line = E4 → 4*7+2 = 30; bass bottom line = G2 → 2*7+4 = 18
  return abs - (clef === 'treble' ? 30 : 18);
}

/** Greedy decomposition of a duration into renderable symbols, splitting at
 *  barlines; every piece ties to the next. Returns null only on zero grid. */
function decompose(
  startBeat: number,
  beats: number,
  barBeats: number
): { start: number; beats: number; base: LaidEvent['base']; dotted: boolean }[] {
  const out: { start: number; beats: number; base: LaidEvent['base']; dotted: boolean }[] = [];
  let pos = startBeat;
  let left = beats;
  let guard = 0;
  while (left > EPS && guard++ < 64) {
    const inBar = barBeats - (pos % barBeats);
    const room = Math.min(left, inBar < EPS ? barBeats : inBar);
    const sym = SYMBOLS.find((s) => s.beats <= room + EPS)!;
    out.push({ start: pos, beats: sym.beats, base: sym.base, dotted: sym.dotted });
    pos += sym.beats;
    left -= sym.beats;
  }
  return out;
}

/** Build the full layout. Call `notatable` first; this assumes it passed. */
export function layoutSheet(brick: Brick): SheetLayout {
  const scale = Scale.get(brick.key);
  const scaleNotes = scale.empty ? Scale.get('C major').notes : scale.notes;
  const flats = scaleNotes.filter((n) => n.includes('b')).length;
  const sharps = scaleNotes.filter((n) => n.includes('#')).length;
  const keyUsesFlats = flats > sharps;

  // clef by median pitch
  const pitches = brick.notes.map((n) => n.pitch).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)] ?? 60;
  const clef: 'treble' | 'bass' = median >= 57 ? 'treble' : 'bass';
  const clefShift = clef === 'treble' ? 0 : -12; // bass steps = treble steps of same letter minus 12

  // key signature: which letters the scale alters
  const altered = new Map<string, 1 | -1>();
  for (const sn of scaleNotes) {
    const m = sn.match(/^([A-G])(b|#)$/);
    if (m) altered.set(m[1], m[2] === '#' ? 1 : -1);
  }
  const order = keyUsesFlats ? FLAT_ORDER : SHARP_ORDER;
  const keySig: SheetLayout['keySig'] = [];
  for (const L of order) {
    if (!altered.has(L)) continue;
    const glyph = altered.get(L)! > 0 ? ('♯' as const) : ('♭' as const);
    const base = glyph === '♯' ? TREBLE_SHARP_STEPS[L] : TREBLE_FLAT_STEPS[L];
    keySig.push({ step: base + clefShift + (clef === 'bass' ? 14 : 0), glyph });
  }

  const num = brick.timeSig?.num ?? 4;
  const den = brick.timeSig?.den ?? 4;
  const barBeats = (num * 4) / den;
  const totalBeats = brick.lengthBeats;

  // group notes into chord events
  const byStart = new Map<number, Note[]>();
  for (const n of brick.notes) {
    const key = Math.round(n.start / GRID);
    const arr = byStart.get(key) ?? [];
    arr.push(n);
    byStart.set(key, arr);
  }
  const groups = [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, notes]) => ({ start: k * GRID, notes }));

  const events: LaidEvent[] = [];
  // accidental state resets each bar (standard rule)
  let barIndex = -1;
  let barAccidentals = new Map<string, number>();

  const emitRest = (from: number, to: number) => {
    for (const piece of decompose(from, to - from, barBeats)) {
      events.push({
        kind: 'rest',
        startBeat: piece.start,
        beats: piece.beats,
        base: piece.base,
        dotted: piece.dotted,
        heads: [],
        stemUp: true,
        tieToNext: false,
      });
    }
  };

  let cursor = 0;
  for (const g of groups) {
    if (g.start > cursor + EPS) emitRest(cursor, g.start);

    const dur = g.notes[0].duration;
    const pieces = decompose(g.start, dur, barBeats);

    for (let pi = 0; pi < pieces.length; pi++) {
      const piece = pieces[pi];
      const thisBar = Math.floor(piece.start / barBeats + EPS);
      if (thisBar !== barIndex) {
        barIndex = thisBar;
        barAccidentals = new Map();
      }

      const heads: LaidNoteHead[] = g.notes
        .map((n) => {
          const sp = spellPitch(n.pitch, scaleNotes, keyUsesFlats);
          const step = stepOf(sp, clef);
          const key = `${sp.letter}${sp.octave}`;
          const inKeyAlter = altered.get(sp.letter) ?? 0;
          let accidental: LaidNoteHead['accidental'] = null;
          const shown = barAccidentals.has(key)
            ? barAccidentals.get(key)!
            : inKeyAlter;
          if (pi === 0 && sp.alter !== shown) {
            accidental = sp.alter === 0 ? '♮' : sp.alter > 0 ? '♯' : '♭';
            barAccidentals.set(key, sp.alter);
          }
          return { step, accidental };
        })
        .sort((a, b) => a.step - b.step);

      const meanStep = heads.reduce((s, h) => s + h.step, 0) / heads.length;
      events.push({
        kind: 'note',
        startBeat: piece.start,
        beats: piece.beats,
        base: piece.base,
        dotted: piece.dotted,
        heads,
        stemUp: meanStep < 4, // middle line = step 4
        tieToNext: pi < pieces.length - 1,
      });
    }
    cursor = g.start + dur;
  }
  if (cursor < totalBeats - EPS) emitRest(cursor, totalBeats);

  const barlines: number[] = [];
  for (let b = barBeats; b <= totalBeats + EPS; b += barBeats) barlines.push(b);

  return { clef, keySig, timeSig: { num, den }, barBeats, totalBeats, barlines, events };
}
