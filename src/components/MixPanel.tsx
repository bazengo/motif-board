import { useState } from 'react';
import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportMix } from '../lib/midi';
import { mixAllItems, mixBpm } from '../lib/mix';
import { mixLengthBeats } from '../lib/timeline';
import { InfoTip } from './InfoTip';
import { AutomationEditor } from './AutomationEditor';
import { MIX_COLORS } from '../types';

export function MixPanel() {
  const mixes = useStore((s) => s.mixes);
  const activeMixId = useStore((s) => s.activeMixId);
  const bricks = useStore((s) => s.bricks);
  const globalBpm = useStore((s) => s.globalBpm);
  const setActiveMix = useStore((s) => s.setActiveMix);
  const addMix = useStore((s) => s.addMix);
  const updateMix = useStore((s) => s.updateMix);
  const openEditor = useStore((s) => s.openEditor);
  const [expanded, setExpanded] = useState<string | null>(null);
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
    const items = mixAllItems(mix!, bricks);
    if (items.length) engine.play(items, mixBpm(mix!, globalBpm), mix!.id);
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

      <div className="mix-swatches" title="Mix colour">
        {MIX_COLORS.map((c) => (
          <button
            key={c}
            className={'swatch' + (mix.color === c ? ' on' : '')}
            style={{ background: c }}
            onClick={() => updateMix(mix.id, { color: c })}
            aria-label={`Set mix colour ${c}`}
          />
        ))}
      </div>

      <div className="mix-tempo">
        <label className="tl-check">
          <input
            type="checkbox"
            checked={mix.lockBpm}
            onChange={(e) => updateMix(mix.id, { lockBpm: e.target.checked })}
          />
          Lock to project tempo
        </label>
        <label className="tl-field">
          Mix BPM
          <span className="tl-inline">
            <input
              type="number"
              min={20}
              max={300}
              value={mixBpm(mix, globalBpm)}
              disabled={mix.lockBpm}
              onChange={(e) =>
                updateMix(mix.id, {
                  bpm: Math.max(20, Math.min(300, Number(e.target.value) || 120)),
                })
              }
            />
            <InfoTip label="Mix tempo help">
              Plays member bricks at this rate — their own stored tempos aren't
              changed. New timeline sections inherit this setting.
            </InfoTip>
          </span>
        </label>
      </div>

      {rows.length === 0 && (
        <p className="mix-hint">
          Empty. Add bricks with <em>Mix ▾</em> on a card, or drag a card onto
          this mix's node.
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
                className="tag-btn"
                onClick={() => openEditor(l.brickId)}
                title="Open this brick in the editor"
              >
                ✎
              </button>
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
                className={
                  'tag-btn' + ((l.automation?.length ?? 0) > 0 ? ' on' : '')
                }
                onClick={() =>
                  setExpanded(expanded === l.brickId ? null : l.brickId)
                }
                title="Volume automation over one pass"
              >
                ∿
              </button>
              <button
                className="tag-btn"
                onClick={() => toggleBrickInMix(mix.id, l.brickId)}
                title="Remove from mix"
              >
                ✕
              </button>
            </div>

            {expanded === l.brickId && (
              <AutomationEditor
                points={l.automation ?? []}
                color={brick!.color}
                lengthBeats={mixLengthBeats(mix, bricks)}
                bpm={mixBpm(mix, globalBpm)}
                brick={brick}
                onChange={(pts) =>
                  updateLayer(mix.id, l.brickId, { automation: pts })
                }
              />
            )}
          </div>
        ))}
      </div>

      <label className="side-label">
        Mix notes &amp; #tags
        <InfoTip label="Mix notes and tags">
          Any <strong>#word</strong> here becomes a <strong>tag</strong> shown in
          the tag bar above the board. The mix itself is also a tag, carried by
          every brick in it.
        </InfoTip>
      </label>
      <textarea
        className="mix-notes"
        rows={3}
        placeholder="Arrangement ideas, intent… add #tags to group"
        value={mix.notes}
        onChange={(e) => updateMix(mix.id, { notes: e.target.value })}
      />

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
