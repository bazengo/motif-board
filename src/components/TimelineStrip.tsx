import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportTimeline } from '../lib/midi';
import {
  buildTimelinePlan,
  sectionBpm,
  mixLengthBeats,
  formatDuration,
} from '../lib/timeline';

const LANE_H = 58;
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

export function TimelineStrip() {
  const timeline = useStore((s) => s.timeline);
  const mixes = useStore((s) => s.mixes);
  const bricks = useStore((s) => s.bricks);
  const globalBpm = useStore((s) => s.globalBpm);
  const removeSection = useStore((s) => s.removeTimelineSection);
  const moveSection = useStore((s) => s.moveTimelineSection);
  const updateSection = useStore((s) => s.updateTimelineSection);

  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(36);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const linking = useStore((s) => s.linking);

  useEffect(() => engine.onChange(setPlaying), []);

  useEffect(() => {
    if (!playing) {
      setElapsed(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      setElapsed(engine.transportSeconds());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const plan = buildTimelinePlan(timeline, mixes, bricks, globalBpm);
  const totalWidth = Math.max(320, plan.totalSeconds * pxPerSec);

  // one shared pitch range keeps every section's preview on the same scale,
  // so a bass part visibly sits below a lead
  let minPitch = Infinity;
  let maxPitch = -Infinity;
  for (const n of plan.notes) {
    minPitch = Math.min(minPitch, n.pitch);
    maxPitch = Math.max(maxPitch, n.pitch);
  }
  if (!Number.isFinite(minPitch)) {
    minPitch = 48;
    maxPitch = 72;
  }
  const span = Math.max(6, maxPitch - minPitch + 2);

  // ruler step that keeps labels ~60px apart
  const step =
    RULER_STEPS.find((s) => s * pxPerSec >= 60) ??
    RULER_STEPS[RULER_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t <= plan.totalSeconds + step; t += step) ticks.push(t);

  const selected = timeline.find((t) => t.id === selectedId) ?? timeline[0];
  const activeIndex =
    elapsed == null
      ? -1
      : plan.starts.findIndex((start, i) => {
          const end = plan.starts[i + 1] ?? plan.totalSeconds;
          return elapsed >= start && elapsed < end;
        });

  function playTimeline() {
    if (plan.notes.length) engine.playPlan(plan.notes, plan.totalSeconds);
  }

  /** Drag a block along the lane to reorder the arrangement. */
  function onBlockDown(e: React.PointerEvent, section: { id: string }, i: number) {
    if (e.button !== 0) return;
    setSelectedId(section.id);
    const startX = e.clientX;
    let dragging = false;

    const indexAt = (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return i;
      const x = clientX - lane.getBoundingClientRect().left;
      const secs = x / pxPerSec;
      // which section does this time land in?
      let idx = plan.starts.findIndex((s, k) => {
        const end = plan.starts[k + 1] ?? plan.totalSeconds;
        return secs >= s && secs < end;
      });
      if (idx < 0) idx = secs <= 0 ? 0 : timeline.length - 1;
      return idx;
    };

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - startX) > 4) {
        dragging = true;
        setDragId(section.id);
      }
      if (dragging) setDropIndex(indexAt(ev.clientX));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) {
        const to = indexAt(ev.clientX);
        if (to !== i) moveSection(section.id, to);
      }
      setDragId(null);
      setDropIndex(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div
      className={
        'timeline-wrap' +
        (collapsed ? ' collapsed' : '') +
        (linking?.kind === 'timeline' ? ' drop-target' : '')
      }
    >
      <div className="timeline-head">
        <button
          className="ghost-btn tl-collapse"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Show timeline' : 'Hide timeline'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
        <h3>Timeline</h3>
        <span className="tl-meta">
          {timeline.length} section{timeline.length === 1 ? '' : 's'} ·{' '}
          {formatDuration(plan.totalSeconds)}
          {elapsed != null && <> · {formatDuration(elapsed)}</>}
        </span>
        <div className="tl-actions">
          <div className="btn-group">
            <button
              className="ghost-btn"
              onClick={() => setPxPerSec((z) => Math.max(6, z / 1.4))}
              title="Zoom out"
            >
              −
            </button>
            <button
              className="ghost-btn"
              onClick={() => setPxPerSec((z) => Math.min(200, z * 1.4))}
              title="Zoom in"
            >
              +
            </button>
          </div>
          <button
            className="primary-btn"
            onClick={playTimeline}
            disabled={plan.notes.length === 0}
          >
            ▶ Play arrangement
          </button>
          <button className="ghost-btn" onClick={() => engine.stop()}>
            ■
          </button>
          <button
            className="ghost-btn"
            disabled={plan.notes.length === 0}
            onClick={() => exportTimeline(plan.notes, plan.totalSeconds)}
            title="Export the whole arrangement as MIDI"
          >
            ⇩ MIDI
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="tl-scroll">
            <div style={{ width: totalWidth, position: 'relative' }}>
              {/* time codes */}
              <div className="tl-ruler">
                {ticks.map((t) => (
                  <div key={t} className="tl-tick" style={{ left: t * pxPerSec }}>
                    <span>{formatDuration(t)}</span>
                  </div>
                ))}
              </div>

              {/* the lane — keeps .timeline-strip so mix nodes can be dropped here */}
              <div
                className="timeline-strip"
                ref={laneRef}
                style={{ height: LANE_H }}
              >
                {timeline.length === 0 && (
                  <div className="tl-empty">
                    Drag the <strong>⇩</strong> handle on a mix node down here to
                    arrange it.
                  </div>
                )}

                {timeline.map((section, i) => {
                  const mix = mixes.find((m) => m.id === section.mixId);
                  if (!mix) return null;
                  const start = plan.starts[i] ?? 0;
                  const end = plan.starts[i + 1] ?? plan.totalSeconds;
                  const dur = Math.max(0.001, end - start);
                  const w = Math.max(6, dur * pxPerSec);
                  const notes = plan.notes.filter(
                    (n) => n.time >= start && n.time < end
                  );
                  return (
                    <div
                      key={section.id}
                      data-section-index={i}
                      className={
                        'tl-block' +
                        (activeIndex === i ? ' active' : '') +
                        (selected?.id === section.id ? ' selected' : '') +
                        (dragId === section.id ? ' dragging' : '') +
                        (dragId && dropIndex === i && dragId !== section.id
                          ? ' drop-here'
                          : '')
                      }
                      style={{
                        left: start * pxPerSec,
                        width: w,
                        borderColor: mix.color,
                      }}
                      onPointerDown={(e) => onBlockDown(e, section, i)}
                      title={`${mix.name} — ${formatDuration(dur)} · drag to reorder`}
                    >
                      <div
                        className="tl-block-head"
                        style={{ background: mix.color }}
                      >
                        <span className="tl-block-name">
                          {i + 1}. {mix.name}
                          {section.repeats > 1 ? ` ×${section.repeats}` : ''}
                        </span>
                      </div>
                      {/* piano-roll preview of what actually plays here */}
                      <svg
                        className="tl-preview"
                        width={w}
                        height={LANE_H - 16}
                        preserveAspectRatio="none"
                      >
                        {notes.map((n, k) => {
                          const x = ((n.time - start) / dur) * w;
                          const nw = Math.max(1.5, (n.dur / dur) * w);
                          const y =
                            (LANE_H - 16) -
                            ((n.pitch - minPitch + 1) / span) * (LANE_H - 16);
                          return (
                            <rect
                              key={k}
                              x={x}
                              y={y}
                              width={nw}
                              height={Math.max(1.5, (LANE_H - 16) / span - 0.5)}
                              fill={n.brick.color}
                              opacity={0.9}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  );
                })}

                {elapsed != null && (
                  <div
                    className="tl-playhead"
                    style={{ left: elapsed * pxPerSec }}
                  />
                )}
              </div>
            </div>
          </div>

          {selected && (
            <SectionDetail
              key={selected.id}
              section={selected}
              index={timeline.findIndex((t) => t.id === selected.id)}
              count={timeline.length}
              mixName={mixes.find((m) => m.id === selected.mixId)?.name ?? '—'}
              bars={
                (mixLengthBeats(
                  mixes.find((m) => m.id === selected.mixId)!,
                  bricks
                ) *
                  selected.repeats) /
                ((selected.timeSig.num * 4) / selected.timeSig.den || 4)
              }
              bpm={sectionBpm(selected, globalBpm)}
              onMove={(to) => moveSection(selected.id, to)}
              onRemove={() => removeSection(selected.id)}
              onUpdate={(patch) => updateSection(selected.id, patch)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SectionDetail({
  section,
  index,
  count,
  mixName,
  bars,
  bpm,
  onMove,
  onRemove,
  onUpdate,
}: {
  section: import('../types').TimelineSection;
  index: number;
  count: number;
  mixName: string;
  bars: number;
  bpm: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<import('../types').TimelineSection>) => void;
}) {
  return (
    <div className="tl-detail">
      <span className="tl-detail-title">
        {index + 1}. {mixName}
      </span>

      <label className="tl-field">
        Repeats
        <input
          type="number"
          min={1}
          max={64}
          value={section.repeats}
          onChange={(e) =>
            onUpdate({ repeats: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </label>

      <label className="tl-check">
        <input
          type="checkbox"
          checked={section.lockBpm}
          onChange={(e) => onUpdate({ lockBpm: e.target.checked })}
        />
        Lock to master
      </label>

      <label className="tl-field">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          value={bpm}
          disabled={section.lockBpm}
          onChange={(e) =>
            onUpdate({
              bpm: Math.max(20, Math.min(300, Number(e.target.value) || 120)),
            })
          }
        />
      </label>

      <label className="tl-field">
        Time sig
        <span className="tl-timesig">
          <input
            type="number"
            min={1}
            max={32}
            value={section.timeSig.num}
            onChange={(e) =>
              onUpdate({
                timeSig: {
                  ...section.timeSig,
                  num: Math.max(1, Number(e.target.value) || 4),
                },
              })
            }
          />
          <span>/</span>
          <select
            value={section.timeSig.den}
            onChange={(e) =>
              onUpdate({
                timeSig: { ...section.timeSig, den: Number(e.target.value) },
              })
            }
          >
            {[2, 4, 8, 16].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </span>
      </label>

      <span className="tl-detail-stats">
        {bars % 1 === 0 ? bars : bars.toFixed(1)} bars
      </span>

      <span className="brush-spacer" />

      <div className="tl-sec-move">
        <button
          className="icon-btn"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
          title="Move earlier"
        >
          ‹
        </button>
        <button
          className="icon-btn"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
          title="Move later"
        >
          ›
        </button>
        <button className="icon-btn" onClick={onRemove} title="Remove section">
          ✕
        </button>
      </div>
    </div>
  );
}
