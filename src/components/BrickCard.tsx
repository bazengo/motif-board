import { useState } from 'react';
import { useStore, descendantIds } from '../store';
import { engine } from '../audio/engine';
import { exportBrick } from '../lib/midi';
import { MiniRoll } from './MiniRoll';
import { MIX_W, MIX_H } from '../layout';
import type { Brick, BrickDisplay } from '../types';
import { STICKY_COLORS } from '../types';

export function BrickCard({ brick }: { brick: Brick }) {
  const updateBrick = useStore((s) => s.updateBrick);
  const deleteBrick = useStore((s) => s.deleteBrick);
  const duplicateBrick = useStore((s) => s.duplicateBrick);
  const branchBrick = useStore((s) => s.branchBrick);
  const setParent = useStore((s) => s.setParent);
  const moveBrick = useStore((s) => s.moveBrick);
  const openEditor = useStore((s) => s.openEditor);
  const mixes = useStore((s) => s.mixes);
  const toggleBrickInMix = useStore((s) => s.toggleBrickInMix);

  const [menu, setMenu] = useState<null | 'main' | 'mix' | 'parent'>(null);
  const d = brick.display;
  const memberMixIds = mixes.filter((m) =>
    m.layers.some((l) => l.brickId === brick.id)
  );

  function setDisplay(patch: Partial<BrickDisplay>) {
    updateBrick(brick.id, { display: { ...brick.display, ...patch } });
  }

  function onHandleDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const dx = e.clientX - brick.board.x;
    const dy = e.clientY - brick.board.y;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      moveBrick(brick.id, Math.max(0, ev.clientX - dx), Math.max(0, ev.clientY - dy));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Dedicated "drag to a mix" handle: draws a live line to the cursor and
  // connects to whatever mix node it's dropped on. Doesn't move the card.
  function onLinkDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const board = document.querySelector('.board') as HTMLElement | null;
    const toContent = (ev: PointerEvent | React.PointerEvent) => {
      const r = board!.getBoundingClientRect();
      return {
        x: ev.clientX - r.left + board!.scrollLeft,
        y: ev.clientY - r.top + board!.scrollTop,
      };
    };
    const { setLinking, toggleBrickInMix: join } = useStore.getState();
    const p0 = toContent(e);
    setLinking({ brickId: brick.id, x: p0.x, y: p0.y });
    const move = (ev: PointerEvent) => {
      const p = toContent(ev);
      setLinking({ brickId: brick.id, x: p.x, y: p.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const p = toContent(ev);
      const { mixes: mxs } = useStore.getState();
      for (const m of mxs) {
        if (
          p.x >= m.board.x &&
          p.x <= m.board.x + MIX_W &&
          p.y >= m.board.y &&
          p.y <= m.board.y + MIX_H
        ) {
          if (!m.layers.some((l) => l.brickId === brick.id)) join(m.id, brick.id);
          break;
        }
      }
      useStore.getState().setLinking(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
      className="brick-card"
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
            onPointerDown={onLinkDown}
          >
            ⇢
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
          <div className="menu-section">Lineage parent</div>
          <button onClick={() => { setParent(brick.id, null); setMenu(null); }}>
            ⛌ Orphan (make root)
          </button>
          <div className="menu-divider" />
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
      {d.showNotes && brick.processNotes && (
        <div className="brick-desc">{brick.processNotes}</div>
      )}
      {d.preview && (
        <div className="brick-preview">
          <MiniRoll brick={brick} />
        </div>
      )}

      {memberMixIds.length > 0 && (
        <div className="brick-mixtags">
          {memberMixIds.map((m) => (
            <span key={m.id} className="brick-mixtag" style={{ background: m.color }}>
              {m.name}
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
