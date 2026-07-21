import type { Brick } from '../types';

/** A tiny non-interactive piano-roll thumbnail for a brick card. */
export function MiniRoll({ brick, width = 186, height = 52 }: {
  brick: Brick;
  width?: number;
  height?: number;
}) {
  const notes = brick.notes;
  if (notes.length === 0) {
    return <div className="mini-roll empty">no notes yet</div>;
  }

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
    </svg>
  );
}
