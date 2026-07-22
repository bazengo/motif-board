import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportTimeline } from '../lib/midi';
import {
  buildTimelinePlan,
  sectionSeconds,
  sectionBpm,
  mixLengthBeats,
  formatDuration,
} from '../lib/timeline';

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

  useEffect(() => engine.onChange(setPlaying), []);

  // playhead position along the arrangement
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

  function playTimeline() {
    if (plan.notes.length === 0) return;
    engine.playPlan(plan.notes, plan.totalSeconds);
  }

  // which section the playhead is inside
  const activeIndex =
    elapsed == null
      ? -1
      : plan.starts.findIndex((start, i) => {
          const end = plan.starts[i + 1] ?? plan.totalSeconds;
          return elapsed >= start && elapsed < end;
        });

  return (
    <div className={'timeline-wrap' + (collapsed ? ' collapsed' : '')}>
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
        <div className="timeline-strip">
          {timeline.length === 0 && (
            <div className="tl-empty">
              Drag the <strong>⇩</strong> handle on a mix node down here to
              arrange it. Sections play left to right.
            </div>
          )}

          {timeline.map((section, i) => {
            const mix = mixes.find((m) => m.id === section.mixId);
            if (!mix) return null;
            const bpm = sectionBpm(section, globalBpm);
            const secs = sectionSeconds(section, mix, bricks, globalBpm);
            const bars =
              (mixLengthBeats(mix, bricks) * section.repeats) /
              ((section.timeSig.num * 4) / section.timeSig.den || 4);
            return (
              <div
                key={section.id}
                data-section-index={i}
                className={'tl-section' + (activeIndex === i ? ' active' : '')}
                style={{ borderColor: mix.color }}
              >
                <div className="tl-sec-head" style={{ background: mix.color }}>
                  <span className="tl-sec-num">{i + 1}</span>
                  <span className="tl-sec-name" title={mix.name}>
                    {mix.name}
                  </span>
                  <span className="tl-sec-move">
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      onClick={() => moveSection(section.id, i - 1)}
                      title="Move left"
                    >
                      ‹
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === timeline.length - 1}
                      onClick={() => moveSection(section.id, i + 1)}
                      title="Move right"
                    >
                      ›
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => removeSection(section.id)}
                      title="Remove from timeline"
                    >
                      ✕
                    </button>
                  </span>
                </div>

                <div className="tl-sec-body">
                  <label className="tl-field">
                    Repeats
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={section.repeats}
                      onChange={(e) =>
                        updateSection(section.id, {
                          repeats: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </label>

                  <label className="tl-check">
                    <input
                      type="checkbox"
                      checked={section.lockBpm}
                      onChange={(e) =>
                        updateSection(section.id, { lockBpm: e.target.checked })
                      }
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
                        updateSection(section.id, {
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
                          updateSection(section.id, {
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
                          updateSection(section.id, {
                            timeSig: {
                              ...section.timeSig,
                              den: Number(e.target.value),
                            },
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

                  <div className="tl-sec-stats">
                    {bars % 1 === 0 ? bars : bars.toFixed(1)} bars ·{' '}
                    {formatDuration(secs)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
