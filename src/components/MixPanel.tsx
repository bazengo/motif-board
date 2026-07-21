import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportMix } from '../lib/midi';
import { mixPlayItems } from '../lib/mix';

export function MixPanel() {
  const mixes = useStore((s) => s.mixes);
  const activeMixId = useStore((s) => s.activeMixId);
  const bricks = useStore((s) => s.bricks);
  const globalBpm = useStore((s) => s.globalBpm);
  const setActiveMix = useStore((s) => s.setActiveMix);
  const addMix = useStore((s) => s.addMix);
  const updateLayer = useStore((s) => s.updateLayer);
  const toggleBrickInMix = useStore((s) => s.toggleBrickInMix);

  const mix = mixes.find((m) => m.id === activeMixId) ?? mixes[0];

  if (!mix) {
    return (
      <div className="mix-panel">
        <div className="mix-header">
          <h3>Mixes</h3>
          <button className="primary-btn" onClick={() => addMix()}>
            + New mix
          </button>
        </div>
        <p className="mix-hint">
          A <strong>mix</strong> is a named node on the board that stacks bricks
          to play together. Create one, then add bricks by ticking them (Mix ▾
          on a card) or dragging a card onto the mix node.
        </p>
      </div>
    );
  }

  const rows = mix.layers
    .map((l) => ({ l, brick: bricks.find((b) => b.id === l.brickId) }))
    .filter((x) => x.brick);

  function playMix() {
    const items = mixPlayItems(mix!, bricks);
    if (items.length) engine.play(items, globalBpm);
  }

  return (
    <div className="mix-panel">
      <div className="mix-header">
        <div className="mix-title-row">
          <span className="mix-dot" style={{ background: mix.color }} />
          <select
            className="mix-select"
            value={mix.id}
            onChange={(e) => setActiveMix(e.target.value)}
          >
            {mixes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button className="mini-btn" onClick={() => addMix()} title="New mix">
            +
          </button>
        </div>
        <div className="mix-actions">
          <button className="primary-btn" onClick={playMix} disabled={rows.length === 0}>
            ▶ Play
          </button>
          <button className="ghost-btn" onClick={() => engine.stop()}>
            ■
          </button>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="mix-hint">
          Empty. Add bricks with <em>Mix ▾</em> on a card, or drag a card onto
          this mix's node. Plays at the project tempo ({globalBpm} BPM).
        </p>
      )}

      <div className="mix-layers">
        {rows.map(({ l, brick }) => (
          <div className="mix-layer" key={l.brickId}>
            <span className="mix-dot" style={{ background: brick!.color }} />
            <span className="mix-name" title={brick!.name}>
              {brick!.name}
            </span>
            <div className="mix-buttons">
              <button
                className={'tag-btn' + (l.loop ? ' on' : '')}
                onClick={() => updateLayer(mix.id, l.brickId, { loop: !l.loop })}
                title="Loop"
              >
                ↻
              </button>
              <button
                className={'tag-btn' + (l.mute ? ' on' : '')}
                onClick={() => updateLayer(mix.id, l.brickId, { mute: !l.mute })}
                title="Mute"
              >
                M
              </button>
              <button
                className={'tag-btn' + (l.solo ? ' on' : '')}
                onClick={() => updateLayer(mix.id, l.brickId, { solo: !l.solo })}
                title="Solo"
              >
                S
              </button>
              <input
                className="mix-gain"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={l.gain}
                onChange={(e) =>
                  updateLayer(mix.id, l.brickId, { gain: Number(e.target.value) })
                }
                title="Volume"
              />
              <button
                className="tag-btn"
                onClick={() => toggleBrickInMix(mix.id, l.brickId)}
                title="Remove from mix"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <button
          className="ghost-btn full"
          onClick={() =>
            exportMix(
              rows.map((x) => x.brick!),
              globalBpm,
              `${mix.name.replace(/[^a-z0-9-_]+/gi, '_') || 'mix'}.mid`
            )
          }
        >
          ⇩ Export this mix as MIDI
        </button>
      )}
    </div>
  );
}
