import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportMix } from '../lib/midi';
import { mixPlayItems } from '../lib/mix';
import { MIX_W } from '../layout';
import type { Mix } from '../types';

export function MixNode({ mix }: { mix: Mix }) {
  const bricks = useStore((s) => s.bricks);
  const globalBpm = useStore((s) => s.globalBpm);
  const active = useStore((s) => s.activeMixId === mix.id);
  const setActiveMix = useStore((s) => s.setActiveMix);
  const moveMix = useStore((s) => s.moveMix);
  const updateMix = useStore((s) => s.updateMix);
  const deleteMix = useStore((s) => s.deleteMix);

  const members = mix.layers.length;

  function onHandleDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setActiveMix(mix.id);
    const dx = e.clientX - mix.board.x;
    const dy = e.clientY - mix.board.y;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      moveMix(mix.id, Math.max(0, ev.clientX - dx), Math.max(0, ev.clientY - dy));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function play() {
    const items = mixPlayItems(mix, bricks);
    if (items.length) engine.play(items, globalBpm);
  }

  return (
    <div
      className={'mix-node' + (active ? ' active' : '')}
      style={{ left: mix.board.x, top: mix.board.y, width: MIX_W, borderColor: mix.color }}
      onPointerDown={() => setActiveMix(mix.id)}
    >
      <div
        className="mix-node-handle"
        style={{ background: mix.color }}
        onPointerDown={onHandleDown}
        title="Drag to move · drop bricks here to add them"
      >
        <span className="mix-node-icon">🎚</span>
        <span className="mix-node-count">{members}</span>
      </div>
      <input
        className="mix-node-name"
        value={mix.name}
        onChange={(e) => updateMix(mix.id, { name: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div className="mix-node-actions">
        <button className="mini-btn" title="Play mix" onClick={play}>
          ▶
        </button>
        <button className="mini-btn" title="Stop" onClick={() => engine.stop()}>
          ■
        </button>
        <button
          className="mini-btn"
          title="Export mix MIDI"
          onClick={() =>
            exportMix(
              mix.layers
                .map((l) => bricks.find((b) => b.id === l.brickId)!)
                .filter(Boolean),
              globalBpm,
              `${mix.name.replace(/[^a-z0-9-_]+/gi, '_') || 'mix'}.mid`
            )
          }
        >
          ⇩
        </button>
        <button
          className="mini-btn danger"
          title="Delete mix"
          onClick={() => deleteMix(mix.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
