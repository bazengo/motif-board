import { describe, it, expect } from 'vitest';
import { evaluateAutomation, hasAutomation, sortPoints } from '../automation';

describe('evaluateAutomation', () => {
  it('is unity when there is no envelope', () => {
    expect(evaluateAutomation(undefined, 0.5)).toBe(1);
    expect(evaluateAutomation([], 0.5)).toBe(1);
  });

  it('holds flat for a single point', () => {
    const pts = [{ t: 0.5, v: 0.4 }];
    expect(evaluateAutomation(pts, 0)).toBeCloseTo(0.4);
    expect(evaluateAutomation(pts, 1)).toBeCloseTo(0.4);
  });

  it('interpolates linearly between points', () => {
    const pts = [
      { t: 0, v: 0 },
      { t: 1, v: 1 },
    ];
    expect(evaluateAutomation(pts, 0.25)).toBeCloseTo(0.25);
    expect(evaluateAutomation(pts, 0.5)).toBeCloseTo(0.5);
  });

  it('holds flat outside the first and last points', () => {
    const pts = [
      { t: 0.25, v: 0.2 },
      { t: 0.75, v: 0.8 },
    ];
    expect(evaluateAutomation(pts, 0)).toBeCloseTo(0.2);
    expect(evaluateAutomation(pts, 1)).toBeCloseTo(0.8);
  });

  it('works regardless of the order points were added', () => {
    const pts = [
      { t: 1, v: 1 },
      { t: 0, v: 0 },
    ];
    expect(evaluateAutomation(pts, 0.5)).toBeCloseTo(0.5);
  });

  it('handles two points at the same position without dividing by zero', () => {
    const pts = [
      { t: 0.5, v: 0.2 },
      { t: 0.5, v: 0.9 },
    ];
    expect(Number.isFinite(evaluateAutomation(pts, 0.5))).toBe(true);
  });

  it('clamps values into 0..1', () => {
    expect(evaluateAutomation([{ t: 0, v: 5 }], 0.5)).toBe(1);
    expect(evaluateAutomation([{ t: 0, v: -3 }], 0.5)).toBe(0);
  });

  it('models a fade-out across the pass', () => {
    const fade = [
      { t: 0, v: 1 },
      { t: 1, v: 0 },
    ];
    expect(evaluateAutomation(fade, 0)).toBeCloseTo(1);
    expect(evaluateAutomation(fade, 0.5)).toBeCloseTo(0.5);
    expect(evaluateAutomation(fade, 1)).toBeCloseTo(0);
  });
});

describe('helpers', () => {
  it('sortPoints orders by position without mutating the input', () => {
    const pts = [
      { t: 0.9, v: 1 },
      { t: 0.1, v: 0 },
    ];
    expect(sortPoints(pts).map((p) => p.t)).toEqual([0.1, 0.9]);
    expect(pts[0].t).toBe(0.9);
  });

  it('hasAutomation only counts a non-empty envelope', () => {
    expect(hasAutomation(undefined)).toBe(false);
    expect(hasAutomation([])).toBe(false);
    expect(hasAutomation([{ t: 0, v: 1 }])).toBe(true);
  });
});
