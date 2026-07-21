// Web MIDI output — lets the app drive external instruments (e.g. Kontakt via a
// loopMIDI virtual port). The browser cannot create a virtual port itself, so on
// Windows the user routes through loopMIDI; here we simply send to whatever
// output port they pick. Requires a Chromium browser.

// Minimal structural types so we don't need @types/webmidi as a dependency.
interface MidiPort {
  id: string;
  name?: string;
  send(data: number[], timestamp?: number): void;
}
interface MidiAccess {
  outputs: Map<string, MidiPort>;
  onstatechange: (() => void) | null;
}

let access: MidiAccess | null = null;
let selectedId: string | null = null;
const listeners = new Set<() => void>();

export type MidiOutputInfo = { id: string; name: string };

export function isMidiSupported(): boolean {
  return typeof (navigator as unknown as { requestMIDIAccess?: unknown })
    .requestMIDIAccess === 'function';
}

export async function ensureMidi(): Promise<boolean> {
  if (access) return true;
  if (!isMidiSupported()) return false;
  // Must call on `navigator` itself — detaching the method loses `this` and
  // throws "Illegal invocation".
  const nav = navigator as unknown as {
    requestMIDIAccess: (opts?: { sysex?: boolean }) => Promise<MidiAccess>;
  };
  access = await nav.requestMIDIAccess({ sysex: false });
  access.onstatechange = () => listeners.forEach((l) => l());
  return true;
}

export function listOutputs(): MidiOutputInfo[] {
  if (!access) return [];
  return Array.from(access.outputs.values()).map((o) => ({
    id: o.id,
    name: o.name ?? 'Unknown output',
  }));
}

export function selectOutput(id: string | null) {
  selectedId = id;
  listeners.forEach((l) => l());
}

export function getSelectedId(): string | null {
  return selectedId;
}

export function getSelectedOutput(): MidiPort | null {
  if (!access || !selectedId) return null;
  return access.outputs.get(selectedId) ?? null;
}

export function onMidiChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
