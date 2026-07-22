// Note input from a USB/MIDI keyboard (Web MIDI) and from the computer
// keyboard. Both funnel into the same note-on/note-off listeners so the
// recorder doesn't care where a note came from.

export type NoteOn = (pitch: number, velocity: number) => void;
export type NoteOff = (pitch: number) => void;

interface MidiPort {
  id: string;
  name?: string;
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface MidiAccess {
  inputs: Map<string, MidiPort>;
  onstatechange: (() => void) | null;
}

let access: MidiAccess | null = null;
let selectedId: string | null = null;
const onListeners = new Set<NoteOn>();
const offListeners = new Set<NoteOff>();
const changeListeners = new Set<() => void>();

export type MidiInputInfo = { id: string; name: string };

export function onNoteOn(cb: NoteOn): () => void {
  onListeners.add(cb);
  return () => onListeners.delete(cb);
}
export function onNoteOff(cb: NoteOff): () => void {
  offListeners.add(cb);
  return () => offListeners.delete(cb);
}
export function onInputChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

export function emitNoteOn(pitch: number, velocity = 0.8) {
  onListeners.forEach((l) => l(pitch, velocity));
}
export function emitNoteOff(pitch: number) {
  offListeners.forEach((l) => l(pitch));
}

export async function ensureMidiIn(): Promise<boolean> {
  if (access) return true;
  const nav = navigator as unknown as {
    requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MidiAccess>;
  };
  if (typeof nav.requestMIDIAccess !== 'function') return false;
  access = await nav.requestMIDIAccess({ sysex: false });
  access.onstatechange = () => changeListeners.forEach((l) => l());
  return true;
}

export function listInputs(): MidiInputInfo[] {
  if (!access) return [];
  return [...access.inputs.values()].map((i) => ({
    id: i.id,
    name: i.name ?? 'Unknown input',
  }));
}

export function selectInput(id: string | null) {
  if (!access) return;
  // detach the old port
  for (const port of access.inputs.values()) port.onmidimessage = null;
  selectedId = id;
  if (!id) return;
  const port = access.inputs.get(id);
  if (!port) return;
  port.onmidimessage = (e) => {
    const [status, d1, d2] = e.data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && d2 > 0) emitNoteOn(d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) emitNoteOff(d1);
  };
  changeListeners.forEach((l) => l());
}

export function getSelectedInputId(): string | null {
  return selectedId;
}

// ---- Computer keyboard ----
// Piano layout starting on 'A' = C, as in most DAWs:
//   A W S E D F T G Y H U J  ->  C C# D D# E F F# G G# A A# B
//   K  -> the octave above
const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15,
};

export function keyToSemitone(key: string): number | null {
  const v = KEY_MAP[key.toLowerCase()];
  return v === undefined ? null : v;
}

export const KEYBOARD_HINT = 'A=C, W=C♯, S=D … J=B, K=C. Z / X shift octave.';

/**
 * Turn a Web MIDI failure into something actionable. Firefox reports
 * "WebMIDI requires a site permission add-on to activate" — it doesn't support
 * Web MIDI natively, unlike Chrome/Edge.
 */
export function describeMidiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const firefox =
    /site permission add-?on/i.test(msg) ||
    navigator.userAgent.includes('Firefox');
  if (firefox) {
    return 'Firefox does not support Web MIDI natively — it needs a site permission add-on. Chrome or Edge work out of the box, so opening the app there is the quickest fix. (Computer-keyboard input works in any browser.)';
  }
  return msg;
}
