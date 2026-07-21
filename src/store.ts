import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import {
  type Brick,
  type Mix,
  type MixLayer,
  type Note,
  type PhraseTemplate,
  type InstrumentId,
  STICKY_COLORS,
  MIX_COLORS,
  DEFAULT_DISPLAY,
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
    board: {
      x: 40 + (n % 3) * 30,
      y: 40 + (n % 5) * 24,
      rotation: (Math.random() - 0.5) * 4,
    },
    parentId: null,
    display: { ...DEFAULT_DISPLAY },
    ...partial,
  };
}

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
    ...partial,
  };
}

/** Descendants of `id` (its whole subtree, excluding itself). Used to prevent
 *  cycles when re-parenting. */
export function descendantIds(bricks: Brick[], id: string): Set<string> {
  const out = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const b of bricks) {
      if (b.parentId && (b.parentId === id || out.has(b.parentId)) && !out.has(b.id)) {
        out.add(b.id);
        added = true;
      }
    }
  }
  return out;
}

/** All bricks connected to `id` through parent/child links (the whole lineage
 *  tree it belongs to), including `id` itself. */
export function familyIds(bricks: Brick[], id: string): Set<string> {
  const byId = new Map(bricks.map((b) => [b.id, b]));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const b of bricks) {
    if (b.parentId && byId.has(b.parentId)) {
      link(b.id, b.parentId);
      link(b.parentId, b.id);
    }
  }
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen;
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
  linking: { brickId: string; x: number; y: number } | null;
  // phrase-template "brush" used when clicking the piano roll
  templates: PhraseTemplate[];
  activeBrush: string | null; // template id, or null = single note

  // brick CRUD
  addBrick: (partial?: Partial<Brick>) => string;
  updateBrick: (id: string, patch: Partial<Brick>) => void;
  deleteBrick: (id: string) => void;
  duplicateBrick: (id: string) => void;
  branchBrick: (id: string) => string | null;
  setParent: (id: string, parentId: string | null) => void;
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
  setLinking: (v: { brickId: string; x: number; y: number } | null) => void;

  // phrase templates
  addTemplate: (name: string, notes: PhraseTemplate['notes']) => string;
  deleteTemplate: (id: string) => void;
  setActiveBrush: (id: string | null) => void;
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
      templates: [],
      activeBrush: null,

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

      addTemplate: (name, notes) => {
        const tpl: PhraseTemplate = { id: nanoid(8), name, notes };
        set((s) => ({
          templates: [...s.templates, tpl],
          activeBrush: tpl.id,
        }));
        return tpl.id;
      },

      deleteTemplate: (id) =>
        set((s) => ({
          templates: s.templates.filter((t) => t.id !== id),
          activeBrush: s.activeBrush === id ? null : s.activeBrush,
        })),

      setActiveBrush: (id) => set({ activeBrush: id }),
    }),
    {
      name: 'music-composition-suite',
      version: 3,
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
        // v0/v1 -> add brick fields
        state.bricks = (state.bricks ?? []).map((b) => ({
          ...b,
          parentId: b.parentId ?? null,
          display: b.display ?? { ...DEFAULT_DISPLAY },
        }));
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

export { clampBpm };
export type { InstrumentId };
