import { useState } from 'react';
import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportBrick } from '../lib/midi';
import { MiniRoll } from './MiniRoll';
import type { Brick, BrickDisplay } from '../types';
import { STICKY_COLORS } from '../types';

export function BrickCard({ brick }: { brick: Brick }) {
  const updateBrick = useStore((s) => s.updateBrick);
  const deleteBrick = useStore((s) => s.deleteBrick);
  const duplicateBrick = useStore((s) => s.duplicateBrick);
  const branchBrick = useStore((s) => s.branchBrick);
  const moveBrick = useStore((s) => s.moveBrick);
  const openEditor = useStore((s) => s.openEditor);
  const inMix = useStore((s) => s.mix.some((m) => m.brickId === brick.id));
  const toggleInMix = useStore((s) => s.toggleInMix);

  const [menuOpen, setMenuOpen] = useState(false);
  const d = brick.display;

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

  return (
    <div
      className="brick-card"
      data-brick={brick.id}
      style={{
        left: brick.board.x,
        top: brick.board.y,
        transform: `rotate(${brick.board.rotation}deg)`,
        background: brick.color,
      }}
    >
      <div className="brick-handle" onPointerDown={onHandleDown} title="Drag to move">
        <span className="brick-grip">⠿</span>
        <div className="brick-handle-actions">
          <button className="icon-btn" title="Play" onClick={() => engine.playBrick(brick)}>
            ▶
          </button>
          <button className="icon-btn" title="More" onClick={() => setMenuOpen((v) => !v)}>
            ⋯
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="brick-menu" onMouseLeave={() => setMenuOpen(false)}>
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
          <label className="menu-check">
            <input
              type="checkbox"
              checked={d.showChords}
              onChange={(e) => setDisplay({ showChords: e.target.checked })}
            />
            Chords
          </label>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={d.showLyrics}
              onChange={(e) => setDisplay({ showLyrics: e.target.checked })}
            />
            Lyrics
          </label>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={d.showNotes}
              onChange={(e) => setDisplay({ showNotes: e.target.checked })}
            />
            Description
          </label>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={d.preview}
              onChange={(e) => setDisplay({ preview: e.target.checked })}
            />
            Piano-roll preview
          </label>

          <div className="menu-divider" />
          <button
            onClick={() => {
              const id = branchBrick(brick.id);
              setMenuOpen(false);
              if (id) openEditor(id);
            }}
          >
            🌱 Branch (new iteration)
          </button>
          <button onClick={() => { duplicateBrick(brick.id); setMenuOpen(false); }}>
            Duplicate
          </button>
          <button onClick={() => { exportBrick(brick); setMenuOpen(false); }}>
            Export MIDI
          </button>
          <button className="danger" onClick={() => deleteBrick(brick.id)}>
            Delete
          </button>
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

      <div className="brick-footer">
        <button className="mini-btn" onClick={() => openEditor(brick.id)}>
          Open editor
        </button>
        <label className="mix-toggle">
          <input type="checkbox" checked={inMix} onChange={() => toggleInMix(brick.id)} />
          Mix
        </label>
      </div>
    </div>
  );
}
