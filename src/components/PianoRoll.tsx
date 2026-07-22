import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { scalePitchClasses } from '../lib/theory';
import { midiToName, engine } from '../audio/engine';
import { DRUM_PITCHES, drumName, drumShortName } from '../lib/drums';
import type { Note } from '../types';

type Rect = { x0: number; y0: number; x1: number; y1: number };

const PITCH_HIGH = 96; // C7
const PITCH_LOW = 36; // C2
const ROW_H = 16;
const BEAT_W = 44;

const BLACK = new Set([1, 3, 6, 8, 10]);
const LANE_H = 60;

/** Editing grids, in quarter-note beats. */
export const GRID_OPTIONS: { label: string; beats: number }[] = [
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 },
  { label: '1/32', beats: 0.125 },
  { label: '1/4 triplet', beats: 2 / 3 },
  { label: '1/8 triplet', beats: 1 / 3 },
  { label: '1/16 triplet', beats: 1 / 6 },
  { label: '1/8 dotted', beats: 0.75 },
];

/** Melodic rows are a contiguous chromatic range, high pitch first. */
const MELODIC_PITCHES: number[] = Array.from(
  { length: PITCH_HIGH - PITCH_LOW + 1 },
  (_, i) => PITCH_HIGH - i
);

function snapTo(raw: number, grid: number): number {
  return Math.round(raw / grid) * grid;
}

type Orig = { start: number; pitch: number; duration: number };

type Drag =
  | null
  | {
      type: 'move' | 'resize';
      primaryId: string;
      downBeat: number;
      downRow: number;
      origs: Map<string, Orig>;
      lastPreview: number;
      moved: boolean;
    }
  | {
      type: 'bg';
      x0: number;
      y0: number;
      startBeat: number;
      startRow: number;
      additive: boolean;
      moved: boolean;
    };

type Marquee = Rect | null;

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
  const templates = useStore((s) => s.templates);
  const activeBrush = useStore((s) => s.activeBrush);
  const setActiveBrush = useStore((s) => s.setActiveBrush);
  const addTemplate = useStore((s) => s.addTemplate);
  const renameTemplate = useStore((s) => s.renameTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const snapToScale = useStore((s) => s.snapToScale);
  const setSnapToScale = useStore((s) => s.setSnapToScale);
  const showNoteNames = useStore((s) => s.showNoteNames);
  const setShowNoteNames = useStore((s) => s.setShowNoteNames);
  const grid = useStore((s) => s.grid);
  const setGrid = useStore((s) => s.setGrid);
  const clipboardSize = useStore((s) => s.clipboard.length);
  const copyNotes = useStore((s) => s.copyNotes);
  const pasteNotes = useStore((s) => s.pasteNotes);
  const quantize = useStore((s) => s.quantize);
  const activeTemplate = templates.find((t) => t.id === activeBrush) ?? null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Marquee>(null);
  const [lastDur, setLastDur] = useState(1);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const dragRef = useRef<Drag>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const velSvgRef = useRef<SVGSVGElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  const rollRef = useRef<HTMLDivElement | null>(null);
  const velRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const marqueeRef = useRef<Marquee>(null);
  marqueeRef.current = marquee;

  // Playhead: follow the transport while this brick is playing.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = useStore.getState().bricks.find((x) => x.id === brickId);
      if (b && engine.isBrickPlaying(brickId)) {
        setPlayhead(engine.transportBeats() % b.lengthBeats);
      } else {
        setPlayhead(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [brickId]);

  // Keep the velocity lane horizontally aligned with the grid.
  function syncScroll(from: 'roll' | 'vel') {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (from === 'roll' && rollRef.current && velRef.current)
      velRef.current.scrollLeft = rollRef.current.scrollLeft;
    else if (from === 'vel' && rollRef.current && velRef.current)
      rollRef.current.scrollLeft = velRef.current.scrollLeft;
    syncingRef.current = false;
  }

  const scaleSet = useMemo(
    () => (brick ? scalePitchClasses(brick.key) : new Set<number>()),
    [brick?.key]
  );

  // Rows are a pitch list (high first). Melodic bricks use a chromatic range;
  // percussion bricks use the GM drum map, plus any stray pitches already in
  // the brick so notes never become invisible when you flip the mode.
  const percussion = brick?.percussion ?? false;
  const pitches = useMemo(() => {
    if (!percussion) return MELODIC_PITCHES;
    const set = new Set<number>(DRUM_PITCHES);
    for (const n of brick?.notes ?? []) set.add(n.pitch);
    return [...set].sort((a, b) => b - a);
  }, [percussion, brick?.notes]);

  const rowIndex = useMemo(() => {
    const m = new Map<number, number>();
    pitches.forEach((p, i) => m.set(p, i));
    return m;
  }, [pitches]);

  const rowCount = pitches.length;
  const width = (brick?.lengthBeats ?? 8) * BEAT_W;
  const height = rowCount * ROW_H;

  const pitchOfRow = (row: number) =>
    pitches[Math.max(0, Math.min(pitches.length - 1, row))];
  const rowOfPitch = (p: number) => rowIndex.get(p) ?? 0;

  function coords(e: PointerEvent | React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const row = Math.floor(y / ROW_H);
    return { x, y, beat: x / BEAT_W, row, pitch: pitchOfRow(row) };
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
        const newDur = Math.max(grid, snapTo(c.beat - o.start, grid));
        updateNote(brick.id, d.primaryId, { duration: newDur });
        setLastDur(newDur);
        return;
      }

      // group move
      const primary = d.origs.get(d.primaryId)!;
      const snappedPrimaryStart = Math.max(
        0,
        snapTo(primary.start + (c.beat - d.downBeat), grid)
      );
      let deltaBeat = snappedPrimaryStart - primary.start;
      const origVals = [...d.origs.values()];
      const minStart = Math.min(...origVals.map((o) => o.start));
      if (minStart + deltaBeat < 0) deltaBeat = -minStart;

      // vertical movement is in ROW space so it works for both the chromatic
      // grid and the (non-contiguous) drum map
      let deltaRow = c.row - d.downRow;
      const origRows = origVals.map((o) => rowOfPitch(o.pitch));
      const minR = Math.min(...origRows);
      const maxR = Math.max(...origRows);
      if (minR + deltaRow < 0) deltaRow = -minR;
      if (maxR + deltaRow > rowCount - 1) deltaRow = rowCount - 1 - maxR;

      const patches: Record<string, Partial<Note>> = {};
      for (const [id, o] of d.origs) {
        patches[id] = {
          start: o.start + deltaBeat,
          pitch: pitchOfRow(rowOfPitch(o.pitch) + deltaRow),
        };
      }
      if (deltaBeat !== 0 || deltaRow !== 0) d.moved = true;
      updateNotesBatch(brick.id, patches);

      const newPrimaryPitch = pitchOfRow(rowOfPitch(primary.pitch) + deltaRow);
      if (audition && newPrimaryPitch !== d.lastPreview) {
        d.lastPreview = newPrimaryPitch;
        engine.preview(newPrimaryPitch, brick.instrument, 0.8, brick.percussion);
      }
    }

    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;

      // audible confirmation when a drag lands (covers horizontal moves, which
      // never change pitch and so never trigger the in-flight preview)
      if (d && d.type === 'move' && d.moved && audition && brick) {
        const n = brick.notes.find((x) => x.id === d.primaryId);
        if (n) engine.preview(n.pitch, brick.instrument, 0.8, brick.percussion);
      }

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
          // plain click on empty grid -> stamp the active brush (phrase or note)
          const start = Math.max(0, d.startBeat);
          if (d.startRow >= 0 && d.startRow < rowCount) {
            const anchorPitch = pitchOfRow(d.startRow);
            const st = useStore.getState();
            const tpl = st.activeBrush
              ? st.templates.find((t) => t.id === st.activeBrush)
              : null;
            if (tpl && tpl.notes.length) {
              const b2 = st.bricks.find((x) => x.id === brick.id);
              // scale-snapping is meaningless on a drum map
              const set =
                st.snapToScale && b2 && !b2.percussion
                  ? scalePitchClasses(b2.key)
                  : null;
              st.addNotes(
                brick.id,
                tpl.notes.map((n) => {
                  let p = Math.max(
                    PITCH_LOW,
                    Math.min(PITCH_HIGH, anchorPitch + n.dp)
                  );
                  if (set) p = nearestInScale(p, set);
                  return {
                    pitch: p,
                    start: Math.max(0, start + n.start),
                    duration: n.duration,
                    velocity: n.velocity,
                  };
                })
              );
            } else {
              addNote(brick.id, {
                pitch: anchorPitch,
                start,
                duration: lastDur,
                velocity: 0.8,
              });
            }
            if (audition)
              engine.preview(anchorPitch, brick.instrument, 0.8, brick.percussion);
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
  }, [brick, updateNote, updateNotesBatch, addNote, audition, lastDur, grid]);

  if (!brick) return null;

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const c = coords(e);
    dragRef.current = {
      type: 'bg',
      x0: c.x,
      y0: c.y,
      startBeat: snapTo(c.beat, grid),
      startRow: c.row,
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
        downRow: 0,
        origs: new Map([[id, { start: n.start, pitch: n.pitch, duration: n.duration }]]),
        lastPreview: n.pitch,
        moved: false,
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
      downRow: c.row,
      origs,
      lastPreview: n.pitch,
      moved: false,
    };
  }

  function doCopy(cut = false) {
    if (!selected.size) return;
    copyNotes(brick!.id, [...selected], cut);
    if (cut) setSelected(new Set());
  }

  function doPaste() {
    const ids = pasteNotes(brick!.id);
    if (ids.length) setSelected(new Set(ids)); // select the paste so it can be dragged
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      removeNotes(brick!.id, [...selected]);
      setSelected(new Set());
      e.preventDefault();
    } else if (mod && e.key.toLowerCase() === 'c') {
      doCopy(false);
      e.preventDefault();
    } else if (mod && e.key.toLowerCase() === 'x') {
      doCopy(true);
      e.preventDefault();
    } else if (mod && e.key.toLowerCase() === 'v') {
      doPaste();
      e.preventDefault();
    } else if (mod && e.key.toLowerCase() === 'a') {
      setSelected(new Set(brick!.notes.map((n) => n.id)));
      e.preventDefault();
    }
  }

  function onVelDown(e: React.PointerEvent, note: Note) {
    e.stopPropagation();
    if (e.button !== 0) return;
    // if the note is part of the current selection, edit the whole selection
    const targets = selected.has(note.id) ? [...selected] : [note.id];
    const apply = (clientY: number) => {
      const rect = velSvgRef.current!.getBoundingClientRect();
      const v = Math.max(0.05, Math.min(1, 1 - (clientY - rect.top) / LANE_H));
      const patches: Record<string, Partial<Note>> = {};
      for (const id of targets) patches[id] = { velocity: v };
      updateNotesBatch(brick!.id, patches);
    };
    apply(e.clientY);
    const move = (ev: PointerEvent) => apply(ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function savePhrase(source: Note[]) {
    if (source.length === 0) return;
    const minStart = Math.min(...source.map((n) => n.start));
    // anchor = earliest note (ties broken by lowest pitch)
    const anchor = source.reduce((a, b) =>
      b.start < a.start || (b.start === a.start && b.pitch < a.pitch) ? b : a
    );
    const notes = source.map((n) => ({
      dp: n.pitch - anchor.pitch,
      start: n.start - minStart,
      duration: n.duration,
      velocity: n.velocity,
    }));
    addTemplate(`Phrase ${templates.length + 1}`, notes);
    // focus the inline rename field instead of a browser prompt
    requestAnimationFrame(() => renameRef.current?.select());
  }

  const rows = pitches.map((pitch, i) => {
    const pc = ((pitch % 12) + 12) % 12;
    return {
      i,
      pitch,
      pc,
      inScale: !percussion && scaleSet.has(pc),
      black: !percussion && BLACK.has(pc),
    };
  });

  const beatLines = [];
  for (let b = 0; b <= brick.lengthBeats; b++) beatLines.push(b);
  // faint sub-divisions follow the chosen grid (so triplets look like triplets)
  const stepLines: number[] = [];
  for (let b = 0; b <= brick.lengthBeats + 1e-9; b += grid) stepLines.push(b);

  // bar lines from the time signature (in quarter-note beats; may be fractional)
  const ts = brick.timeSig ?? { num: 4, den: 4 };
  const beatsPerBar = (ts.num * 4) / ts.den || 4;
  const barLines: number[] = [];
  for (let x = 0; x <= brick.lengthBeats + 1e-6; x += beatsPerBar) barLines.push(x);

  const m = marquee ? normRect(marquee) : null;

  return (
    <div className="roll-with-vel">
    <div className="roll-editbar">
      <label className="brush-field">
        Grid
        <select
          value={grid}
          onChange={(e) => setGrid(Number(e.target.value))}
        >
          {GRID_OPTIONS.map((g) => (
            <option key={g.label} value={g.beats}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="ghost-btn brush-btn"
        disabled={selected.size === 0}
        onClick={() => quantize(brick.id, [...selected], grid)}
        title="Snap selected notes to the grid"
      >
        ⌗ Quantize selection
      </button>
      <button
        className="ghost-btn brush-btn"
        disabled={brick.notes.length === 0}
        onClick={() => quantize(brick.id, null, grid)}
        title="Snap every note in this brick to the grid"
      >
        ⌗ Whole card
      </button>

      <span className="brush-spacer" />

      {selected.size > 0 && (
        <>
          <span className="sel-count">{selected.size} selected</span>
          <button className="ghost-btn brush-btn" onClick={() => doCopy(false)} title="Copy (Ctrl+C)">
            ⧉ Copy
          </button>
          <button className="ghost-btn brush-btn" onClick={() => doCopy(true)} title="Cut (Ctrl+X)">
            ✂ Cut
          </button>
        </>
      )}
      <button
        className="ghost-btn brush-btn"
        disabled={clipboardSize === 0}
        onClick={doPaste}
        title="Paste (Ctrl+V)"
      >
        ⎘ Paste{clipboardSize ? ` (${clipboardSize})` : ''}
      </button>
    </div>
    <div className="roll-brushbar">
      <label className="brush-field">
        Brush
        <select
          value={activeBrush ?? ''}
          onChange={(e) => setActiveBrush(e.target.value || null)}
        >
          <option value="">Single note</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.notes.length})
            </option>
          ))}
        </select>
      </label>
      {activeTemplate && (
        <>
          <input
            ref={renameRef}
            className="brush-rename"
            value={activeTemplate.name}
            onChange={(e) => renameTemplate(activeTemplate.id, e.target.value)}
            title="Rename phrase"
          />
          <button
            className="ghost-btn brush-btn"
            title="Delete this phrase"
            onClick={() => deleteTemplate(activeTemplate.id)}
          >
            🗑
          </button>
          <label className="brush-check" title="Remap stamped phrases into the brick's key">
            <input
              type="checkbox"
              checked={snapToScale}
              onChange={(e) => setSnapToScale(e.target.checked)}
            />
            Snap to scale
          </label>
        </>
      )}
      <label className="brush-check" title="Draw note names on the note blocks">
        <input
          type="checkbox"
          checked={showNoteNames}
          onChange={(e) => setShowNoteNames(e.target.checked)}
        />
        Note names
      </label>
      <span className="brush-spacer" />
      <button
        className="ghost-btn brush-btn"
        disabled={selected.size === 0}
        onClick={() => savePhrase(brick.notes.filter((n) => selected.has(n.id)))}
        title="Turn the selected notes into a reusable phrase brush"
      >
        ＋ Selection
      </button>
      <button
        className="ghost-btn brush-btn"
        disabled={brick.notes.length === 0}
        onClick={() => savePhrase(brick.notes)}
        title="Turn this whole brick into a phrase brush"
      >
        ＋ From brick
      </button>
    </div>
    <div
      className="roll-scroll"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={() => syncScroll('roll')}
      ref={(el) => {
        rollRef.current = el;
        if (el && el.dataset.init !== '1') {
          el.dataset.init = '1';
          el.scrollTop = (PITCH_HIGH - 72) * ROW_H - 80;
        }
      }}
    >
      <div className="roll-inner" style={{ height }}>
        <svg className="roll-keys" width={percussion ? 116 : 48} height={height}>
          {rows.map((r) => (
            <g key={r.i}>
              <rect
                x={0}
                y={r.i * ROW_H}
                width={percussion ? 116 : 48}
                height={ROW_H}
                fill={r.black ? '#20242e' : '#2e3440'}
                stroke="#1a1d24"
                strokeWidth={0.5}
              />
              {percussion ? (
                <text x={5} y={r.i * ROW_H + 11.5} className="roll-drumlabel">
                  {drumName(r.pitch)}
                </text>
              ) : (
                r.pc === 0 && (
                  <text x={6} y={r.i * ROW_H + 12} className="roll-keylabel">
                    {midiToName(r.pitch)}
                  </text>
                )
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
            {stepLines.map((b, i) => (
              <line
                key={'s' + i}
                x1={b * BEAT_W}
                y1={0}
                x2={b * BEAT_W}
                y2={height}
                stroke="#1f232b"
                strokeWidth={Math.abs(b - Math.round(b)) < 1e-9 ? 0 : 1}
              />
            ))}
            {beatLines.map((b) => (
              <line
                key={'b' + b}
                x1={b * BEAT_W}
                y1={0}
                x2={b * BEAT_W}
                y2={height}
                stroke="#3a4150"
                strokeWidth={1}
              />
            ))}
            {barLines.map((b, i) => (
              <line
                key={'bar' + i}
                x1={b * BEAT_W}
                y1={0}
                x2={b * BEAT_W}
                y2={height}
                stroke="#5a6473"
                strokeWidth={1.5}
              />
            ))}
            {/* Paint plain notes first, then selected/hovered on top so their
                outline and resize handle are never hidden by a neighbour. */}
            {[...brick.notes]
              .sort((a, b) => rank(a, selected, hovered) - rank(b, selected, hovered))
              .map((n) => {
                const x = n.start * BEAT_W;
                const y = rowOfPitch(n.pitch) * ROW_H;
                const w = Math.max(6, n.duration * BEAT_W);
                const isSel = selected.has(n.id);
                const showHandle = isSel || hovered === n.id;
                const label = percussion
                  ? drumShortName(n.pitch)
                  : midiToName(n.pitch);
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
                    {showNoteNames && w >= 24 && (
                      <text
                        x={x + 3}
                        y={y + ROW_H - 4.5}
                        className="roll-notename"
                        clipPath="inset(0)"
                      >
                        {label}
                      </text>
                    )}
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
            {playhead != null && (
              <line
                x1={playhead * BEAT_W}
                y1={0}
                x2={playhead * BEAT_W}
                y2={height}
                stroke="#5ef2a0"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </svg>
        </div>
      </div>
    </div>

      {/* Velocity lane — bar height = velocity; drag a bar up/down to change it */}
      <div className="vel-lane">
        <div className="vel-label" style={{ width: percussion ? 116 : 48 }}>
          Vel
        </div>
        <div className="vel-scroll" ref={velRef} onScroll={() => syncScroll('vel')}>
          <svg ref={velSvgRef} width={width} height={LANE_H} style={{ display: 'block', touchAction: 'none' }}>
            <line x1={0} y1={LANE_H - 1} x2={width} y2={LANE_H - 1} stroke="#3a4150" />
            {brick.notes.map((n) => {
              const x = n.start * BEAT_W;
              const w = Math.max(3, n.duration * BEAT_W - 1);
              const h = Math.max(2, n.velocity * LANE_H);
              const isSel = selected.has(n.id);
              return (
                <rect
                  key={n.id}
                  x={x}
                  y={LANE_H - h}
                  width={w}
                  height={h}
                  fill={brick.color}
                  opacity={isSel ? 1 : 0.55}
                  stroke={isSel ? '#fff' : 'none'}
                  strokeWidth={isSel ? 1.5 : 0}
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => onVelDown(e, n)}
                />
              );
            })}
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

/** Nearest MIDI pitch whose pitch-class is in the scale (searches out ±). */
function nearestInScale(pitch: number, set: Set<number>): number {
  for (let d = 0; d < 12; d++) {
    for (const s of d === 0 ? [0] : [d, -d]) {
      const p = pitch + s;
      if (p >= PITCH_LOW && p <= PITCH_HIGH && set.has(((p % 12) + 12) % 12))
        return p;
    }
  }
  return pitch;
}

function normRect(r: Rect): Rect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}

function noteInRect(n: Note, m: Rect): boolean {
  const nx0 = n.start * BEAT_W;
  const nx1 = nx0 + Math.max(6, n.duration * BEAT_W);
  const ny0 = (PITCH_HIGH - n.pitch) * ROW_H;
  const ny1 = ny0 + ROW_H;
  return nx0 < m.x1 && nx1 > m.x0 && ny0 < m.y1 && ny1 > m.y0;
}
