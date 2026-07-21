import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { scalePitchClasses } from '../lib/theory';
import { midiToName, engine } from '../audio/engine';
import type { Note } from '../types';

const PITCH_HIGH = 96; // C7
const PITCH_LOW = 36; // C2
const ROW_H = 16;
const BEAT_W = 44;
const STEPS_PER_BEAT = 4;
const STEP_W = BEAT_W / STEPS_PER_BEAT;

const BLACK = new Set([1, 3, 6, 8, 10]);
const rowCount = PITCH_HIGH - PITCH_LOW + 1;

function snapBeat(raw: number): number {
  return Math.round(raw * STEPS_PER_BEAT) / STEPS_PER_BEAT;
}

type Orig = { start: number; pitch: number; duration: number };

type Drag =
  | null
  | {
      type: 'move' | 'resize';
      primaryId: string;
      downBeat: number;
      downPitch: number;
      origs: Map<string, Orig>;
      lastPreview: number;
    }
  | {
      type: 'bg';
      x0: number;
      y0: number;
      startBeat: number;
      startPitch: number;
      additive: boolean;
      moved: boolean;
    };

type Marquee = { x0: number; y0: number; x1: number; y1: number } | null;

export function PianoRoll({
  brickId,
  audition,
}: {
  brickId: string;
  audition: boolean;
}) {
  const brick = useStore((s) => s.bricks.find((b) => b.id === brickId));
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const updateNotesBatch = useStore((s) => s.updateNotesBatch);
  const removeNote = useStore((s) => s.removeNote);
  const removeNotes = useStore((s) => s.removeNotes);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Marquee>(null);
  const [lastDur, setLastDur] = useState(1);
  const dragRef = useRef<Drag>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const marqueeRef = useRef<Marquee>(null);
  marqueeRef.current = marquee;

  const scaleSet = useMemo(
    () => (brick ? scalePitchClasses(brick.key) : new Set<number>()),
    [brick?.key]
  );

  const width = (brick?.lengthBeats ?? 8) * BEAT_W;
  const height = rowCount * ROW_H;

  function coords(e: PointerEvent | React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x,
      y,
      beat: x / BEAT_W,
      pitch: PITCH_HIGH - Math.floor(y / ROW_H),
    };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || !brick) return;
      const c = coords(e);

      if (d.type === 'bg') {
        if (Math.abs(c.x - d.x0) > 4 || Math.abs(c.y - d.y0) > 4) d.moved = true;
        setMarquee({ x0: d.x0, y0: d.y0, x1: c.x, y1: c.y });
        return;
      }

      if (d.type === 'resize') {
        const o = d.origs.get(d.primaryId)!;
        const newDur = Math.max(1 / STEPS_PER_BEAT, snapBeat(c.beat - o.start));
        updateNote(brick.id, d.primaryId, { duration: newDur });
        setLastDur(newDur);
        return;
      }

      // group move
      const primary = d.origs.get(d.primaryId)!;
      const snappedPrimaryStart = Math.max(
        0,
        snapBeat(primary.start + (c.beat - d.downBeat))
      );
      let deltaBeat = snappedPrimaryStart - primary.start;
      const origVals = [...d.origs.values()];
      const minStart = Math.min(...origVals.map((o) => o.start));
      if (minStart + deltaBeat < 0) deltaBeat = -minStart;

      let deltaPitch = c.pitch - d.downPitch;
      const minP = Math.min(...origVals.map((o) => o.pitch));
      const maxP = Math.max(...origVals.map((o) => o.pitch));
      if (minP + deltaPitch < PITCH_LOW) deltaPitch = PITCH_LOW - minP;
      if (maxP + deltaPitch > PITCH_HIGH) deltaPitch = PITCH_HIGH - maxP;

      const patches: Record<string, Partial<Note>> = {};
      for (const [id, o] of d.origs) {
        patches[id] = { start: o.start + deltaBeat, pitch: o.pitch + deltaPitch };
      }
      updateNotesBatch(brick.id, patches);

      const newPrimaryPitch = primary.pitch + deltaPitch;
      if (audition && newPrimaryPitch !== d.lastPreview) {
        d.lastPreview = newPrimaryPitch;
        engine.preview(newPrimaryPitch, brick.instrument);
      }
    }

    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.type === 'bg' && brick) {
        if (d.moved && marqueeRef.current) {
          const m = normRect(marqueeRef.current);
          const hits = brick.notes.filter((n) => noteInRect(n, m));
          setSelected((prev) => {
            const next = d.additive ? new Set(prev) : new Set<string>();
            hits.forEach((n) => next.add(n.id));
            return next;
          });
        } else {
          // plain click on empty grid -> add a note
          const start = Math.max(0, d.startBeat);
          if (d.startPitch >= PITCH_LOW && d.startPitch <= PITCH_HIGH) {
            addNote(brick.id, {
              pitch: d.startPitch,
              start,
              duration: lastDur,
              velocity: 0.8,
            });
            if (audition) engine.preview(d.startPitch, brick.instrument);
            setSelected(new Set());
          }
        }
      }
      setMarquee(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [brick, updateNote, updateNotesBatch, addNote, audition, lastDur]);

  if (!brick) return null;

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const c = coords(e);
    dragRef.current = {
      type: 'bg',
      x0: c.x,
      y0: c.y,
      startBeat: snapBeat(c.beat),
      startPitch: c.pitch,
      additive: e.shiftKey,
      moved: false,
    };
    setMarquee({ x0: c.x, y0: c.y, x1: c.x, y1: c.y });
  }

  function onNoteDown(e: React.PointerEvent, id: string, resize: boolean, n: Note) {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (resize) {
      dragRef.current = {
        type: 'resize',
        primaryId: id,
        downBeat: 0,
        downPitch: 0,
        origs: new Map([[id, { start: n.start, pitch: n.pitch, duration: n.duration }]]),
        lastPreview: n.pitch,
      };
      return;
    }

    if (e.shiftKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }

    // choose the group to move: the current selection if this note is part of
    // it, otherwise just this note.
    let group = selected;
    if (!selected.has(id)) {
      group = new Set([id]);
      setSelected(group);
    }
    const origs = new Map<string, Orig>();
    for (const nid of group) {
      const nn = brick!.notes.find((x) => x.id === nid);
      if (nn) origs.set(nid, { start: nn.start, pitch: nn.pitch, duration: nn.duration });
    }
    const c = coords(e);
    dragRef.current = {
      type: 'move',
      primaryId: id,
      downBeat: c.beat,
      downPitch: c.pitch,
      origs,
      lastPreview: n.pitch,
    };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      removeNotes(brick!.id, [...selected]);
      setSelected(new Set());
      e.preventDefault();
    }
  }

  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const pitch = PITCH_HIGH - i;
    const pc = ((pitch % 12) + 12) % 12;
    rows.push({ i, pitch, pc, inScale: scaleSet.has(pc), black: BLACK.has(pc) });
  }

  const beatLines = [];
  for (let b = 0; b <= brick.lengthBeats; b++) beatLines.push(b);
  const stepLines = [];
  for (let s = 0; s <= brick.lengthBeats * STEPS_PER_BEAT; s++) stepLines.push(s);

  const m = marquee ? normRect(marquee) : null;

  return (
    <div
      className="roll-scroll"
      tabIndex={0}
      onKeyDown={onKeyDown}
      ref={(el) => {
        if (el && el.dataset.init !== '1') {
          el.dataset.init = '1';
          el.scrollTop = (PITCH_HIGH - 72) * ROW_H - 80;
        }
      }}
    >
      <div className="roll-inner" style={{ height }}>
        <svg className="roll-keys" width={48} height={height}>
          {rows.map((r) => (
            <g key={r.i}>
              <rect
                x={0}
                y={r.i * ROW_H}
                width={48}
                height={ROW_H}
                fill={r.black ? '#20242e' : '#2e3440'}
                stroke="#1a1d24"
                strokeWidth={0.5}
              />
              {r.pc === 0 && (
                <text x={6} y={r.i * ROW_H + 12} className="roll-keylabel">
                  {midiToName(r.pitch)}
                </text>
              )}
            </g>
          ))}
        </svg>

        <div className="roll-grid-wrap" style={{ width }}>
          <svg
            ref={svgRef}
            width={width}
            height={height}
            onPointerDown={onBackgroundDown}
            style={{ display: 'block', touchAction: 'none' }}
          >
            {rows.map((r) => (
              <rect
                key={r.i}
                x={0}
                y={r.i * ROW_H}
                width={width}
                height={ROW_H}
                fill={
                  r.inScale
                    ? r.black
                      ? '#333a2e'
                      : '#3a4433'
                    : r.black
                      ? '#262a33'
                      : '#2b303a'
                }
              />
            ))}
            {stepLines.map((s) => (
              <line
                key={'s' + s}
                x1={s * STEP_W}
                y1={0}
                x2={s * STEP_W}
                y2={height}
                stroke="#1f232b"
                strokeWidth={s % STEPS_PER_BEAT === 0 ? 0 : 1}
              />
            ))}
            {beatLines.map((b) => (
              <line
                key={'b' + b}
                x1={b * BEAT_W}
                y1={0}
                x2={b * BEAT_W}
                y2={height}
                stroke={b % 4 === 0 ? '#5a6473' : '#3a4150'}
                strokeWidth={b % 4 === 0 ? 1.5 : 1}
              />
            ))}
            {/* Paint plain notes first, then selected/hovered on top so their
                outline and resize handle are never hidden by a neighbour. */}
            {[...brick.notes]
              .sort((a, b) => rank(a, selected, hovered) - rank(b, selected, hovered))
              .map((n) => {
                const x = n.start * BEAT_W;
                const y = (PITCH_HIGH - n.pitch) * ROW_H;
                const w = Math.max(6, n.duration * BEAT_W);
                const isSel = selected.has(n.id);
                const showHandle = isSel || hovered === n.id;
                return (
                  <g
                    key={n.id}
                    onPointerEnter={() => setHovered(n.id)}
                    onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  >
                    <rect
                      x={x}
                      y={y + 1}
                      width={w}
                      height={ROW_H - 2}
                      rx={3}
                      fill={brick.color}
                      stroke={isSel ? '#fff' : 'rgba(0,0,0,0.35)'}
                      strokeWidth={isSel ? 2 : 1}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => onNoteDown(e, n.id, false, n)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        removeNote(brick.id, n.id);
                      }}
                    />
                    {showHandle && (
                      <rect
                        x={x + w - 5}
                        y={y + 1}
                        width={5}
                        height={ROW_H - 2}
                        rx={1}
                        fill="rgba(0,0,0,0.45)"
                        style={{ cursor: 'ew-resize' }}
                        onPointerDown={(e) => onNoteDown(e, n.id, true, n)}
                      />
                    )}
                  </g>
                );
              })}
            {m && (
              <rect
                x={m.x0}
                y={m.y0}
                width={m.x1 - m.x0}
                height={m.y1 - m.y0}
                fill="rgba(255,209,102,0.15)"
                stroke="#ffd166"
                strokeWidth={1}
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Paint order: plain notes (0) below, hovered/selected notes (1) on top. */
function rank(n: Note, selected: Set<string>, hovered: string | null): number {
  return selected.has(n.id) || hovered === n.id ? 1 : 0;
}

function normRect(r: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}

function noteInRect(
  n: Note,
  m: { x0: number; y0: number; x1: number; y1: number }
): boolean {
  const nx0 = n.start * BEAT_W;
  const nx1 = nx0 + Math.max(6, n.duration * BEAT_W);
  const ny0 = (PITCH_HIGH - n.pitch) * ROW_H;
  const ny1 = ny0 + ROW_H;
  return nx0 < m.x1 && nx1 > m.x0 && ny0 < m.y1 && ny1 > m.y0;
}
