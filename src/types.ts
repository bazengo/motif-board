// ---- Core musical data model ----
// Everything in the suite hangs off the Brick: a small, named leitmotif that
// carries its own piano-roll notes, chord annotations, lyrics, process notes,
// and per-brick key/tempo/instrument. Bricks are the "lego pieces" you export
// to MIDI and combine in the mix.

export type InstrumentId =
  | 'piano'
  | 'sine'
  | 'triangle'
  | 'square'
  | 'sawtooth'
  | 'fm'
  | 'am';

export const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'piano', label: 'Piano (sampled)' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'square', label: 'Square' },
  { id: 'sawtooth', label: 'Saw' },
  { id: 'fm', label: 'FM' },
  { id: 'am', label: 'AM' },
];

/** A single note on the piano roll. Times are in BEATS (quarter notes), which
 *  keeps the model tempo-agnostic — we convert to seconds only at playback/export. */
export interface Note {
  id: string;
  pitch: number; // MIDI note number (0-127)
  start: number; // beats from brick start
  duration: number; // beats
  velocity: number; // 0..1
}

/** What a brick shows on the corkboard (name is always shown). Toggling these
 *  grows/shrinks the card. */
export interface BrickDisplay {
  showChords: boolean;
  showLyrics: boolean;
  showNotes: boolean; // process notes / description
  preview: boolean; // mini piano-roll preview
}

export const DEFAULT_DISPLAY: BrickDisplay = {
  showChords: true,
  showLyrics: true,
  showNotes: false,
  preview: false,
};

/** A reusable musical phrase used as the piano-roll "brush". Notes are stored
 *  relative to an anchor (the earliest note): `dp` = semitone offset from the
 *  anchor pitch, `start` = beat offset from the anchor start. Stamping at a
 *  clicked (pitch, beat) places the anchor there and the rest follow. */
export interface PhraseTemplate {
  id: string;
  name: string;
  notes: { dp: number; start: number; duration: number; velocity: number }[];
}

/** ADSR shape for a brick's synth voice (seconds, except sustain = level 0..1). */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export const DEFAULT_ENVELOPE: Envelope = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.3,
  release: 0.6,
};

export interface Brick {
  id: string;
  name: string;
  color: string; // sticky-note color
  tags: string[];
  notes: Note[];
  chords: string; // freeform, e.g. "Am - F - C - G"
  lyrics: string;
  processNotes: string;
  key: string; // e.g. "C major" — drives scale highlighting
  bpm: number; // per-brick tempo (used for solo playback + MIDI export)
  lengthBeats: number; // brick length / loop length
  instrument: InstrumentId;
  timeSig: { num: number; den: number }; // e.g. 4/4, 3/4, 6/8 — grid bar lines
  board: { x: number; y: number; rotation: number }; // corkboard placement
  parentId: string | null; // leitmotif lineage — which brick this iterates from
  display: BrickDisplay;
  /** Drum brick: roll rows are GM drum sounds and MIDI goes out on channel 10. */
  percussion: boolean;
  /** Amplitude envelope for the synth voices (ignored by piano/drums). */
  envelope: Envelope;
}

export const TIME_SIGNATURES: { num: number; den: number }[] = [
  { num: 4, den: 4 },
  { num: 3, den: 4 },
  { num: 2, den: 4 },
  { num: 5, den: 4 },
  { num: 6, den: 8 },
  { num: 7, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
];

/** One brick's participation in a mix (Phase 1 "stack" model). */
export interface MixLayer {
  brickId: string;
  loop: boolean;
  mute: boolean;
  solo: boolean;
  gain: number; // 0..1
}

/** A named combination of bricks that live as a node on the board. Bricks
 *  connect to it via edges; only one iteration of a lineage may join per mix. */
export interface Mix {
  id: string;
  name: string;
  color: string;
  board: { x: number; y: number };
  layers: MixLayer[];
  /** Freeform notes about the mix (arrangement ideas, intent, etc.). */
  notes: string;
  /** true = play at the project tempo; false = play at this mix's own `bpm`.
   *  Either way member bricks keep their own stored bpm — this only changes
   *  the rate they're played back at. */
  lockBpm: boolean;
  bpm: number;
}

/** One placed mix on the arrangement timeline. Sections play in order; each
 *  either follows the master tempo or runs at its own. */
export interface TimelineSection {
  id: string;
  mixId: string;
  repeats: number; // how many times the mix loops within this section
  lockBpm: boolean; // true = follow the master/project tempo
  bpm: number; // used when lockBpm is false
  timeSig: { num: number; den: number };
}

export const MIX_COLORS = [
  '#7bdff2',
  '#b8f2e6',
  '#f2c14e',
  '#f4a261',
  '#e07a9b',
  '#a29bfe',
];

export const STICKY_COLORS = [
  '#ffd166',
  '#ef8354',
  '#f4978e',
  '#c8b6ff',
  '#8ecae6',
  '#95d5b2',
  '#e9c46a',
  '#ffadad',
];
