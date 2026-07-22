import { useStore } from './store';
import type { Brick, Group, Mix, TimelineSection, PhraseTemplate } from './types';

// Lightweight, non-invasive undo/redo. We subscribe to the store and snapshot
// the tracked slice (bricks + mixes + globalBpm) on a debounce, so a burst of
// changes (e.g. dragging a note) collapses into a single history entry.
interface Snap {
  bricks: Brick[];
  mixes: Mix[];
  timeline: TimelineSection[];
  templates: PhraseTemplate[];
  groups: Group[];
  globalBpm: number;
}

const LIMIT = 80;
let past: Snap[] = [];
let future: Snap[] = [];
let traveling = false;
let last: Snap | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function snap(): Snap {
  const s = useStore.getState();
  return {
    bricks: s.bricks,
    mixes: s.mixes,
    timeline: s.timeline,
    templates: s.templates,
    groups: s.groups,
    globalBpm: s.globalBpm,
  };
}
// Reference equality is enough — our store uses immutable updates, so an
// unchanged slice keeps the same array/value reference.
function same(a: Snap, b: Snap): boolean {
  return (
    a.bricks === b.bricks &&
    a.mixes === b.mixes &&
    a.timeline === b.timeline &&
    a.templates === b.templates &&
    a.groups === b.groups &&
    a.globalBpm === b.globalBpm
  );
}
function emit() {
  listeners.forEach((l) => l());
}

function commit() {
  timer = null;
  const cur = snap();
  if (last && same(cur, last)) return;
  if (last) {
    past.push(last);
    if (past.length > LIMIT) past.shift();
  }
  future = [];
  last = cur;
  emit();
}

function apply(s: Snap) {
  traveling = true;
  useStore.setState({
    bricks: s.bricks,
    mixes: s.mixes,
    timeline: s.timeline,
    templates: s.templates,
    groups: s.groups,
    globalBpm: s.globalBpm,
  });
  traveling = false;
  last = s;
}

export function initHistory(): () => void {
  last = snap();
  return useStore.subscribe(() => {
    if (traveling) return;
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(commit, 350);
  });
}

export function undo() {
  if (timer) {
    clearTimeout(timer);
    commit(); // flush any pending change so it can be undone
  }
  if (!past.length) return;
  future.push(snap());
  apply(past.pop()!);
  emit();
}

export function redo() {
  if (!future.length) return;
  past.push(snap());
  apply(future.pop()!);
  emit();
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function onHistory(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
