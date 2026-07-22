import type { Brick } from '../types';

/** A tiny non-interactive piano-roll thumbnail for a brick card. */
export function MiniRoll({
  brick,
  width = 186,
  height = 52,
  progress = null,
}: {
  brick: Brick;
  width?: number;
  height?: number;
  /** 0..1 through the loop while playing, or null when idle. */
  progress?: number | null;
}) {
  const notes = brick.notes;
  if (notes.length === 0) {
    return <div className="mini-roll empty">no notes yet</div>;
  }
  const playX = progress == null ? null : progress * width;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const n of notes) {
    minP = Math.min(minP, n.pitch);
    maxP = Math.max(maxP, n.pitch);
  }
  const pad = 1;
  minP -= pad;
  maxP += pad;
  const span = Math.max(1, maxP - minP);
  const len = Math.max(brick.lengthBeats, 1);
  const rowH = height / span;

  return (
    <svg className="mini-roll" width={width} height={height}>
      <rect x={0} y={0} width={width} height={height} fill="rgba(0,0,0,0.14)" rx={4} />
      {notes.map((n) => {
        const x = (n.start / len) * width;
        const w = Math.max(2, (n.duration / len) * width);
        const y = height - (n.pitch - minP + 1) * rowH;
        return (
          <rect
            key={n.id}
            x={x}
            y={y}
            width={w}
            height={Math.max(2, rowH - 1)}
            rx={1}
            fill="rgba(0,0,0,0.55)"
          />
        );
      })}
      {playX != null && (
        <line
          x1={playX}
          y1={0}
          x2={playX}
          y2={height}
          stroke="#1c7a4a"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
