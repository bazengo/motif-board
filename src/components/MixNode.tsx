import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportMix } from '../lib/midi';
import { mixAllItems, mixBpm, mixLengthBeats } from '../lib/mix';
import { MIX_W } from '../layout';
import { tagsForMix, matchesTags } from '../lib/tags';
import { clientToBoard } from '../lib/boardCoords';
import type { Brick, Mix } from '../types';

export function MixNode({ mix }: { mix: Mix }) {
  const bricks = useStore((s) => s.bricks);
  const globalBpm = useStore((s) => s.globalBpm);
  const active = useStore((s) => s.activeMixId === mix.id);
  const setActiveMix = useStore((s) => s.setActiveMix);
  const moveMix = useStore((s) => s.moveMix);
  const updateMix = useStore((s) => s.updateMix);
  const deleteMix = useStore((s) => s.deleteMix);

  const updateLayer = useStore((s) => s.updateLayer);
  const activeTags = useStore((s) => s.activeTags);
  const members = mix.layers.length;
  const matches = matchesTags(tagsForMix(mix), activeTags);
  const filtering = activeTags.length > 0;

  // resolved members, so the card can show what's actually in the mix
  const rows = mix.layers
    .map((layer) => ({
      layer,
      brick: bricks.find((b) => b.id === layer.brickId),
    }))
    .filter((r): r is { layer: (typeof mix.layers)[number]; brick: Brick } => !!r.brick);
  const lengthBeats = mixLengthBeats(mix, bricks);
  const noteCount = rows.reduce((n, r) => n + r.brick.notes.length, 0);

  function onHandleDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setActiveMix(mix.id);
    const p0 = clientToBoard(e.clientX, e.clientY);
    const offX = p0.x - mix.board.x;
    const offY = p0.y - mix.board.y;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = clientToBoard(ev.clientX, ev.clientY);
      moveMix(mix.id, Math.max(0, p.x - offX), Math.max(0, p.y - offY));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function play() {
    const items = mixAllItems(mix, bricks);
    if (items.length) engine.play(items, mixBpm(mix, globalBpm), mix.id);
  }

  // Drag this mix down onto the timeline strip to append/insert a section.
  function onTimelineDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const toContent = (ev: PointerEvent | React.PointerEvent) =>
      clientToBoard(ev.clientX, ev.clientY);
    const setLinking = useStore.getState().setLinking;
    const p0 = toContent(e);
    setLinking({ sourceId: mix.id, x: p0.x, y: p0.y, kind: 'timeline' });

    const move = (ev: PointerEvent) => {
      const p = toContent(ev);
      setLinking({ sourceId: mix.id, x: p.x, y: p.y, kind: 'timeline' });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
    function cancel() {
      cleanup();
      useStore.getState().setLinking(null);
    }
    const up = (ev: PointerEvent) => {
      cleanup();
      // the strip lives outside the board's coordinate space, so hit-test the
      // real DOM instead of doing maths across containers
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      // the whole timeline panel is the drop zone — the lane alone is a thin
      // target now that blocks are proportional
      const strip = el?.closest('.timeline-wrap');
      if (strip) {
        const overSection = el?.closest('[data-section-index]') as HTMLElement | null;
        const idx = overSection
          ? Number(overSection.dataset.sectionIndex)
          : undefined;
        useStore.getState().addTimelineSection(mix.id, idx);
      }
      useStore.getState().setLinking(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
  }

  return (
    <div
      className={
        'mix-node' +
        (active ? ' active' : '') +
        (filtering ? (matches ? ' tag-match' : ' tag-dim') : '')
      }
      data-mix={mix.id}
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
        <span className="mix-node-handle-right">
          <button
            className="icon-btn timeline-handle"
            title="Drag onto the timeline to arrange this mix"
            onPointerDown={onTimelineDown}
          >
            ⇩
          </button>
          <span className="mix-node-count">{members}</span>
        </span>
      </div>
      <input
        className="mix-node-name"
        value={mix.name}
        onChange={(e) => updateMix(mix.id, { name: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <div className="mix-node-stats">
        {formatBars(lengthBeats)} · {mixBpm(mix, globalBpm)} BPM
        {!mix.lockBpm && <span className="mix-node-free"> free</span>}
        <br />
        {members} layer{members === 1 ? '' : 's'} · {noteCount} note
        {noteCount === 1 ? '' : 's'}
      </div>

      {rows.length > 0 && (
        <div className="mix-node-members">
          {rows.map(({ layer, brick }) => (
            <div className="mix-node-member" key={layer.brickId}>
              <span
                className="mix-node-swatch"
                style={{ background: brick.color }}
              />
              <span className="mix-node-mname" title={brick.name}>
                {brick.name}
              </span>
              {/* quick mute/solo without opening the sidebar */}
              <button
                className={'mix-node-flag' + (layer.mute ? ' on mute' : '')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  updateLayer(mix.id, layer.brickId, { mute: !layer.mute })
                }
                title={layer.mute ? 'Unmute' : 'Mute'}
              >
                M
              </button>
              <button
                className={'mix-node-flag' + (layer.solo ? ' on solo' : '')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  updateLayer(mix.id, layer.brickId, { solo: !layer.solo })
                }
                title={layer.solo ? 'Unsolo' : 'Solo'}
              >
                S
              </button>
            </div>
          ))}
        </div>
      )}
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

/** Beats as bars, assuming 4/4 — mixes have no time signature of their own. */
function formatBars(beats: number): string {
  const bars = beats / 4;
  const shown = Number.isInteger(bars) ? String(bars) : bars.toFixed(1);
  return `${shown} bar${bars === 1 ? '' : 's'}`;
}
