import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportMix } from '../lib/midi';

export function MixPanel() {
  const bricks = useStore((s) => s.bricks);
  const mix = useStore((s) => s.mix);
  const globalBpm = useStore((s) => s.globalBpm);
  const updateLayer = useStore((s) => s.updateLayer);
  const toggleInMix = useStore((s) => s.toggleInMix);

  const layers = mix
    .map((m) => ({ layer: m, brick: bricks.find((b) => b.id === m.brickId) }))
    .filter((x) => x.brick);

  const anySolo = layers.some((x) => x.layer.solo);

  function playItems() {
    return layers
      .filter((x) => !x.layer.mute && (!anySolo || x.layer.solo))
      .map((x) => ({
        brick: x.brick!,
        loop: x.layer.loop,
        gain: x.layer.gain,
      }));
  }

  function playMix() {
    const items = playItems();
    if (items.length) engine.play(items, globalBpm);
  }

  return (
    <div className="mix-panel">
      <div className="mix-header">
        <h3>Mix</h3>
        <div className="mix-actions">
          <button className="primary-btn" onClick={playMix} disabled={layers.length === 0}>
            ▶ Play together
          </button>
          <button className="ghost-btn" onClick={() => engine.stop()}>
            ■ Stop
          </button>
        </div>
      </div>

      {layers.length === 0 && (
        <p className="mix-hint">
          Tick <em>Mix</em> on any brick to stack it here. Layers play together
          at the project tempo ({globalBpm} BPM).
        </p>
      )}

      <div className="mix-layers">
        {layers.map(({ layer, brick }) => (
          <div className="mix-layer" key={layer.brickId}>
            <span className="mix-dot" style={{ background: brick!.color }} />
            <span className="mix-name" title={brick!.name}>
              {brick!.name}
            </span>
            <div className="mix-buttons">
              <button
                className={'tag-btn' + (layer.loop ? ' on' : '')}
                onClick={() => updateLayer(layer.brickId, { loop: !layer.loop })}
                title="Loop"
              >
                ↻
              </button>
              <button
                className={'tag-btn' + (layer.mute ? ' on' : '')}
                onClick={() => updateLayer(layer.brickId, { mute: !layer.mute })}
                title="Mute"
              >
                M
              </button>
              <button
                className={'tag-btn' + (layer.solo ? ' on' : '')}
                onClick={() => updateLayer(layer.brickId, { solo: !layer.solo })}
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
                value={layer.gain}
                onChange={(e) =>
                  updateLayer(layer.brickId, { gain: Number(e.target.value) })
                }
                title="Volume"
              />
              <button
                className="tag-btn"
                onClick={() => toggleInMix(layer.brickId)}
                title="Remove from mix"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {layers.length > 0 && (
        <button
          className="ghost-btn full"
          onClick={() =>
            exportMix(
              layers.map((x) => x.brick!),
              globalBpm
            )
          }
        >
          ⇩ Export mix as MIDI
        </button>
      )}
    </div>
  );
}
