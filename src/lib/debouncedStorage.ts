import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * localStorage, but writes are coalesced — and guarded.
 *
 * Zustand's persist saves on every state change, and `localStorage.setItem` is
 * a synchronous write of the whole serialised project. Dragging a card or a
 * note fires state changes at ~60fps, so the app was stringifying and writing
 * the entire project 60 times a second — getting steadily worse as the project
 * grew. Reads stay immediate (they only happen at startup); writes land after
 * a short idle gap, plus a guaranteed flush on page hide so nothing is lost.
 *
 * On top of that:
 * - a rolling snapshot (.bak1, .bak2) is rotated at most every few minutes, so
 *   a corrupted save or a bad import can be rolled back;
 * - write failures (quota, private mode) surface through onStorageError
 *   instead of silently dropping the user's work.
 */
const WRITE_DELAY = 400;
const SNAPSHOT_EVERY = 3 * 60 * 1000;

let timer: number | null = null;
const dirty = new Map<string, string>();
let lastSnapshot = 0;

const errorListeners = new Set<(message: string) => void>();
export function onStorageError(cb: (message: string) => void): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

function rotateSnapshots(key: string) {
  const now = Date.now();
  if (now - lastSnapshot < SNAPSHOT_EVERY) return;
  lastSnapshot = now;
  try {
    const current = localStorage.getItem(key);
    if (!current) return;
    const bak1 = localStorage.getItem(`${key}.bak1`);
    if (bak1) localStorage.setItem(`${key}.bak2`, bak1);
    localStorage.setItem(`${key}.bak1`, current);
  } catch {
    /* snapshots are best-effort; never let them break the main save */
  }
}

function flush() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  for (const [key, value] of dirty) {
    try {
      rotateSnapshots(key);
      localStorage.setItem(key, value);
    } catch {
      const msg =
        'Saving failed — browser storage is full or blocked. Your latest ' +
        'changes are NOT saved. Export your project (⇩ Save) to keep them.';
      errorListeners.forEach((l) => l(msg));
    }
  }
  dirty.clear();
}

if (typeof window !== 'undefined') {
  // pagehide covers reloads, tab closes and mobile backgrounding
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

const debounced: StateStorage = {
  getItem: (name) => dirty.get(name) ?? localStorage.getItem(name),
  setItem: (name, value) => {
    dirty.set(name, value);
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(flush, WRITE_DELAY);
  },
  removeItem: (name) => {
    dirty.delete(name);
    localStorage.removeItem(name);
  },
};

export const debouncedStorage = createJSONStorage(() => debounced);
/** Force any pending write out now (used before export/import). */
export const flushStorage = flush;
