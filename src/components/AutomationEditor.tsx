import { useRef, useState } from 'react';
import { sortPoints } from '../lib/automation';
import type { AutomationPoint, Brick } from '../types';

const W = 268;
const H = 74;
const PAD = 8;

/**
 * Linear volume envelope over one pass of the mix. Click the lane to add a
 * breakpoint, drag to move, double-click a point to remove it. Hold shift
 * while dragging to match the previous point's level, which is how you get a
 * flat hold before a ramp.
 */
export function AutomationEditor({
  points,
  color,
  lengthBeats,
  bpm,
  brick,
  onChange,
}: {
  points: AutomationPoint[];
  color: string;
  lengthBeats: number;
  bpm: number;
  /** The layer's brick, drawn faintly behind the envelope for reference. */
  brick?: Brick;
  onChange: (pts: AutomationPoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const latest = useRef<AutomationPoint[]>(points);
  const [drag, setDrag] = useState<{ t: number; v: number; snapped: boolean } | null>(
    null
  );
  const pts = points;

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const px = (t: number) => PAD + t * innerW;
  const py = (v: number) => PAD + (1 - v) * innerH;

  const fromEvent = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      t: clamp01((clientX - r.left - PAD) / innerW),
      v: clamp01(1 - (clientY - r.top - PAD) / innerH),
    };
  };

  function addPoint(e: React.PointerEvent) {
    if ((e.target as Element).classList.contains('auto-point')) return;
    const p = fromEvent(e.clientX, e.clientY);
    onChange(sortPoints([...pts, p]));
  }

  function dragPoint(e: React.PointerEvent, index: number) {
    e.stopPropagation();
    if (e.button !== 0) return;
    // Snapshot and keep the array order for the duration of the drag. Re-sorting
    // mid-drag would renumber the points and hand us a different one to hold.
    const base = sortPoints(pts);
    latest.current = base;

    const move = (ev: PointerEvent) => {
      const p = fromEvent(ev.clientX, ev.clientY);
      let v = p.v;
      let snapped = false;
      if (ev.shiftKey) {
        // match the nearest point to our left, giving a flat segment
        let prev: AutomationPoint | null = null;
        base.forEach((q, i) => {
          if (i === index || q.t > p.t) return;
          if (!prev || q.t > prev.t) prev = q;
        });
        if (prev) {
          v = (prev as AutomationPoint).v;
          snapped = true;
        }
      }
      const next = base.map((old, i) => (i === index ? { t: p.t, v } : old));
      latest.current = next;
      onChange(next);
      setDrag({ t: p.t, v, snapped });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onChange(sortPoints(latest.current));
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const sorted = sortPoints(pts);
  const shape =
    sorted.length === 0
      ? `M ${px(0)} ${py(1)} L ${px(1)} ${py(1)}`
      : [
          `M ${px(0)} ${py(sorted[0].v)}`,
          ...sorted.map((p) => `L ${px(p.t)} ${py(p.v)}`),
          `L ${px(1)} ${py(sorted[sorted.length - 1].v)}`,
        ].join(' ');

  const secPerBeat = 60 / (bpm > 0 ? bpm : 120);

  return (
    <div className="auto-editor">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="auto-svg"
        style={{ touchAction: 'none' }}
        onPointerDown={addPoint}
      >
        <rect x={0} y={0} width={W} height={H} rx={6} fill="#12151b" />

        {/* faint piano-roll of the layer's own notes, so the envelope can be
            drawn against what actually plays */}
        {brick && brick.notes.length > 0 && (() => {
          const pitches = brick.notes.map((n) => n.pitch);
          let lo = Math.min(...pitches);
          let hi = Math.max(...pitches);
          const span = Math.max(6, hi - lo + 2);
          lo -= 1;
          const noteLen = brick.lengthBeats > 0 ? brick.lengthBeats : 1;
          return brick.notes.map((n) => {
            const x = PAD + (n.start / noteLen) * innerW;
            const w = Math.max(1, (n.duration / noteLen) * innerW);
            const y = PAD + (1 - (n.pitch - lo) / span) * innerH;
            return (
              <rect
                key={n.id}
                x={x}
                y={y}
                width={w}
                height={Math.max(1.5, innerH / span - 0.5)}
                fill={color}
                opacity={0.22}
              />
            );
          });
        })()}

        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={PAD} y1={py(g)} x2={W - PAD} y2={py(g)} stroke="#232936" opacity={0.6} />
        ))}
        <path
          d={`${shape} L ${px(1)} ${py(0)} L ${px(0)} ${py(0)} Z`}
          fill={color}
          opacity={0.14}
        />
        <path d={shape} fill="none" stroke={color} strokeWidth={2} />

        {/* guide line at the position being dragged */}
        {drag && (
          <line
            x1={px(drag.t)}
            y1={PAD}
            x2={px(drag.t)}
            y2={H - PAD}
            stroke={drag.snapped ? '#5ef2a0' : '#6a7385'}
            strokeDasharray="3 3"
          />
        )}

        {pts.map((p, i) => (
          <circle
            key={i}
            className="auto-point"
            cx={px(p.t)}
            cy={py(p.v)}
            r={5}
            fill={color}
            onPointerDown={(e) => dragPoint(e, i)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onChange(pts.filter((_, k) => k !== i));
            }}
          />
        ))}
      </svg>

      <div className="auto-foot">
        {drag ? (
          <span className="auto-readout">
            beat {(drag.t * lengthBeats).toFixed(2)} ·{' '}
            {(drag.t * lengthBeats * secPerBeat).toFixed(2)}s ·{' '}
            {Math.round(drag.v * 100)}%
            {drag.snapped && <strong> held</strong>}
          </span>
        ) : (
          <span>
            {pts.length === 0
              ? 'click to add a point · shift-drag to hold the previous level'
              : `${pts.length} point${pts.length === 1 ? '' : 's'} · double-click to remove`}
          </span>
        )}
        {pts.length > 0 && !drag && (
          <button className="tag-btn" onClick={() => onChange([])} title="Clear">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
