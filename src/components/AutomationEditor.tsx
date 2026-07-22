import { useRef } from 'react';
import { sortPoints } from '../lib/automation';
import type { AutomationPoint } from '../types';

const W = 268;
const H = 74;
const PAD = 8;

/**
 * Linear volume envelope over one pass of the mix. Click the lane to add a
 * breakpoint, drag to move, double-click a point to remove it.
 */
export function AutomationEditor({
  points,
  color,
  onChange,
}: {
  points: AutomationPoint[];
  color: string;
  onChange: (pts: AutomationPoint[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pts = sortPoints(points);

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
    // only the empty lane adds — points handle their own drags
    if ((e.target as Element).classList.contains('auto-point')) return;
    const p = fromEvent(e.clientX, e.clientY);
    onChange(sortPoints([...pts, p]));
  }

  function dragPoint(e: React.PointerEvent, index: number) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const move = (ev: PointerEvent) => {
      const p = fromEvent(ev.clientX, ev.clientY);
      const next = pts.map((old, i) => (i === index ? p : old));
      onChange(sortPoints(next));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // flat line at full level when there's nothing to draw yet
  const shape =
    pts.length === 0
      ? `M ${px(0)} ${py(1)} L ${px(1)} ${py(1)}`
      : [
          `M ${px(0)} ${py(pts[0].v)}`,
          ...pts.map((p) => `L ${px(p.t)} ${py(p.v)}`),
          `L ${px(1)} ${py(pts[pts.length - 1].v)}`,
        ].join(' ');

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
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={PAD}
            y1={py(g)}
            x2={W - PAD}
            y2={py(g)}
            stroke="#232936"
          />
        ))}
        <path d={`${shape} L ${px(1)} ${py(0)} L ${px(0)} ${py(0)} Z`} fill={color} opacity={0.14} />
        <path d={shape} fill="none" stroke={color} strokeWidth={2} />
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
        <span>
          {pts.length === 0
            ? 'click to add a point'
            : `${pts.length} point${pts.length === 1 ? '' : 's'} · double-click to remove`}
        </span>
        {pts.length > 0 && (
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
