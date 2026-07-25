import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * localStorage, but writes are coalesced.
 *
 * Zustand's persist saves on every state change, and `localStorage.setItem` is
 * a synchronous write of the whole serialised project. Dragging a card or a
 * note fires state changes at ~60fps, so the app was stringifying and writing
 * the entire project 60 times a second — getting steadily worse as the project
 * grew. Reads stay immediate (they only happen at startup); writes land after
 * a short idle gap, plus a guaranteed flush on page hide so nothing is lost.
 */
const WRITE_DELAY = 400;

let timer: number | null = null;
const dirty = new Map<string, string>();

function flush() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  for (const [key, value] of dirty) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota or private mode — losing a snapshot beats crashing the app */
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
