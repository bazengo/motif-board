import { useState } from 'react';
import { useStore, descendantIds } from '../store';
import { engine } from '../audio/engine';
import { exportBrick } from '../lib/midi';
import { MiniRoll } from './MiniRoll';
import { CARD_W, CARD_H, MIX_W, MIX_H } from '../layout';
import { tagsForBrick, matchesTags, stripHashtags } from '../lib/tags';
import { clientToBoard } from '../lib/boardCoords';
import type { Brick, BrickDisplay } from '../types';
import { STICKY_COLORS } from '../types';

export function BrickCard({ brick }: { brick: Brick }) {
  const updateBrick = useStore((s) => s.updateBrick);
  const deleteBrick = useStore((s) => s.deleteBrick);
  const duplicateBrick = useStore((s) => s.duplicateBrick);
  const branchBrick = useStore((s) => s.branchBrick);
  const setParent = useStore((s) => s.setParent);
  const releaseChildren = useStore((s) => s.releaseChildren);
  const childCount = useStore(
    (s) => s.bricks.filter((b) => b.parentId === brick.id).length
  );
  const moveBrick = useStore((s) => s.moveBrick);
  const openEditor = useStore((s) => s.openEditor);
  const mixes = useStore((s) => s.mixes);
  const toggleBrickInMix = useStore((s) => s.toggleBrickInMix);

  const activeTags = useStore((s) => s.activeTags);
  const [menu, setMenu] = useState<null | 'main' | 'mix' | 'parent'>(null);
  const d = brick.display;
  const myTags = tagsForBrick(brick, mixes);
  const matches = matchesTags(myTags, activeTags);
  const filtering = activeTags.length > 0;

  function setDisplay(patch: Partial<BrickDisplay>) {
    updateBrick(brick.id, { display: { ...brick.display, ...patch } });
  }

  function onHandleDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    // work in board space so dragging tracks the cursor at any zoom
    const p0 = clientToBoard(e.clientX, e.clientY);
    const offX = p0.x - brick.board.x;
    const offY = p0.y - brick.board.y;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = clientToBoard(ev.clientX, ev.clientY);
      moveBrick(brick.id, Math.max(0, p.x - offX), Math.max(0, p.y - offY));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Dedicated drag handles that draw a live line to the cursor without moving
  // the card. 'mix' drops onto a mix node to join it; 'branch' spawns a child
  // iteration where you drop it (or adopts the brick you drop it on).
  function startLink(e: React.PointerEvent, kind: 'mix' | 'branch') {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const toContent = (ev: PointerEvent | React.PointerEvent) =>
      clientToBoard(ev.clientX, ev.clientY);
    const { setLinking } = useStore.getState();
    const p0 = toContent(e);
    setLinking({ sourceId: brick.id, x: p0.x, y: p0.y, kind });
    const move = (ev: PointerEvent) => {
      const p = toContent(ev);
      setLinking({ sourceId: brick.id, x: p.x, y: p.y, kind });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
    // never leave a dangling live line if the drag is interrupted
    function cancel() {
      cleanup();
      useStore.getState().setLinking(null);
    }
    const up = (ev: PointerEvent) => {
      cleanup();
      const p = toContent(ev);
      const st = useStore.getState();

      if (kind === 'mix') {
        for (const m of st.mixes) {
          if (
            p.x >= m.board.x &&
            p.x <= m.board.x + MIX_W &&
            p.y >= m.board.y &&
            p.y <= m.board.y + MIX_H
          ) {
            if (!m.layers.some((l) => l.brickId === brick.id))
              st.toggleBrickInMix(m.id, brick.id);
            break;
          }
        }
      } else {
        // dropped on another brick? adopt it as a child (cycle-guarded by
        // setParent). Otherwise spawn a fresh iteration at the drop point.
        const desc = descendantIds(st.bricks, brick.id);
        const target = st.bricks.find(
          (b) =>
            b.id !== brick.id &&
            !desc.has(b.id) &&
            p.x >= b.board.x &&
            p.x <= b.board.x + CARD_W &&
            p.y >= b.board.y &&
            p.y <= b.board.y + CARD_H
        );
        if (target) {
          st.setParent(target.id, brick.id);
        } else {
          const childId = st.branchBrick(brick.id);
          if (childId) {
            st.moveBrick(
              childId,
              Math.max(0, p.x - CARD_W / 2),
              Math.max(0, p.y - 10)
            );
          }
        }
      }
      useStore.getState().setLinking(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
  }

  // eligible new parents: not self, not a descendant (avoid cycles)
  const descendants = descendantIds(useStore.getState().bricks, brick.id);
  const parentCandidates = useStore
    .getState()
    .bricks.filter((b) => b.id !== brick.id && !descendants.has(b.id));

  // Un-rotate menus so they read vertically even on a tilted card.
  const menuStyle: React.CSSProperties = {
    transform: `rotate(${-brick.board.rotation}deg)`,
    transformOrigin: 'top right',
  };

  return (
    <div
      className={
        'brick-card' +
        (filtering ? (matches ? ' tag-match' : ' tag-dim') : '')
      }
      data-brick={brick.id}
      style={{
        left: brick.board.x,
        top: brick.board.y,
        transform: `rotate(${brick.board.rotation}deg)`,
        background: brick.color,
        zIndex: menu ? 30 : undefined,
      }}
    >
      <div className="brick-handle" onPointerDown={onHandleDown} title="Drag to move">
        <span className="brick-grip">⠿</span>
        <div className="brick-handle-actions">
          <button
            className="icon-btn link-handle"
            title="Drag onto a mix node to add this brick"
            onPointerDown={(e) => startLink(e, 'mix')}
          >
            ⇢
          </button>
          <button
            className="icon-btn branch-handle"
            title="Drag to empty space to spawn an iteration — or onto another brick to adopt it as a child"
            onPointerDown={(e) => startLink(e, 'branch')}
          >
            🌱
          </button>
          <button
            className="icon-btn"
            title="Play"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => engine.playBrick(brick)}
          >
            ▶
          </button>
          <button
            className="icon-btn"
            title="More"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenu((v) => (v ? null : 'main'))}
          >
            ⋯
          </button>
        </div>
      </div>

      {menu === 'main' && (
        <div className="brick-menu" style={menuStyle} onMouseLeave={() => setMenu(null)}>
          <div className="swatch-row">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => updateBrick(brick.id, { color: c })}
              />
            ))}
          </div>

          <div className="menu-section">Card shows</div>
          {(
            [
              ['showChords', 'Chords'],
              ['showLyrics', 'Lyrics'],
              ['showNotes', 'Description'],
              ['preview', 'Piano-roll preview'],
            ] as [keyof BrickDisplay, string][]
          ).map(([key, label]) => (
            <label className="menu-check" key={key}>
              <input
                type="checkbox"
                checked={d[key]}
                onChange={(e) => setDisplay({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}

          <div className="menu-divider" />
          <button onClick={() => setMenu('mix')}>➕ Add to mix ▸</button>
          <button onClick={() => setMenu('parent')}>🌱 Lineage ▸</button>
          <button
            onClick={() => {
              const id = branchBrick(brick.id);
              setMenu(null);
              if (id) openEditor(id);
            }}
          >
            Branch (new iteration)
          </button>
          <button onClick={() => { duplicateBrick(brick.id); setMenu(null); }}>
            Duplicate
          </button>
          <button onClick={() => { exportBrick(brick); setMenu(null); }}>
            Export MIDI
          </button>
          <button className="danger" onClick={() => deleteBrick(brick.id)}>
            Delete
          </button>
        </div>
      )}

      {menu === 'mix' && (
        <div className="brick-menu" style={menuStyle} onMouseLeave={() => setMenu(null)}>
          <div className="menu-section">Add to mix</div>
          {mixes.length === 0 && <div className="menu-empty">No mixes yet — make one on the board.</div>}
          {mixes.map((m) => (
            <label className="menu-check" key={m.id}>
              <input
                type="checkbox"
                checked={m.layers.some((l) => l.brickId === brick.id)}
                onChange={() => toggleBrickInMix(m.id, brick.id)}
              />
              <span className="mix-swatch" style={{ background: m.color }} />
              {m.name}
            </label>
          ))}
          <div className="menu-divider" />
          <button onClick={() => setMenu('main')}>‹ Back</button>
        </div>
      )}

      {menu === 'parent' && (
        <div className="brick-menu" style={menuStyle} onMouseLeave={() => setMenu(null)}>
          <div className="menu-section">Lineage</div>
          <button
            disabled={!brick.parentId}
            onClick={() => { setParent(brick.id, null); setMenu(null); }}
          >
            ⛌ Detach from parent
          </button>
          <button
            disabled={childCount === 0}
            onClick={() => { releaseChildren(brick.id); setMenu(null); }}
          >
            ⛌ Release {childCount} child{childCount === 1 ? '' : 'ren'}
          </button>
          <div className="menu-divider" />
          <div className="menu-section">Set parent to</div>
          <div className="menu-scroll">
            {parentCandidates.length === 0 && <div className="menu-empty">No other bricks.</div>}
            {parentCandidates.map((b) => (
              <button
                key={b.id}
                className={brick.parentId === b.id ? 'on' : ''}
                onClick={() => { setParent(brick.id, b.id); setMenu(null); }}
              >
                {brick.parentId === b.id ? '● ' : ''}{b.name}
              </button>
            ))}
          </div>
          <div className="menu-divider" />
          <button onClick={() => setMenu('main')}>‹ Back</button>
        </div>
      )}

      <input
        className="brick-title"
        value={brick.name}
        onChange={(e) => updateBrick(brick.id, { name: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <div className="brick-meta">
        {brick.key} · {brick.bpm} BPM · {brick.notes.length} notes
        {brick.parentId && <span className="brick-branch" title="Iteration"> · 🌱</span>}
      </div>

      {d.showChords && brick.chords && <div className="brick-chords">{brick.chords}</div>}
      {d.showLyrics && brick.lyrics && (
        <div className="brick-lyrics">{brick.lyrics.split('\n')[0]}</div>
      )}
      {d.showNotes && stripHashtags(brick.processNotes) && (
        <div className="brick-desc">{stripHashtags(brick.processNotes)}</div>
      )}
      {d.preview && (
        <div className="brick-preview">
          <MiniRoll brick={brick} />
        </div>
      )}

      {myTags.length > 0 && (
        <div className="brick-mixtags">
          {myTags.map((t) => (
            <span
              key={t.id}
              className={'brick-mixtag' + (t.kind === 'text' ? ' text-tag' : '')}
              style={
                t.kind === 'mix'
                  ? { background: t.color }
                  : { borderColor: t.color, color: t.color }
              }
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      <div className="brick-footer">
        <button className="mini-btn" onClick={() => openEditor(brick.id)}>
          Open editor
        </button>
        <button className="mini-btn" onClick={() => setMenu('mix')}>
          Mix ▾
        </button>
      </div>
    </div>
  );
}
