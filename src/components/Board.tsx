import { useStore } from '../store';
import { BrickCard } from './BrickCard';

const CARD_W = 210;

export function Board() {
  const bricks = useStore((s) => s.bricks);
  const addBrick = useStore((s) => s.addBrick);
  const openEditor = useStore((s) => s.openEditor);

  const byId = new Map(bricks.map((b) => [b.id, b]));
  const links = bricks
    .filter((b) => b.parentId && byId.has(b.parentId))
    .map((b) => ({ parent: byId.get(b.parentId!)!, child: b }));

  let maxX = 1200;
  let maxY = 800;
  for (const b of bricks) {
    maxX = Math.max(maxX, b.board.x + CARD_W + 120);
    maxY = Math.max(maxY, b.board.y + 400);
  }

  return (
    <div className="board">
      {bricks.length === 0 && (
        <div className="board-empty">
          <h2>Your corkboard is empty</h2>
          <p>
            Create a <strong>brick</strong> — a small named motif with its own
            piano roll, chords, lyrics and notes. Stack bricks in the mix, then
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

      {links.length > 0 && (
        <svg className="board-links" width={maxX} height={maxY}>
          {links.map(({ parent, child }) => {
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

      {bricks.map((b) => (
        <BrickCard key={b.id} brick={b} />
      ))}
    </div>
  );
}
