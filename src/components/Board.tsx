import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { BrickCard } from './BrickCard';
import { MixNode } from './MixNode';
import { CARD_W, CARD_H, MIX_W, MIX_H } from '../layout';
import { clientToBoard } from '../lib/boardCoords';

export function Board() {
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const linking = useStore((s) => s.linking);
  const addBrick = useStore((s) => s.addBrick);
  const openEditor = useStore((s) => s.openEditor);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Ctrl/⌘ + wheel zooms around the cursor. Registered manually so it can be
  // non-passive and therefore preventDefault the browser's page zoom.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const el2 = boardRef.current!;
      const z = useStore.getState().zoom;
      const r = el2.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const bx = (cx + el2.scrollLeft) / z;
      const by = (cy + el2.scrollTop) / z;
      const nz = Math.max(0.2, Math.min(2, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      useStore.getState().setZoom(nz);
      requestAnimationFrame(() => {
        el2.scrollLeft = bx * nz - cx;
        el2.scrollTop = by * nz - cy;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const byId = new Map(bricks.map((b) => [b.id, b]));
  // the live drag line starts at a brick card, or a mix node when dragging a
  // mix down to the timeline
  const linkFrom = (() => {
    if (!linking) return null;
    if (linking.kind === 'timeline') {
      const m = mixes.find((x) => x.id === linking.sourceId);
      return m ? { x: m.board.x + MIX_W / 2, y: m.board.y + MIX_H / 2 } : null;
    }
    const b = byId.get(linking.sourceId);
    return b ? { x: b.board.x + CARD_W / 2, y: b.board.y + 20 } : null;
  })();

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

  /** Middle-drag anywhere on the board (including over cards) to pan. */
  function onBoardPointerDown(e: React.PointerEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLDivElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = el.scrollLeft;
    const startTop = el.scrollTop;
    el.classList.add('panning');

    const move = (ev: PointerEvent) => {
      el.scrollLeft = startLeft - (ev.clientX - startX);
      el.scrollTop = startTop - (ev.clientY - startY);
    };
    const up = () => {
      el.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onBoardDoubleClick(e: React.MouseEvent) {
    // only empty board space (the scaled canvas is the other valid target)
    const t = e.target as HTMLElement;
    if (!t.classList.contains('board') && !t.classList.contains('board-scaled'))
      return;
    const p = clientToBoard(e.clientX, e.clientY);
    addBrick({
      board: {
        x: Math.max(0, p.x - CARD_W / 2),
        y: Math.max(0, p.y - 10),
        rotation: (Math.random() - 0.5) * 4,
      },
    });
  }

  /** Zoom so everything on the board fits in view. */
  function fitToView() {
    const el = boardRef.current;
    if (!el) return;
    if (bricks.length === 0 && mixes.length === 0) {
      setZoom(1);
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bricks) {
      x0 = Math.min(x0, b.board.x);
      y0 = Math.min(y0, b.board.y);
      x1 = Math.max(x1, b.board.x + CARD_W);
      y1 = Math.max(y1, b.board.y + CARD_H);
    }
    for (const m of mixes) {
      x0 = Math.min(x0, m.board.x);
      y0 = Math.min(y0, m.board.y);
      x1 = Math.max(x1, m.board.x + MIX_W);
      y1 = Math.max(y1, m.board.y + MIX_H);
    }
    const pad = 40;
    const z = Math.max(
      0.2,
      Math.min(
        1,
        el.clientWidth / (x1 - x0 + pad * 2),
        el.clientHeight / (y1 - y0 + pad * 2)
      )
    );
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = (x0 - pad) * z;
      el.scrollTop = (y0 - pad) * z;
    });
  }

  return (
    <div className="board-wrap">
    <div
      className="board"
      ref={boardRef}
      onDoubleClick={onBoardDoubleClick}
      onPointerDown={onBoardPointerDown}
      // suppress Windows' middle-click autoscroll and Linux middle-click paste
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
    >
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

      <div
        className="board-canvas"
        style={{ width: maxX * zoom, height: maxY * zoom }}
      >
      <div
        className="board-scaled"
        style={{
          width: maxX,
          height: maxY,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
      {(lineage.length > 0 || mixEdges.length > 0 || linking) && (
        <svg className="board-links" width={maxX} height={maxY}>
          {linking && linkFrom && (
            <line
              x1={linkFrom.x}
              y1={linkFrom.y}
              x2={linking.x}
              y2={linking.y}
              stroke={
                linking.kind === 'branch'
                  ? '#ffd166'
                  : linking.kind === 'timeline'
                    ? '#95d5b2'
                    : '#7bdff2'
              }
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
      </div>
    </div>

      <div className="zoom-controls">
        <button
          className="zoom-btn"
          onClick={() => setZoom(zoom / 1.15)}
          title="Zoom out"
        >
          −
        </button>
        <button
          className="zoom-level"
          onClick={() => setZoom(1)}
          title="Reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="zoom-btn"
          onClick={() => setZoom(zoom * 1.15)}
          title="Zoom in"
        >
          +
        </button>
        <button className="zoom-btn wide" onClick={fitToView} title="Fit everything in view">
          Fit
        </button>
      </div>
    </div>
  );
}
