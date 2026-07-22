import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { descendantIds, familyIds } from './lib/lineage';
import {
  type Brick,
  type Mix,
  type MixLayer,
  type Note,
  type PhraseTemplate,
  type TimelineSection,
  type InstrumentId,
  STICKY_COLORS,
  MIX_COLORS,
  DEFAULT_DISPLAY,
  DEFAULT_ENVELOPE,
} from './types';

let colorCursor = 0;
function nextColor(): string {
  const c = STICKY_COLORS[colorCursor % STICKY_COLORS.length];
  colorCursor++;
  return c;
}

export function makeBrick(partial: Partial<Brick> = {}): Brick {
  const n = Math.floor(Math.random() * 40) + 40;
  return {
    id: nanoid(8),
    name: 'New motif',
    color: nextColor(),
    tags: [],
    notes: [],
    chords: '',
    lyrics: '',
    processNotes: '',
    key: 'C major',
    bpm: 120,
    lengthBeats: 8,
    instrument: 'triangle',
    timeSig: { num: 4, den: 4 },
    board: {
      x: 40 + (n % 3) * 30,
      y: 40 + (n % 5) * 24,
      rotation: (Math.random() - 0.5) * 4,
    },
    parentId: null,
    display: { ...DEFAULT_DISPLAY },
    percussion: false,
    envelope: { ...DEFAULT_ENVELOPE },
    ...partial,
  };
}

/** Where the clipboard's contents were lifted from, so paste lands in place. */
let pasteAnchor = { pitch: 60, start: 0 };

let mixColorCursor = 0;
export function makeMix(partial: Partial<Mix> = {}): Mix {
  const color = MIX_COLORS[mixColorCursor % MIX_COLORS.length];
  mixColorCursor++;
  return {
    id: nanoid(8),
    name: 'New mix',
    color,
    board: { x: 520, y: 60 },
    layers: [],
    notes: '',
    lockBpm: true,
    bpm: 120,
    ...partial,
  };
}

/** "Theme" -> "Theme v2"; "Theme v2" -> "Theme v3". */
function nextVersionName(name: string): string {
  const m = name.match(/^(.*?)[ ]*v(\d+)$/i);
  if (m) return `${m[1].trim()} v${Number(m[2]) + 1}`;
  return `${name} v2`;
}

/** Copy a brick with a fresh id + fresh note ids (fixes the old duplicate bug
 *  where the clone reused the source id). Optionally records lineage. */
function cloneBrick(
  src: Brick,
  opts: { name: string; parentId: string | null; dx: number; dy: number }
): Brick {
  const { id: _id, board: _board, ...rest } = src;
  void _id;
  void _board;
  return makeBrick({
    ...rest,
    name: opts.name,
    parentId: opts.parentId,
    notes: src.notes.map((n) => ({ ...n, id: nanoid(8) })),
    display: { ...src.display },
    board: {
      x: src.board.x + opts.dx,
      y: src.board.y + opts.dy,
      rotation: (Math.random() - 0.5) * 4,
    },
  });
}

interface AppState {
  bricks: Brick[];
  selectedBrickId: string | null;
  editorOpen: boolean;
  globalBpm: number;
  mixes: Mix[];
  activeMixId: string | null;
  // transient: an in-progress "drag to connect" from a brick to the cursor
  // transient drag-to-connect. `sourceId` is a brickId for mix/branch links,
  // or a mixId when dragging a mix down onto the timeline.
  linking: {
    sourceId: string;
    x: number;
    y: number;
    kind: 'mix' | 'branch' | 'timeline';
  } | null;
  timeline: TimelineSection[];
  // phrase-template "brush" used when clicking the piano roll
  templates: PhraseTemplate[];
  activeBrush: string | null; // template id, or null = single note
  snapToScale: boolean; // remap stamped phrases into the brick's key
  showNoteNames: boolean; // draw note/drum names on the note blocks
  /** Editing grid in beats (0.25 = 1/16, 1/6 = 1/16 triplet, ...). Drives both
   *  drawing snap and quantize. */
  grid: number;
  /** Copied notes, stored relative to the earliest one. */
  clipboard: { dp: number; start: number; duration: number; velocity: number }[];
  /** Tag ids currently filtering the board (empty = show everything). */
  activeTags: string[];
  /** Board zoom factor. Board coordinates stay unscaled; this only affects
   *  rendering and client<->board conversion. */
  zoom: number;
  /** Loop the brick when previewing it from the editor. */
  editorLoop: boolean;
  /** Length in beats given to newly placed notes. */
  noteLength: number;

  // brick CRUD
  addBrick: (partial?: Partial<Brick>) => string;
  updateBrick: (id: string, patch: Partial<Brick>) => void;
  deleteBrick: (id: string) => void;
  duplicateBrick: (id: string) => void;
  branchBrick: (id: string) => string | null;
  setParent: (id: string, parentId: string | null) => void;
  releaseChildren: (id: string) => void;
  moveBrick: (id: string, x: number, y: number) => void;

  // selection / editor
  openEditor: (id: string) => void;
  closeEditor: () => void;

  // notes within a brick
  setNotes: (brickId: string, notes: Note[]) => void;
  addNote: (brickId: string, note: Omit<Note, 'id'>) => void;
  addNotes: (brickId: string, notes: Omit<Note, 'id'>[]) => void;
  updateNote: (brickId: string, noteId: string, patch: Partial<Note>) => void;
  updateNotesBatch: (
    brickId: string,
    patches: Record<string, Partial<Note>>
  ) => void;
  removeNotes: (brickId: string, noteIds: string[]) => void;
  removeNote: (brickId: string, noteId: string) => void;

  // mixes
  setGlobalBpm: (bpm: number) => void;
  addMix: (partial?: Partial<Mix>) => string;
  deleteMix: (mixId: string) => void;
  updateMix: (mixId: string, patch: Partial<Omit<Mix, 'layers'>>) => void;
  moveMix: (mixId: string, x: number, y: number) => void;
  setActiveMix: (mixId: string | null) => void;
  toggleBrickInMix: (mixId: string, brickId: string) => void;
  updateLayer: (mixId: string, brickId: string, patch: Partial<MixLayer>) => void;
  setLinking: (
    v: {
      sourceId: string;
      x: number;
      y: number;
      kind: 'mix' | 'branch' | 'timeline';
    } | null
  ) => void;

  // timeline
  addTimelineSection: (mixId: string, atIndex?: number) => string;
  removeTimelineSection: (id: string) => void;
  moveTimelineSection: (id: string, toIndex: number) => void;
  updateTimelineSection: (
    id: string,
    patch: Partial<Omit<TimelineSection, 'id'>>
  ) => void;

  // phrase templates
  addTemplate: (name: string, notes: PhraseTemplate['notes']) => string;
  renameTemplate: (id: string, name: string) => void;
  deleteTemplate: (id: string) => void;
  setActiveBrush: (id: string | null) => void;
  setSnapToScale: (v: boolean) => void;
  setShowNoteNames: (v: boolean) => void;
  setGrid: (v: number) => void;
  toggleTag: (id: string) => void;
  clearTags: () => void;
  setZoom: (v: number) => void;
  setEditorLoop: (v: boolean) => void;
  setNoteLength: (v: number) => void;
  copyNotes: (brickId: string, noteIds: string[], cut?: boolean) => void;
  pasteNotes: (brickId: string) => string[];
  quantize: (brickId: string, noteIds: string[] | null, grid: number) => void;
  /** Ctrl-drag copy support: duplicate in place, returns old id -> new id. */
  duplicateNotes: (
    brickId: string,
    noteIds: string[]
  ) => Record<string, string>;
  duplicateTimelineSection: (id: string, atIndex?: number) => string | null;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      bricks: [],
      selectedBrickId: null,
      editorOpen: false,
      globalBpm: 120,
      mixes: [],
      activeMixId: null,
      linking: null,
      timeline: [],
      templates: [],
      activeBrush: null,
      snapToScale: false,
      showNoteNames: false,
      grid: 0.25,
      clipboard: [],
      activeTags: [],
      zoom: 1,
      editorLoop: true,
      noteLength: 1,

      addBrick: (partial) => {
        const brick = makeBrick(partial);
        set((s) => ({ bricks: [...s.bricks, brick] }));
        return brick.id;
      },

      updateBrick: (id, patch) =>
        set((s) => ({
          bricks: s.bricks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),

      deleteBrick: (id) =>
        set((s) => ({
          bricks: s.bricks
            .filter((b) => b.id !== id)
            // re-parent orphans to the deleted brick's parent so the chain
            // survives a middle-link deletion (grandparent adopts the children)
            .map((b) => {
              if (b.parentId !== id) return b;
              const removed = s.bricks.find((x) => x.id === id);
              return { ...b, parentId: removed?.parentId ?? null };
            }),
          mixes: s.mixes.map((mx) => ({
            ...mx,
            layers: mx.layers.filter((l) => l.brickId !== id),
          })),
          selectedBrickId: s.selectedBrickId === id ? null : s.selectedBrickId,
          editorOpen: s.selectedBrickId === id ? false : s.editorOpen,
        })),

      duplicateBrick: (id) =>
        set((s) => {
          const src = s.bricks.find((b) => b.id === id);
          if (!src) return {};
          const copy = cloneBrick(src, {
            name: src.name + ' copy',
            parentId: src.parentId,
            dx: 24,
            dy: 24,
          });
          return { bricks: [...s.bricks, copy] };
        }),

      branchBrick: (id) => {
        const s = useStore.getState();
        const src = s.bricks.find((b) => b.id === id);
        if (!src) return null;
        const child = cloneBrick(src, {
          name: nextVersionName(src.name),
          parentId: src.id,
          dx: 60,
          dy: 210,
        });
        set((st) => ({ bricks: [...st.bricks, child] }));
        return child.id;
      },

      setParent: (id, parentId) =>
        set((s) => {
          if (id === parentId) return {};
          // can't parent to self or to one of your own descendants (no cycles)
          if (parentId && descendantIds(s.bricks, id).has(parentId)) return {};
          return {
            bricks: s.bricks.map((b) =>
              b.id === id ? { ...b, parentId } : b
            ),
          };
        }),

      releaseChildren: (id) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.parentId === id ? { ...b, parentId: null } : b
          ),
        })),

      moveBrick: (id, x, y) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === id ? { ...b, board: { ...b.board, x, y } } : b
          ),
        })),

      openEditor: (id) => set({ selectedBrickId: id, editorOpen: true }),
      closeEditor: () => set({ editorOpen: false }),

      setNotes: (brickId, notes) =>
        set((s) => ({
          bricks: s.bricks.map((b) => (b.id === brickId ? { ...b, notes } : b)),
        })),

      addNote: (brickId, note) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === brickId
              ? { ...b, notes: [...b.notes, { ...note, id: nanoid(8) }] }
              : b
          ),
        })),

      addNotes: (brickId, notes) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === brickId
              ? {
                  ...b,
                  notes: [
                    ...b.notes,
                    ...notes.map((n) => ({ ...n, id: nanoid(8) })),
                  ],
                }
              : b
          ),
        })),

      updateNote: (brickId, noteId, patch) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === brickId
              ? {
                  ...b,
                  notes: b.notes.map((n) =>
                    n.id === noteId ? { ...n, ...patch } : n
                  ),
                }
              : b
          ),
        })),

      updateNotesBatch: (brickId, patches) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === brickId
              ? {
                  ...b,
                  notes: b.notes.map((n) =>
                    patches[n.id] ? { ...n, ...patches[n.id] } : n
                  ),
                }
              : b
          ),
        })),

      removeNotes: (brickId, noteIds) =>
        set((s) => {
          const kill = new Set(noteIds);
          return {
            bricks: s.bricks.map((b) =>
              b.id === brickId
                ? { ...b, notes: b.notes.filter((n) => !kill.has(n.id)) }
                : b
            ),
          };
        }),

      removeNote: (brickId, noteId) =>
        set((s) => ({
          bricks: s.bricks.map((b) =>
            b.id === brickId
              ? { ...b, notes: b.notes.filter((n) => n.id !== noteId) }
              : b
          ),
        })),

      setGlobalBpm: (bpm) => set({ globalBpm: clampBpm(bpm) }),

      addMix: (partial) => {
        const s = useStore.getState();
        const mix = makeMix({
          name: `Mix ${s.mixes.length + 1}`,
          board: { x: 520, y: 60 + s.mixes.length * 150 },
          ...partial,
        });
        set((st) => ({ mixes: [...st.mixes, mix], activeMixId: mix.id }));
        return mix.id;
      },

      deleteMix: (mixId) =>
        set((s) => ({
          mixes: s.mixes.filter((m) => m.id !== mixId),
          activeMixId: s.activeMixId === mixId ? null : s.activeMixId,
          // drop any timeline sections that referenced it
          timeline: s.timeline.filter((t) => t.mixId !== mixId),
        })),

      updateMix: (mixId, patch) =>
        set((s) => ({
          mixes: s.mixes.map((m) => (m.id === mixId ? { ...m, ...patch } : m)),
        })),

      moveMix: (mixId, x, y) =>
        set((s) => ({
          mixes: s.mixes.map((m) =>
            m.id === mixId ? { ...m, board: { x, y } } : m
          ),
        })),

      setActiveMix: (mixId) => set({ activeMixId: mixId }),

      toggleBrickInMix: (mixId, brickId) =>
        set((s) => {
          const fam = familyIds(s.bricks, brickId);
          return {
            mixes: s.mixes.map((mx) => {
              if (mx.id !== mixId) return mx;
              const exists = mx.layers.some((l) => l.brickId === brickId);
              if (exists) {
                return {
                  ...mx,
                  layers: mx.layers.filter((l) => l.brickId !== brickId),
                };
              }
              // Per-mix lineage exclusion: within THIS mix, only one iteration
              // of a lineage tree. Other mixes are unaffected.
              const kept = mx.layers.filter((l) => !fam.has(l.brickId));
              return {
                ...mx,
                layers: [
                  ...kept,
                  { brickId, loop: true, mute: false, solo: false, gain: 0.8 },
                ],
              };
            }),
          };
        }),

      updateLayer: (mixId, brickId, patch) =>
        set((s) => ({
          mixes: s.mixes.map((mx) =>
            mx.id === mixId
              ? {
                  ...mx,
                  layers: mx.layers.map((l) =>
                    l.brickId === brickId ? { ...l, ...patch } : l
                  ),
                }
              : mx
          ),
        })),

      setLinking: (v) => set({ linking: v }),

      addTimelineSection: (mixId, atIndex) => {
        const s = useStore.getState();
        const mix = s.mixes.find((m) => m.id === mixId);
        const section: TimelineSection = {
          id: nanoid(8),
          mixId,
          repeats: 1,
          // inherit the mix's own tempo setting as the starting point
          lockBpm: mix?.lockBpm ?? true,
          bpm: mix && !mix.lockBpm ? mix.bpm : s.globalBpm,
          timeSig: { num: 4, den: 4 },
        };
        set((st) => {
          const next = [...st.timeline];
          const i = atIndex == null ? next.length : Math.max(0, Math.min(next.length, atIndex));
          next.splice(i, 0, section);
          return { timeline: next };
        });
        return section.id;
      },

      removeTimelineSection: (id) =>
        set((s) => ({ timeline: s.timeline.filter((t) => t.id !== id) })),

      moveTimelineSection: (id, toIndex) =>
        set((s) => {
          const from = s.timeline.findIndex((t) => t.id === id);
          if (from < 0) return {};
          const next = [...s.timeline];
          const [item] = next.splice(from, 1);
          next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, item);
          return { timeline: next };
        }),

      updateTimelineSection: (id, patch) =>
        set((s) => ({
          timeline: s.timeline.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      addTemplate: (name, notes) => {
        const tpl: PhraseTemplate = { id: nanoid(8), name, notes };
        set((s) => ({
          templates: [...s.templates, tpl],
          activeBrush: tpl.id,
        }));
        return tpl.id;
      },

      renameTemplate: (id, name) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, name } : t
          ),
        })),

      deleteTemplate: (id) =>
        set((s) => ({
          templates: s.templates.filter((t) => t.id !== id),
          activeBrush: s.activeBrush === id ? null : s.activeBrush,
        })),

      setActiveBrush: (id) => set({ activeBrush: id }),
      setSnapToScale: (v) => set({ snapToScale: v }),
      setShowNoteNames: (v) => set({ showNoteNames: v }),
      setGrid: (v) => set({ grid: v }),

      toggleTag: (id) =>
        set((s) => ({
          activeTags: s.activeTags.includes(id)
            ? s.activeTags.filter((t) => t !== id)
            : [...s.activeTags, id],
        })),
      clearTags: () => set({ activeTags: [] }),
      setZoom: (v) => set({ zoom: Math.max(0.2, Math.min(2, v)) }),
      setEditorLoop: (v) => set({ editorLoop: v }),
      setNoteLength: (v) => set({ noteLength: Math.max(0.0625, v) }),

      copyNotes: (brickId, noteIds, cut = false) => {
        const s = useStore.getState();
        const brick = s.bricks.find((b) => b.id === brickId);
        if (!brick) return;
        const picked = brick.notes.filter((n) => noteIds.includes(n.id));
        if (picked.length === 0) return;
        const minStart = Math.min(...picked.map((n) => n.start));
        const anchor = picked.reduce((a, b) =>
          b.start < a.start || (b.start === a.start && b.pitch < a.pitch) ? b : a
        );
        set({
          clipboard: picked.map((n) => ({
            dp: n.pitch - anchor.pitch,
            start: n.start - minStart,
            duration: n.duration,
            velocity: n.velocity,
          })),
        });
        // remember where it came from so paste lands in place
        pasteAnchor = { pitch: anchor.pitch, start: minStart };
        if (cut) useStore.getState().removeNotes(brickId, noteIds);
      },

      pasteNotes: (brickId) => {
        const s = useStore.getState();
        if (s.clipboard.length === 0) return [];
        const ids: string[] = [];
        const notes = s.clipboard.map((c) => {
          const id = nanoid(8);
          ids.push(id);
          return {
            id,
            pitch: Math.max(0, Math.min(127, pasteAnchor.pitch + c.dp)),
            start: Math.max(0, pasteAnchor.start + c.start),
            duration: c.duration,
            velocity: c.velocity,
          };
        });
        set((st) => ({
          bricks: st.bricks.map((b) =>
            b.id === brickId ? { ...b, notes: [...b.notes, ...notes] } : b
          ),
        }));
        return ids;
      },

      /** Copy notes in place; returns original id -> copy id. */
      duplicateNotes: (brickId, noteIds) => {
        const s = useStore.getState();
        const brick = s.bricks.find((b) => b.id === brickId);
        if (!brick) return {};
        const wanted = new Set(noteIds);
        const map: Record<string, string> = {};
        const copies: Note[] = [];
        for (const n of brick.notes) {
          if (!wanted.has(n.id)) continue;
          const id = nanoid(8);
          map[n.id] = id;
          copies.push({ ...n, id });
        }
        if (copies.length === 0) return {};
        set((st) => ({
          bricks: st.bricks.map((b) =>
            b.id === brickId ? { ...b, notes: [...b.notes, ...copies] } : b
          ),
        }));
        return map;
      },

      duplicateTimelineSection: (id, atIndex) => {
        const s = useStore.getState();
        const src = s.timeline.find((t) => t.id === id);
        if (!src) return null;
        const copy: TimelineSection = { ...src, id: nanoid(8) };
        set((st) => {
          const next = [...st.timeline];
          const i =
            atIndex == null
              ? next.length
              : Math.max(0, Math.min(next.length, atIndex));
          next.splice(i, 0, copy);
          return { timeline: next };
        });
        return copy.id;
      },

      quantize: (brickId, noteIds, grid) =>
        set((s) => ({
          bricks: s.bricks.map((b) => {
            if (b.id !== brickId) return b;
            const target = noteIds ? new Set(noteIds) : null;
            return {
              ...b,
              notes: b.notes.map((n) =>
                !target || target.has(n.id)
                  ? { ...n, start: Math.max(0, Math.round(n.start / grid) * grid) }
                  : n
              ),
            };
          }),
        })),
    }),
    {
      name: 'music-composition-suite',
      // NOTE: bump this whenever a backfill is added below, or existing saves
      // never receive it (that shipped mixes with an undefined tempo).
      version: 7,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as
          | {
              bricks?: Brick[];
              mix?: MixLayer[];
              mixes?: Mix[];
              activeMixId?: string | null;
              templates?: PhraseTemplate[];
              activeBrush?: string | null;
            }
          | undefined;
        if (!state) return state as never;
        // always backfill brick fields added over time
        state.bricks = (state.bricks ?? []).map((b) => ({
          ...b,
          parentId: b.parentId ?? null,
          display: b.display ?? { ...DEFAULT_DISPLAY },
          timeSig: b.timeSig ?? { num: 4, den: 4 },
          percussion: b.percussion ?? false,
          envelope: b.envelope ?? { ...DEFAULT_ENVELOPE },
        }));
        // backfill mix fields added over time
        if (state.mixes) {
          state.mixes = state.mixes.map((m) => ({
            ...m,
            notes: m.notes ?? '',
            lockBpm: m.lockBpm ?? true,
            bpm: m.bpm ?? 120,
          }));
        }
        // v1 -> v2: single `mix` becomes a list of named mixes
        if (version < 2) {
          const legacy = state.mix ?? [];
          if (legacy.length > 0) {
            const mix = makeMix({ name: 'Mix 1', layers: legacy });
            state.mixes = [mix];
            state.activeMixId = mix.id;
          } else {
            state.mixes = [];
            state.activeMixId = null;
          }
          delete state.mix;
        }
        // v2 -> v3: phrase templates
        if (version < 3) {
          state.templates = state.templates ?? [];
          state.activeBrush = null;
        }
        return state as never;
      },
      partialize: (s) => ({
        bricks: s.bricks,
        globalBpm: s.globalBpm,
        mixes: s.mixes,
        activeMixId: s.activeMixId,
        templates: s.templates,
        activeBrush: s.activeBrush,
        snapToScale: s.snapToScale,
        showNoteNames: s.showNoteNames,
        grid: s.grid,
        editorLoop: s.editorLoop,
        noteLength: s.noteLength,
        timeline: s.timeline,
      }),
    }
  )
);

// Selectors / helpers
export function getBrick(id: string | null): Brick | undefined {
  if (!id) return undefined;
  return useStore.getState().bricks.find((b) => b.id === id);
}

function clampBpm(bpm: number): number {
  if (Number.isNaN(bpm)) return 120;
  return Math.max(20, Math.min(300, Math.round(bpm)));
}

export { clampBpm, descendantIds, familyIds };
export type { InstrumentId };
