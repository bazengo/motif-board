import { useStore } from '../store';
import { BrickCard } from './BrickCard';
import { MixNode } from './MixNode';
import { CARD_W, MIX_W, MIX_H } from '../layout';

export function Board() {
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const linking = useStore((s) => s.linking);
  const addBrick = useStore((s) => s.addBrick);
  const openEditor = useStore((s) => s.openEditor);

  const byId = new Map(bricks.map((b) => [b.id, b]));
  const linkingBrick = linking ? byId.get(linking.brickId) : undefined;

  // lineage edges (dashed) — parent -> child
  const lineage = bricks
    .filter((b) => b.parentId && byId.has(b.parentId))
    .map((b) => ({ parent: byId.get(b.parentId!)!, child: b }));

  // mix-membership edges (solid, mix-coloured) — brick -> mix node
  const mixEdges = mixes.flatMap((m) =>
    m.layers
      .map((l) => byId.get(l.brickId))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ brick: b, mix: m }))
  );

  let maxX = 1200;
  let maxY = 800;
  for (const b of bricks) {
    maxX = Math.max(maxX, b.board.x + CARD_W + 120);
    maxY = Math.max(maxY, b.board.y + 400);
  }
  for (const m of mixes) {
    maxX = Math.max(maxX, m.board.x + MIX_W + 120);
    maxY = Math.max(maxY, m.board.y + MIX_H + 120);
  }
  if (linking) {
    maxX = Math.max(maxX, linking.x + 40);
    maxY = Math.max(maxY, linking.y + 40);
  }

  const empty = bricks.length === 0 && mixes.length === 0;

  return (
    <div className="board">
      {empty && (
        <div className="board-empty">
          <h2>Your corkboard is empty</h2>
          <p>
            Create a <strong>brick</strong> — a small named motif with its own
            piano roll, chords, lyrics and notes. Stack bricks in a mix, then
            export MIDI to build full pieces elsewhere.
          </p>
          <button
            className="primary-btn"
            onClick={() => {
              const id = addBrick();
              openEditor(id);
            }}
          >
            + New brick
          </button>
        </div>
      )}

      {(lineage.length > 0 || mixEdges.length > 0 || linking) && (
        <svg className="board-links" width={maxX} height={maxY}>
          {linking && linkingBrick && (
            <line
              x1={linkingBrick.board.x + CARD_W / 2}
              y1={linkingBrick.board.y + 20}
              x2={linking.x}
              y2={linking.y}
              stroke="#7bdff2"
              strokeWidth={2.5}
              strokeDasharray="6 4"
            />
          )}
          {mixEdges.map(({ brick, mix }) => {
            const bx = brick.board.x + CARD_W / 2;
            const by = brick.board.y + 20;
            const mx = mix.board.x + MIX_W / 2;
            const my = mix.board.y + MIX_H / 2;
            const midX = (bx + mx) / 2;
            return (
              <path
                key={`${mix.id}-${brick.id}`}
                d={`M ${bx} ${by} C ${midX} ${by}, ${midX} ${my}, ${mx} ${my}`}
                fill="none"
                stroke={mix.color}
                strokeWidth={2}
                opacity={0.75}
              />
            );
          })}
          {lineage.map(({ parent, child }) => {
            const px = parent.board.x + CARD_W / 2;
            const py = parent.board.y + 60;
            const cx = child.board.x + CARD_W / 2;
            const cy = child.board.y + 6;
            const midY = (py + cy) / 2;
            return (
              <path
                key={child.id}
                d={`M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`}
                fill="none"
                stroke="rgba(255,209,102,0.55)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            );
          })}
        </svg>
      )}

      {mixes.map((m) => (
        <MixNode key={m.id} mix={m} />
      ))}
      {bricks.map((b) => (
        <BrickCard key={b.id} brick={b} />
      ))}
    </div>
  );
}
