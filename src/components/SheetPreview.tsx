import { useMemo, type ReactNode } from 'react';
import { notatable, layoutSheet, type LaidEvent } from '../lib/notation';
import {
  GLYPH,
  NOTEHEAD_FOR,
  REST_FOR,
  ACCIDENTAL_FOR,
  timeSigGlyphs,
  familyFor,
  type SheetFontId,
} from '../lib/smufl';
import type { Brick } from '../types';

const LINE_GAP = 5.5; // one staff space, px
const STEP = LINE_GAP / 2; // one diatonic step
const STAFF_H = LINE_GAP * 4;
// SMuFL em square = 4 staff spaces, so this sizes glyphs to the staff
const GLYPH_SIZE = STAFF_H;
const HEAD_W = LINE_GAP * 1.18; // SMuFL notehead width
const STEM_LEN = LINE_GAP * 3.5;
const ACC_COL = LINE_GAP * 1.25; // one accidental column
const BEAM_TH = LINE_GAP * 0.5;
const BEAM_GAP = LINE_GAP * 0.78;
const EPS = 1e-6;

/**
 * Which column each accidental in a chord sits in, counting leftward from the
 * notehead. Two accidentals close in pitch can't share a column, so the lower
 * one steps further left — the conventional zig-zag.
 */
function accidentalColumns(e: LaidEvent): {
  colOf: Map<number, number>;
  columns: number;
} {
  const colOf = new Map<number, number>();
  const placed: { step: number; col: number }[] = [];
  // top head first, which is the order engravers work in
  for (let i = e.heads.length - 1; i >= 0; i--) {
    if (!e.heads[i].accidental) continue;
    const step = e.heads[i].step;
    let col = 0;
    // an accidental glyph is roughly 3 staff steps tall
    while (placed.some((p) => p.col === col && Math.abs(p.step - step) < 3)) col++;
    colOf.set(i, col);
    placed.push({ step, col });
  }
  return {
    colOf,
    columns: placed.length ? Math.max(...placed.map((p) => p.col)) + 1 : 0,
  };
}

/**
 * Card-sized engraving of a brick, drawn with real SMuFL glyphs (Bravura or
 * Petaluma). lib/notation makes the musical decisions; this only draws them.
 * Content that isn't cleanly notatable says so rather than being guessed at.
 */
export function SheetPreview({
  brick,
  width = 186,
  font = 'classical',
}: {
  brick: Brick;
  width?: number;
  font?: SheetFontId;
}) {
  const check = notatable(brick);
  const layout = useMemo(
    () => (check.ok ? layoutSheet(brick) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brick, check.ok]
  );

  if (!check.ok || !layout) {
    return (
      <div className="sheet-unsupported">♪ {(!check.ok && check.reason) || ''}</div>
    );
  }

  const family = familyFor(font);
  const events = layout.events;

  // headroom for ledger lines and stems on both sides
  let minStep = -1;
  let maxStep = 9;
  for (const e of events) {
    for (const h of e.heads) {
      minStep = Math.min(minStep, h.step);
      maxStep = Math.max(maxStep, h.step);
    }
  }
  const padTop = (maxStep - 8) * STEP + 16;
  const padBottom = -minStep * STEP + 12;
  const height = padTop + STAFF_H + padBottom;
  const staffTop = padTop;
  const yOf = (step: number) => staffTop + STAFF_H - step * STEP;

  // Prelude widths follow the glyphs' real advance so nothing collides: a
  // clef is about 3.2 staff spaces wide, an accidental 0.9, a time signature
  // 2.2 (both digits share one column).
  const clefX = 1;
  const clefW = LINE_GAP * 3.2;
  const keySigX = clefX + clefW + LINE_GAP * 0.3;
  const keySigW = layout.keySig.length * LINE_GAP * 0.9;
  const timeSigX = keySigX + keySigW + LINE_GAP * 0.4;
  const timeSigW = LINE_GAP * 2.2;
  const preludeW = timeSigX + timeSigW + LINE_GAP * 0.5;

  // ---- horizontal spacing ----
  // Accidentals hang to the LEFT of their notehead, so they need reserved
  // space; without it they print on top of whatever came before. Each note
  // that carries one pushes itself (and everything after) right, and the
  // beat spacing is computed from what's left so the staff still fits.
  const accCols = events.map(accidentalColumns);
  const accSpace = accCols.map((a) =>
    a.columns ? a.columns * ACC_COL + LINE_GAP * 0.2 : 0
  );

  const shiftAt: number[] = [];
  let running = 0;
  for (let i = 0; i < events.length; i++) {
    running += accSpace[i];
    shiftAt.push(running);
  }

  const pxPerBeat = Math.max(
    9,
    (width - preludeW - 6 - running) / Math.max(1, layout.totalBeats)
  );
  const xs = events.map(
    (e, i) => preludeW + e.startBeat * pxPerBeat + shiftAt[i]
  );
  /** Beat → x, carrying the shift of every event that starts before it. */
  const xOfBeat = (beat: number) => {
    let s = 0;
    for (let i = 0; i < events.length; i++) {
      if (events[i].startBeat < beat - EPS) s = shiftAt[i];
      else break;
    }
    return preludeW + beat * pxPerBeat + s;
  };

  const glyph = (
    key: string | number,
    x: number,
    y: number,
    text: string,
    cls = 'sheet-glyph'
  ) => (
    <text
      key={key}
      x={x}
      y={y}
      className={cls}
      fontFamily={family}
      fontSize={GLYPH_SIZE}
    >
      {text}
    </text>
  );

  // ---- beam geometry ----
  // Each beamed note's stem must reach a common straight line. Fit that line
  // through the first and last note's natural stem ends, clamp the slope so a
  // wide leap doesn't produce a ski jump, then push the whole line out until
  // no stem in the group is shorter than it should be.
  const stemXOf = (i: number) =>
    xs[i] + (events[i].stemUp ? HEAD_W - 0.5 : 0.5);
  const extremeStep = (e: LaidEvent) =>
    e.stemUp ? e.heads[e.heads.length - 1].step : e.heads[0].step;

  const beamLines = new Map<
    number,
    { x1: number; y1: number; x2: number; y2: number }
  >();
  for (const beam of layout.beams) {
    const idx = beam.eventIndices;
    const bxs = idx.map(stemXOf);
    const reqs = idx.map((i) =>
      beam.stemUp
        ? yOf(extremeStep(events[i])) - STEM_LEN
        : yOf(extremeStep(events[i])) + STEM_LEN
    );
    const span = bxs[bxs.length - 1] - bxs[0] || 1;
    let slope = (reqs[reqs.length - 1] - reqs[0]) / span;
    const MAX_SLOPE = 0.28;
    slope = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, slope));
    const cs = reqs.map((r, k) => r - slope * (bxs[k] - bxs[0]));
    const c = beam.stemUp ? Math.min(...cs) : Math.max(...cs);
    beamLines.set(beam.id, {
      x1: bxs[0],
      y1: c,
      x2: bxs[bxs.length - 1],
      y2: c + slope * span,
    });
  }
  const beamYAt = (id: number, x: number) => {
    const L = beamLines.get(id);
    if (!L) return null;
    const t = (x - L.x1) / (L.x2 - L.x1 || 1);
    return L.y1 + t * (L.y2 - L.y1);
  };

  return (
    <svg
      className="sheet-preview"
      width={width}
      height={height}
      role="img"
      aria-label={`Sheet music preview of ${brick.name}`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={2}
          x2={width - 2}
          y1={staffTop + i * LINE_GAP}
          y2={staffTop + i * LINE_GAP}
          className="sheet-line"
        />
      ))}

      {/* clef: gClef's origin sits on the G line (step 2), fClef's on F (step 6) */}
      {layout.clef === 'treble'
        ? glyph('clef', clefX, yOf(2), GLYPH.gClef)
        : glyph('clef', clefX, yOf(6), GLYPH.fClef)}

      {layout.keySig.map((k, i) =>
        glyph(
          `ks${i}`,
          keySigX + i * LINE_GAP * 0.9,
          yOf(k.step),
          ACCIDENTAL_FOR[k.glyph] ?? ''
        )
      )}

      {/* time signature: numerator over denominator, each centred in a half */}
      {glyph('tsn', timeSigX, yOf(6), timeSigGlyphs(layout.timeSig.num))}
      {glyph('tsd', timeSigX, yOf(2), timeSigGlyphs(layout.timeSig.den))}

      {layout.barlines.map((b) => (
        <line
          key={b}
          x1={xOfBeat(b) - 2}
          x2={xOfBeat(b) - 2}
          y1={staffTop}
          y2={staffTop + STAFF_H}
          className="sheet-bar"
        />
      ))}

      {events.map((e, i) =>
        e.kind === 'note' ? (
          <NoteGlyph
            key={i}
            e={e}
            x={xs[i]}
            tieEndX={xOfBeat(e.startBeat + e.beats)}
            yOf={yOf}
            family={family}
            glyph={glyph}
            accCol={accCols[i].colOf}
            beamY={
              e.beamId == null ? null : beamYAt(e.beamId, stemXOf(i))
            }
          />
        ) : (
          <g key={i}>
            {glyph(
              `r${i}`,
              xs[i] + 2,
              // whole rest hangs from the 4th line; the rest sit on the middle
              yOf(e.base === 'w' ? 6 : 4),
              REST_FOR[e.base] ?? GLYPH.restQuarter
            )}
            {e.dotted &&
              glyph(`rd${i}`, xs[i] + 9, yOf(5), GLYPH.augmentationDot)}
          </g>
        )
      )}

      {/* beams: one primary bar per group, a second for 16ths */}
      {layout.beams.map((beam) => {
        const L = beamLines.get(beam.id);
        if (!L) return null;
        const dir = beam.stemUp ? 1 : -1; // beams stack toward the noteheads
        const bar = (
          k: string,
          x1: number,
          y1: number,
          x2: number,
          y2: number
        ) => (
          <polygon
            key={k}
            className="sheet-beam"
            points={`${x1},${y1} ${x2},${y2} ${x2},${y2 + BEAM_TH} ${x1},${y1 + BEAM_TH}`}
          />
        );
        const out: ReactNode[] = [bar(`b${beam.id}`, L.x1, L.y1, L.x2, L.y2)];

        // secondary beam: full segment between adjacent 16ths, a stub for a
        // 16th that sits alone among eighths
        const idx = beam.eventIndices;
        for (let k = 0; k < idx.length; k++) {
          if (events[idx[k]].base !== '16') continue;
          const xHere = stemXOf(idx[k]);
          const prev16 = k > 0 && events[idx[k - 1]].base === '16';
          const next16 =
            k < idx.length - 1 && events[idx[k + 1]].base === '16';
          if (next16) {
            const xNext = stemXOf(idx[k + 1]);
            out.push(
              bar(
                `b${beam.id}s${k}`,
                xHere,
                (beamYAt(beam.id, xHere) ?? 0) + dir * BEAM_GAP,
                xNext,
                (beamYAt(beam.id, xNext) ?? 0) + dir * BEAM_GAP
              )
            );
          } else if (!prev16) {
            const stub = LINE_GAP * 1.1;
            const xa = k === 0 ? xHere : xHere - stub;
            const xb = k === 0 ? xHere + stub : xHere;
            out.push(
              bar(
                `b${beam.id}h${k}`,
                xa,
                (beamYAt(beam.id, xa) ?? 0) + dir * BEAM_GAP,
                xb,
                (beamYAt(beam.id, xb) ?? 0) + dir * BEAM_GAP
              )
            );
          }
        }
        return <g key={beam.id}>{out}</g>;
      })}
    </svg>
  );
}

function NoteGlyph({
  e,
  x,
  tieEndX,
  yOf,
  family,
  glyph,
  accCol,
  beamY,
}: {
  e: LaidEvent;
  x: number;
  tieEndX: number;
  yOf: (s: number) => number;
  family: string;
  glyph: (
    key: string | number,
    x: number,
    y: number,
    text: string,
    cls?: string
  ) => ReactNode;
  accCol: Map<number, number>;
  /** When beamed, the y the stem must reach; the beam replaces the flag. */
  beamY: number | null;
}) {
  const head = NOTEHEAD_FOR[e.base] ?? GLYPH.noteheadBlack;
  const flags = e.base === '8' ? 1 : e.base === '16' ? 2 : 0;
  const top = e.heads[e.heads.length - 1];
  const bottom = e.heads[0];
  const stemX = e.stemUp ? x + HEAD_W - 0.5 : x + 0.5;
  const stemY1 = e.stemUp ? yOf(bottom.step) : yOf(top.step);
  const stemY2 =
    beamY ??
    (e.stemUp ? yOf(top.step) - STEM_LEN : yOf(bottom.step) + STEM_LEN);

  return (
    <g>
      {/* ledger lines */}
      {e.heads.map((h, i) => {
        const lines: number[] = [];
        if (h.step <= -2) for (let s = -2; s >= h.step; s -= 2) lines.push(s);
        else if (h.step >= 10) for (let s = 10; s <= h.step; s += 2) lines.push(s);
        return lines.map((s) => (
          <line
            key={`${i}-${s}`}
            x1={x - 2.5}
            x2={x + HEAD_W + 2.5}
            y1={yOf(s)}
            y2={yOf(s)}
            className="sheet-line"
          />
        ));
      })}

      {e.heads.map((h, i) => (
        <g key={i}>
          {h.accidental &&
            glyph(
              `acc${i}`,
              // column 0 sits nearest the head; further columns step left
              x - ((accCol.get(i) ?? 0) + 1) * ACC_COL,
              yOf(h.step),
              ACCIDENTAL_FOR[h.accidental] ?? ''
            )}
          {glyph(`head${i}`, x, yOf(h.step), head)}
          {e.dotted &&
            glyph(
              `dot${i}`,
              x + HEAD_W + 1.5,
              // dots sit in a space, never on a line
              yOf(h.step % 2 === 0 ? h.step + 1 : h.step),
              GLYPH.augmentationDot
            )}
        </g>
      ))}

      {e.base !== 'w' && (
        <line
          x1={stemX}
          y1={stemY1}
          x2={stemX}
          y2={stemY2}
          className="sheet-stem"
        />
      )}

      {flags > 0 && beamY === null && (
        <text
          x={stemX}
          y={stemY2}
          className="sheet-glyph"
          fontFamily={family}
          fontSize={GLYPH_SIZE}
        >
          {e.stemUp
            ? flags === 1
              ? GLYPH.flag8thUp
              : GLYPH.flag16thUp
            : flags === 1
              ? GLYPH.flag8thDown
              : GLYPH.flag16thDown}
        </text>
      )}

      {e.tieToNext && (
        <path
          d={`M ${x + 2} ${yOf(bottom.step) + (e.stemUp ? 5 : -5)} q ${
            (tieEndX - x) / 2
          } ${e.stemUp ? 5 : -5}, ${tieEndX - x} 0`}
          className="sheet-tie"
        />
      )}
    </g>
  );
}
