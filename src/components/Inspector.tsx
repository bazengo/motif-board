import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportBrick } from '../lib/midi';
import { MixPanel } from './MixPanel';
import { MiniRoll } from './MiniRoll';
import { INSTRUMENTS } from '../types';

/**
 * The right-hand panel. Shows batch actions for a multi-selection, details for
 * a single selected brick, and otherwise falls back to the mix panel — which
 * is what it always was.
 */
export function Inspector() {
  const selection = useStore((s) => s.selection);
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);

  const count = selection.bricks.length + selection.mixes.length;
  if (count > 1) return <BatchPanel />;
  if (count === 1 && selection.bricks.length === 1) {
    const brick = bricks.find((b) => b.id === selection.bricks[0]);
    if (brick) return <BrickPanel brickId={brick.id} />;
  }
  // a single selected mix just makes that mix active, which MixPanel shows
  void mixes;
  return <MixPanel />;
}

function BatchPanel() {
  const selection = useStore((s) => s.selection);
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const clearSelection = useStore((s) => s.clearSelection);
  const duplicateSelection = useStore((s) => s.duplicateSelection);
  const deleteSelection = useStore((s) => s.deleteSelection);

  const chosenBricks = bricks.filter((b) => selection.bricks.includes(b.id));
  const chosenMixes = mixes.filter((m) => selection.mixes.includes(m.id));
  const noteTotal = chosenBricks.reduce((n, b) => n + b.notes.length, 0);

  return (
    <div className="mix-panel">
      <div className="mix-header">
        <h3>
          {selection.bricks.length + selection.mixes.length} selected
        </h3>
        <button className="ghost-btn" onClick={clearSelection}>
          Clear
        </button>
      </div>

      <p className="mix-hint">
        {chosenBricks.length} card{chosenBricks.length === 1 ? '' : 's'}
        {chosenMixes.length > 0 &&
          ` · ${chosenMixes.length} mix${chosenMixes.length === 1 ? '' : 'es'}`}
        {chosenBricks.length > 0 && ` · ${noteTotal} notes`}
      </p>

      <div className="insp-list">
        {chosenBricks.map((b) => (
          <div className="insp-row" key={b.id}>
            <span className="mix-dot" style={{ background: b.color }} />
            <span className="insp-name">{b.name}</span>
          </div>
        ))}
        {chosenMixes.map((m) => (
          <div className="insp-row" key={m.id}>
            <span className="mix-dot" style={{ background: m.color }} />
            <span className="insp-name">🎚 {m.name}</span>
          </div>
        ))}
      </div>

      <button className="ghost-btn full" onClick={duplicateSelection}>
        ⧉ Duplicate all
      </button>
      <button
        className="ghost-btn full danger-btn"
        onClick={deleteSelection}
        title="Delete everything selected (undo restores it)"
      >
        🗑 Delete all
      </button>
      <p className="mix-hint small">
        Duplicating a mix along with its cards rewires the copy onto the copied
        cards, so it stands alone. Both actions are a single undo step.
      </p>
    </div>
  );
}

function BrickPanel({ brickId }: { brickId: string }) {
  const brick = useStore((s) => s.bricks.find((b) => b.id === brickId));
  const mixes = useStore((s) => s.mixes);
  const openEditor = useStore((s) => s.openEditor);
  const clearSelection = useStore((s) => s.clearSelection);
  const duplicateSelection = useStore((s) => s.duplicateSelection);
  const deleteSelection = useStore((s) => s.deleteSelection);
  if (!brick) return null;

  const memberOf = mixes.filter((m) =>
    m.layers.some((l) => l.brickId === brick.id)
  );
  const instrument = brick.percussion
    ? '🥁 Drums'
    : (INSTRUMENTS.find((i) => i.id === brick.instrument)?.label ??
      brick.instrument);

  return (
    <div className="mix-panel">
      <div className="mix-header">
        <div className="mix-title-row">
          <span className="mix-dot" style={{ background: brick.color }} />
          <strong className="insp-title">{brick.name}</strong>
        </div>
        <div className="mix-actions">
          <button
            className="primary-btn"
            onClick={() => engine.playBrick(brick)}
          >
            ▶
          </button>
          <button className="ghost-btn" onClick={() => engine.stop()}>
            ■
          </button>
        </div>
      </div>

      <dl className="insp-facts">
        <div>
          <dt>Sound</dt>
          <dd>{instrument}</dd>
        </div>
        {!brick.percussion && (
          <div>
            <dt>Key</dt>
            <dd>{brick.key}</dd>
          </div>
        )}
        <div>
          <dt>Tempo</dt>
          <dd>{brick.bpm} BPM</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>
            {brick.timeSig?.num ?? 4}/{brick.timeSig?.den ?? 4}
          </dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{brick.lengthBeats} beats</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{brick.notes.length}</dd>
        </div>
      </dl>

      {brick.notes.length > 0 && (
        <div className="insp-preview">
          <MiniRoll brick={brick} />
        </div>
      )}

      {memberOf.length > 0 && (
        <>
          <label className="side-label">In mixes</label>
          <div className="insp-list">
            {memberOf.map((m) => (
              <div className="insp-row" key={m.id}>
                <span className="mix-dot" style={{ background: m.color }} />
                <span className="insp-name">{m.name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {brick.chords && (
        <>
          <label className="side-label">Chords</label>
          <p className="insp-text">{brick.chords}</p>
        </>
      )}

      <button className="ghost-btn full" onClick={() => openEditor(brick.id)}>
        ✎ Open editor
      </button>
      <button className="ghost-btn full" onClick={duplicateSelection}>
        ⧉ Duplicate
      </button>
      <button className="ghost-btn full" onClick={() => exportBrick(brick)}>
        ⇩ Export MIDI
      </button>
      <button className="ghost-btn full danger-btn" onClick={deleteSelection}>
        🗑 Delete
      </button>
      <button className="ghost-btn full" onClick={clearSelection}>
        Deselect
      </button>
    </div>
  );
}
