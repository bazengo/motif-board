import { useStore, makeBrick, makeMix } from '../store';
import { flushStorage } from './debouncedStorage';
import type {
  Brick,
  InstrumentPreset,
  Mix,
  Note,
  PhraseTemplate,
  TimelineSection,
} from '../types';

interface ProjectFile {
  app: 'motif-board';
  version: 4;
  bricks: Brick[];
  mixes: Mix[];
  timeline: TimelineSection[];
  globalBpm: number;
  templates: PhraseTemplate[];
  presets?: InstrumentPreset[];
}

export function exportProject(filename = 'motif-board-project.json') {
  // make the on-disk save match what we hand out, so a later rescue file
  // can't be older than the export the user believes they have
  flushStorage();
  const s = useStore.getState();
  const data: ProjectFile = {
    app: 'motif-board',
    version: 4,
    bricks: s.bricks,
    mixes: s.mixes,
    timeline: s.timeline,
    globalBpm: s.globalBpm,
    templates: s.templates,
    presets: s.presets,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- import validation ----------
// Imports come from the wild: hand-edited files, rescue files (the raw persist
// envelope from the crash screen), truncated downloads. Rather than trusting
// the shape, rebuild every entity through the same constructors the app uses,
// clamp numeric fields, and drop anything unrecognisable — a half-good file
// should import its good half, not throw away everything.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const num = (v: unknown, fallback: number, lo: number, hi: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

function sanitizeNote(v: unknown): Note | null {
  if (!isObj(v)) return null;
  if (typeof v.pitch !== 'number' || typeof v.start !== 'number') return null;
  return {
    id: str(v.id, Math.random().toString(36).slice(2, 10)),
    pitch: Math.round(num(v.pitch, 60, 0, 127)),
    start: num(v.start, 0, 0, 10000),
    duration: num(v.duration, 0.25, 0.01, 1000),
    velocity: num(v.velocity, 0.8, 0.01, 1),
  };
}

function sanitizeBrick(v: unknown): Brick | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const notes = Array.isArray(v.notes)
    ? (v.notes.map(sanitizeNote).filter(Boolean) as Note[])
    : [];
  // makeBrick supplies every default; the spread keeps whatever validates
  const brick = makeBrick({
    ...(v as Partial<Brick>),
    notes,
    bpm: num(v.bpm, 120, 20, 300),
    lengthBeats: num(v.lengthBeats, 8, 1, 512),
  });
  brick.id = v.id;
  return brick;
}

function sanitizeMix(v: unknown, brickIds: Set<string>): Mix | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const layers = Array.isArray(v.layers)
    ? v.layers
        .filter(
          (l): l is Record<string, unknown> =>
            isObj(l) &&
            typeof l.brickId === 'string' &&
            brickIds.has(l.brickId)
        )
        .map((l) => ({
          brickId: l.brickId as string,
          loop: l.loop !== false,
          mute: l.mute === true,
          solo: l.solo === true,
          gain: num(l.gain, 0.8, 0, 1),
          automation: Array.isArray(l.automation)
            ? l.automation
                .filter(
                  (p): p is { t: number; v: number } =>
                    isObj(p) && typeof p.t === 'number' && typeof p.v === 'number'
                )
                .map((p) => ({ t: num(p.t, 0, 0, 1), v: num(p.v, 1, 0, 1) }))
            : undefined,
        }))
    : [];
  const mix = makeMix({ ...(v as Partial<Mix>), layers });
  mix.id = v.id;
  mix.bpm = num(v.bpm, 120, 20, 300);
  return mix;
}

function sanitizeSection(
  v: unknown,
  mixIds: Set<string>
): TimelineSection | null {
  if (!isObj(v) || typeof v.mixId !== 'string' || !mixIds.has(v.mixId))
    return null;
  const ts = isObj(v.timeSig) ? v.timeSig : {};
  return {
    id: str(v.id, Math.random().toString(36).slice(2, 10)),
    mixId: v.mixId,
    repeats: Math.round(num(v.repeats, 1, 1, 64)),
    lockBpm: v.lockBpm !== false,
    bpm: num(v.bpm, 120, 20, 300),
    timeSig: {
      num: Math.round(num(ts.num, 4, 1, 32)),
      den: [2, 4, 8, 16].includes(ts.den as number) ? (ts.den as number) : 4,
    },
  };
}

export async function importProject(file: File): Promise<void> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isObj(data)) throw new Error('Not a Motif Board project file.');

  // accept the crash screen's rescue file: a zustand persist envelope
  // { state: { bricks, ... }, version }
  const src = isObj(data.state) && Array.isArray(data.state.bricks)
    ? data.state
    : data;
  if (!isObj(src) || !Array.isArray(src.bricks)) {
    throw new Error('Not a Motif Board project file.');
  }

  const bricks = src.bricks.map(sanitizeBrick).filter(Boolean) as Brick[];
  const brickIds = new Set(bricks.map((b) => b.id));
  const mixes = (Array.isArray(src.mixes) ? src.mixes : [])
    .map((m: unknown) => sanitizeMix(m, brickIds))
    .filter(Boolean) as Mix[];
  const mixIds = new Set(mixes.map((m) => m.id));
  const timeline = (Array.isArray(src.timeline) ? src.timeline : [])
    .map((t: unknown) => sanitizeSection(t, mixIds))
    .filter(Boolean) as TimelineSection[];

  useStore.setState({
    bricks,
    mixes,
    timeline,
    globalBpm: num(src.globalBpm, 120, 20, 300),
    templates: (Array.isArray(src.templates)
      ? src.templates.filter(
          (t: unknown) => isObj(t) && typeof t.id === 'string' && Array.isArray(t.notes)
        )
      : []) as PhraseTemplate[],
    presets: (Array.isArray(src.presets)
      ? src.presets.filter(
          (p: unknown) => isObj(p) && typeof p.id === 'string'
        )
      : []) as InstrumentPreset[],
    activeBrush: null,
    activeMixId: mixes[0]?.id ?? null,
    selectedBrickId: null,
    editorOpen: false,
    selection: { bricks: [], mixes: [] },
  });
}
