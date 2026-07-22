import { useEffect, useState } from 'react';
import { engine } from './audio/engine';

export interface BrickPlayhead {
  /** Position through the brick's loop, 0..1. */
  progress: number;
  /** Seconds left in this pass. */
  remaining: number;
}

// One animation frame loop for the whole board, rather than one per card with
// its own start/stop bookkeeping — that was fragile and easy to leave stalled.
const subscribers = new Set<() => void>();
let rafId = 0;

function loop() {
  for (const fn of subscribers) fn();
  rafId = requestAnimationFrame(loop);
}

function subscribeTick(fn: () => void): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1) rafId = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

/** Follows a brick while it's sounding, for the per-card tracker. */
export function useBrickPlayhead(brickId: string): BrickPlayhead | null {
  const [state, setState] = useState<BrickPlayhead | null>(null);

  useEffect(
    () =>
      subscribeTick(() => {
        const next = engine.brickPosition(brickId);
        // only re-render when something actually moved
        setState((prev) => {
          if (!next) return prev === null ? prev : null;
          if (
            prev &&
            Math.abs(prev.progress - next.progress) < 0.0005 &&
            Math.abs(prev.remaining - next.remaining) < 0.02
          ) {
            return prev;
          }
          return next;
        });
      }),
    [brickId]
  );

  return state;
}

/** "-0:03" — time left in the current pass. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `-${m}:${String(s % 60).padStart(2, '0')}`;
}
