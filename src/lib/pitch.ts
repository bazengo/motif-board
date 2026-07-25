const NAMES = [
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

/** Lowest and highest MIDI notes the editor offers: C-2 up to C8. */
export const MIDI_LOW = 0;
export const MIDI_HIGH = 120;

/**
 * Display name for a MIDI pitch, using the convention where middle C (60) is
 * C3 — so the range reads C-2..C8, matching Ableton, Kontakt and most hardware.
 *
 * This is for LABELS ONLY. Tone.js parses scientific pitch notation (middle C
 * is C4 there), so audio must keep using engine.midiToName — swapping the two
 * would transpose playback by an octave.
 */
export function pitchLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 2;
  return `${NAMES[pc]}${octave}`;
}
