import { useRef } from 'react';
import type { Envelope } from '../types';

const W = 288;
const H = 110;
const PAD = 6;
/** Widest attack/decay/release each shown as, in seconds. */
const MAX_STAGE = 2;
/** How much width the (time-less) sustain hold takes up. */
const HOLD_FRAC = 0.22;

type Handle = 'attack' | 'decay' | 'release';

/**
 * Draggable ADSR shape. Attack/decay/release are dragged horizontally (time)
 * and sustain vertically off the decay handle, which is how these read on a
 * hardware envelope.
 */
export function EnvelopeEditor({
  value,
  onChange,
}: {
  value: Envelope;
  onChange: (env: Envelope) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const usable = W - PAD * 2;
  const stageW = (usable * (1 - HOLD_FRAC)) / 3; // a, d, r share the rest
  const holdW = usable * HOLD_FRAC;

  const x0 = PAD;
  const ax = x0 + (value.attack / MAX_STAGE) * stageW;
  const dx = ax + (value.decay / MAX_STAGE) * stageW;
  const sx = dx + holdW;
  const rx = sx + (value.release / MAX_STAGE) * stageW;

  const top = PAD;
  const bottom = H - PAD;
  const sy = bottom - value.sustain * (bottom - top);

  function drag(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const secsFrom = (px: number) =>
        Math.max(0.001, Math.min(MAX_STAGE, (px / stageW) * MAX_STAGE));

      if (handle === 'attack') {
        onChange({ ...value, attack: secsFrom(x - x0) });
      } else if (handle === 'decay') {
        const sustain = Math.max(
          0,
          Math.min(1, (bottom - y) / (bottom - top))
        );
        onChange({ ...value, decay: secsFrom(x - ax), sustain });
      } else {
        onChange({ ...value, release: secsFrom(x - sx) });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const path = `M ${x0} ${bottom} L ${ax} ${top} L ${dx} ${sy} L ${sx} ${sy} L ${rx} ${bottom}`;

  return (
    <div className="env-editor">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="env-svg"
        style={{ touchAction: 'none' }}
      >
        <rect x={0} y={0} width={W} height={H} rx={6} fill="#12151b" />
        {/* sustain level guide */}
        <line x1={PAD} y1={sy} x2={W - PAD} y2={sy} stroke="#2c313d" strokeDasharray="3 3" />
        <path d={`${path} L ${x0} ${bottom} Z`} fill="rgba(255,209,102,0.13)" />
        <path d={path} fill="none" stroke="#ffd166" strokeWidth={2} />

        {(
          [
            ['attack', ax, top],
            ['decay', dx, sy],
            ['release', rx, bottom],
          ] as [Handle, number, number][]
        ).map(([h, hx, hy]) => (
          <circle
            key={h}
            cx={hx}
            cy={hy}
            r={6}
            className="env-handle"
            onPointerDown={(e) => drag(h, e)}
          />
        ))}
      </svg>

      <div className="env-readout">
        <span>A {value.attack.toFixed(2)}s</span>
        <span>D {value.decay.toFixed(2)}s</span>
        <span>S {Math.round(value.sustain * 100)}%</span>
        <span>R {value.release.toFixed(2)}s</span>
      </div>
    </div>
  );
}
