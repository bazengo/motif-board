import type { AutomationPoint } from '../types';

/**
 * Volume automation is a list of breakpoints across ONE pass of the mix, which
 * then repeats. Values interpolate linearly between points and hold flat
 * outside the first and last, so a two-point envelope reads as a simple ramp.
 */
export function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}

/** Level multiplier at position `t` (0..1) through the pass. */
export function evaluateAutomation(
  points: AutomationPoint[] | undefined,
  t: number
): number {
  if (!points || points.length === 0) return 1;
  const pts = sortPoints(points);
  if (pts.length === 1) return clamp01(pts[0].v);
  if (t <= pts[0].t) return clamp01(pts[0].v);
  const last = pts[pts.length - 1];
  if (t >= last.t) return clamp01(last.v);

  for (let i = 1; i < pts.length; i++) {
    const b = pts[i];
    if (t <= b.t) {
      const a = pts[i - 1];
      const span = b.t - a.t;
      if (span <= 0) return clamp01(b.v);
      const k = (t - a.t) / span;
      return clamp01(a.v + (b.v - a.v) * k);
    }
  }
  return clamp01(last.v);
}

export function hasAutomation(points: AutomationPoint[] | undefined): boolean {
  return !!points && points.length > 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
