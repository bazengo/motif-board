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
// It only runs while the engine is actually playing: previously it ticked every
// mounted card at 60fps forever, which quietly taxed a big board while idle.
const subscribers = new Set<() => void>();
let rafId = 0;
let engineWatch: (() => void) | null = null;

function loop() {
  for (const fn of subscribers) fn();
  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (!rafId) rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  // one last pass so cards clear their tracker rather than freezing mid-sweep
  for (const fn of subscribers) fn();
}

function subscribeTick(fn: () => void): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1) {
    engineWatch = engine.onChange((playing) =>
      playing ? startLoop() : stopLoop()
    );
    if (engine.isPlaying && !engine.isPaused) startLoop();
  }
  fn(); // seed immediately, don't wait for a frame
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      engineWatch?.();
      engineWatch = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
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
