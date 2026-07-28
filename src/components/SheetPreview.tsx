import { useMemo } from 'react';
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

  // headroom for ledger lines and stems on both sides
  let minStep = -1;
  let maxStep = 9;
  for (const e of layout.events) {
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

  const pxPerBeat = Math.max(9, (width - preludeW - 6) / layout.totalBeats);
  const xOf = (beat: number) => preludeW + beat * pxPerBeat;

  const glyph = (
    key: string | number,
    x: number,
    y: number,
    text: string,
    scale = 1,
    cls = 'sheet-glyph'
  ) => (
    <text
      key={key}
      x={x}
      y={y}
      className={cls}
      fontFamily={family}
      fontSize={GLYPH_SIZE * scale}
    >
      {text}
    </text>
  );

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
          x1={xOf(b) - 2}
          x2={xOf(b) - 2}
          y1={staffTop}
          y2={staffTop + STAFF_H}
          className="sheet-bar"
        />
      ))}

      {layout.events.map((e, i) =>
        e.kind === 'note' ? (
          <NoteGlyph
            key={i}
            e={e}
            xOf={xOf}
            yOf={yOf}
            family={family}
            glyph={glyph}
          />
        ) : (
          <g key={i}>
            {glyph(
              `r${i}`,
              xOf(e.startBeat) + 2,
              // whole rest hangs from the 4th line; the rest sit on the middle
              yOf(e.base === 'w' ? 6 : 4),
              REST_FOR[e.base] ?? GLYPH.restQuarter
            )}
            {e.dotted &&
              glyph(`rd${i}`, xOf(e.startBeat) + 9, yOf(5), GLYPH.augmentationDot)}
          </g>
        )
      )}
    </svg>
  );
}

function NoteGlyph({
  e,
  xOf,
  yOf,
  family,
  glyph,
}: {
  e: LaidEvent;
  xOf: (b: number) => number;
  yOf: (s: number) => number;
  family: string;
  glyph: (
    key: string | number,
    x: number,
    y: number,
    text: string,
    scale?: number,
    cls?: string
  ) => React.ReactNode;
}) {
  const x = xOf(e.startBeat) + 3;
  const head = NOTEHEAD_FOR[e.base] ?? GLYPH.noteheadBlack;
  const flags = e.base === '8' ? 1 : e.base === '16' ? 2 : 0;
  const top = e.heads[e.heads.length - 1];
  const bottom = e.heads[0];
  // notehead is ~1.18 staff spaces wide in SMuFL; the stem rides its edge
  const headW = LINE_GAP * 1.18;
  const stemX = e.stemUp ? x + headW - 0.5 : x + 0.5;
  const stemY1 = e.stemUp ? yOf(bottom.step) : yOf(top.step);
  const stemLen = LINE_GAP * 3.5;
  const stemY2 = e.stemUp
    ? yOf(top.step) - stemLen
    : yOf(bottom.step) + stemLen;

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
            x2={x + headW + 2.5}
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
              x - LINE_GAP * 1.5,
              yOf(h.step),
              ACCIDENTAL_FOR[h.accidental] ?? ''
            )}
          {glyph(`head${i}`, x, yOf(h.step), head)}
          {e.dotted &&
            glyph(
              `dot${i}`,
              x + headW + 1.5,
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

      {flags > 0 && (
        <text
          x={stemX}
          y={stemY2}
          className="sheet-glyph"
          fontFamily={family}
          fontSize={LINE_GAP * 4}
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
            (xOf(e.startBeat + e.beats) - x) / 2
          } ${e.stemUp ? 5 : -5}, ${xOf(e.startBeat + e.beats) - x} 0`}
          className="sheet-tie"
        />
      )}
    </g>
  );
}
