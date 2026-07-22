import { useEffect, useState } from 'react';
import { engine } from './audio/engine';

export interface BrickPlayhead {
  /** Position through the brick's loop, 0..1. */
  progress: number;
  /** Seconds left in this pass. */
  remaining: number;
}

/**
 * Follows a brick while it's sounding, for the per-card tracker. The animation
 * frame loop only runs while the engine is actually playing, so idle boards
 * cost nothing.
 */
export function useBrickPlayhead(
  brickId: string,
  lengthBeats: number
): BrickPlayhead | null {
  const [state, setState] = useState<BrickPlayhead | null>(null);

  useEffect(() => {
    let raf = 0;
    let running = false;
    const len = lengthBeats > 0 ? lengthBeats : 4;

    const tick = () => {
      if (engine.isBrickPlaying(brickId)) {
        const beats = engine.transportBeats();
        const pos = ((beats % len) + len) % len;
        setState({
          progress: pos / len,
          remaining: (len - pos) * (60 / (engine.bpm || 120)),
        });
      } else {
        setState(null);
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      setState(null);
    };

    const off = engine.onChange((playing) => (playing ? start() : stop()));
    if (engine.isPlaying) start();
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [brickId, lengthBeats]);

  return state;
}

/** "-0:03" — time left in the current pass. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `-${m}:${String(s % 60).padStart(2, '0')}`;
}
