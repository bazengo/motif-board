import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import {
  type Brick,
  type MixLayer,
  type Note,
  type InstrumentId,
  STICKY_COLORS,
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
  mix: MixLayer[];

  // brick CRUD
  addBrick: (partial?: Partial<Brick>) => string;
  updateBrick: (id: string, patch: Partial<Brick>) => void;
  deleteBrick: (id: string) => void;
  duplicateBrick: (id: string) => void;
  branchBrick: (id: string) => string | null;
  moveBrick: (id: string, x: number, y: number) => void;

  // selection / editor
  openEditor: (id: string) => void;
  closeEditor: () => void;

  // notes within a brick
  setNotes: (brickId: string, notes: Note[]) => void;
  addNote: (brickId: string, note: Omit<Note, 'id'>) => void;
  updateNote: (brickId: string, noteId: string, patch: Partial<Note>) => void;
  updateNotesBatch: (
    brickId: string,
    patches: Record<string, Partial<Note>>
  ) => void;
  removeNotes: (brickId: string, noteIds: string[]) => void;
  removeNote: (brickId: string, noteId: string) => void;

  // mix
  setGlobalBpm: (bpm: number) => void;
  toggleInMix: (brickId: string) => void;
  updateLayer: (brickId: string, patch: Partial<MixLayer>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      bricks: [],
      selectedBrickId: null,
      editorOpen: false,
      globalBpm: 120,
      mix: [],

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
            // re-parent orphans to null so lineage lines don't dangle
            .map((b) => (b.parentId === id ? { ...b, parentId: null } : b)),
          mix: s.mix.filter((m) => m.brickId !== id),
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

      toggleInMix: (brickId) =>
        set((s) => {
          const exists = s.mix.some((m) => m.brickId === brickId);
          if (exists)
            return { mix: s.mix.filter((m) => m.brickId !== brickId) };
          const layer: MixLayer = {
            brickId,
            loop: true,
            mute: false,
            solo: false,
            gain: 0.8,
          };
          // Only one iteration of a lineage tree plays at a time: drop any
          // sibling/ancestor/descendant already in the mix.
          const fam = familyIds(s.bricks, brickId);
          const mix = s.mix.filter(
            (m) => m.brickId === brickId || !fam.has(m.brickId)
          );
          return { mix: [...mix, layer] };
        }),

      updateLayer: (brickId, patch) =>
        set((s) => ({
          mix: s.mix.map((m) =>
            m.brickId === brickId ? { ...m, ...patch } : m
          ),
        })),
    }),
    {
      name: 'music-composition-suite',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { bricks?: Brick[] } | undefined;
        if (state?.bricks) {
          state.bricks = state.bricks.map((b) => ({
            ...b,
            parentId: b.parentId ?? null,
            display: b.display ?? { ...DEFAULT_DISPLAY },
          }));
        }
        return state as never;
      },
      partialize: (s) => ({
        bricks: s.bricks,
        globalBpm: s.globalBpm,
        mix: s.mix,
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
