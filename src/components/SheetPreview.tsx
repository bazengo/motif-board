import { useMemo } from 'react';
import { notatable, layoutSheet, type LaidEvent } from '../lib/notation';
import type { Brick } from '../types';

const LINE_GAP = 6; // px between staff lines
const STEP = LINE_GAP / 2; // one diatonic step
const STAFF_H = LINE_GAP * 4;

/**
 * Card-sized engraving of a brick. Draws what lib/notation lays out; when the
 * content isn't cleanly notatable it says so instead of guessing.
 */
export function SheetPreview({ brick, width = 186 }: { brick: Brick; width?: number }) {
  const check = notatable(brick);
  const layout = useMemo(
    () => (check.ok ? layoutSheet(brick) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brick, check.ok]
  );

  if (!check.ok || !layout) {
    return <div className="sheet-unsupported">♪ {(!check.ok && check.reason) || ''}</div>;
  }

  // vertical: leave headroom for ledger lines both sides
  let minStep = 0;
  let maxStep = 8;
  for (const e of layout.events) {
    for (const h of e.heads) {
      minStep = Math.min(minStep, h.step);
      maxStep = Math.max(maxStep, h.step);
    }
  }
  const padTop = Math.max(2, maxStep - 8) * STEP + 8;
  const height = padTop + STAFF_H + Math.max(2, -minStep) * STEP + 8;
  const staffTop = padTop;
  const yOf = (step: number) => staffTop + STAFF_H - step * STEP;

  // horizontal: fixed prelude (clef + key + time), then beats spread evenly
  const preludeW = 16 + layout.keySig.length * 6 + 12;
  const pxPerBeat = Math.max(10, (width - preludeW - 6) / layout.totalBeats);
  const xOf = (beat: number) => preludeW + beat * pxPerBeat;

  return (
    <svg
      className="sheet-preview"
      width={width}
      height={height}
      role="img"
      aria-label={`Sheet music preview of ${brick.name}`}
    >
      {/* staff lines */}
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

      {/* clef */}
      <text
        x={3}
        y={staffTop + (layout.clef === 'treble' ? STAFF_H - 3 : LINE_GAP + 5)}
        className={`sheet-clef ${layout.clef}`}
      >
        {layout.clef === 'treble' ? '𝄞' : '𝄢'}
      </text>

      {/* key signature */}
      {layout.keySig.map((k, i) => (
        <text key={i} x={16 + i * 6} y={yOf(k.step) + 3} className="sheet-acc">
          {k.glyph}
        </text>
      ))}

      {/* time signature */}
      <text x={preludeW - 10} y={staffTop + LINE_GAP + 3} className="sheet-time">
        {layout.timeSig.num}
      </text>
      <text x={preludeW - 10} y={staffTop + 3 * LINE_GAP + 3} className="sheet-time">
        {layout.timeSig.den}
      </text>

      {/* barlines */}
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
          <NoteGlyph key={i} e={e} xOf={xOf} yOf={yOf} staffTop={staffTop} />
        ) : (
          <RestGlyph key={i} e={e} x={xOf(e.startBeat)} staffTop={staffTop} />
        )
      )}
    </svg>
  );
}

function NoteGlyph({
  e,
  xOf,
  yOf,
  staffTop,
}: {
  e: LaidEvent;
  xOf: (b: number) => number;
  yOf: (s: number) => number;
  staffTop: number;
}) {
  const x = xOf(e.startBeat) + 3;
  const hollow = e.base === 'w' || e.base === 'h';
  const flags = e.base === '8' ? 1 : e.base === '16' ? 2 : 0;
  const top = e.heads[e.heads.length - 1];
  const bottom = e.heads[0];
  const stemX = e.stemUp ? x + 3.2 : x - 3.2;
  const stemY1 = e.stemUp ? yOf(bottom.step) : yOf(top.step);
  const stemY2 = e.stemUp ? yOf(top.step) - 18 : yOf(bottom.step) + 18;

  return (
    <g>
      {/* ledger lines */}
      {e.heads.map((h, i) => {
        const lines = [];
        if (h.step <= -2) {
          for (let s = -2; s >= h.step; s -= 2) lines.push(s);
        } else if (h.step >= 10) {
          for (let s = 10; s <= h.step; s += 2) lines.push(s);
        }
        return lines.map((s) => (
          <line
            key={`${i}-${s}`}
            x1={x - 5.5}
            x2={x + 5.5}
            y1={yOf(s)}
            y2={yOf(s)}
            className="sheet-line"
          />
        ));
      })}

      {e.heads.map((h, i) => (
        <g key={i}>
          {h.accidental && (
            <text x={x - 10} y={yOf(h.step) + 3} className="sheet-acc">
              {h.accidental}
            </text>
          )}
          <ellipse
            cx={x}
            cy={yOf(h.step)}
            rx={3.4}
            ry={2.6}
            transform={`rotate(-18 ${x} ${yOf(h.step)})`}
            className={hollow ? 'sheet-head hollow' : 'sheet-head'}
          />
          {e.dotted && <circle cx={x + 6.5} cy={yOf(h.step) - 1.5} r={1.2} className="sheet-dot" />}
        </g>
      ))}

      {e.base !== 'w' && (
        <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} className="sheet-stem" />
      )}

      {Array.from({ length: flags }).map((_, i) => (
        <path
          key={i}
          d={
            e.stemUp
              ? `M ${stemX} ${stemY2 + i * 4} c 5 1.5, 6 4.5, 3.5 8.5`
              : `M ${stemX} ${stemY2 - i * 4} c 5 -1.5, 6 -4.5, 3.5 -8.5`
          }
          className="sheet-flag"
        />
      ))}

      {e.tieToNext && (
        <path
          d={`M ${x + 5} ${yOf(bottom.step) + (e.stemUp ? 4 : -4)} q ${
            (xOf(e.startBeat + e.beats) - x) / 2
          } ${e.stemUp ? 5 : -5}, ${xOf(e.startBeat + e.beats) - x - 1} 0`}
          className="sheet-tie"
        />
      )}
      {/* keep staffTop referenced for future beaming work */}
      <g data-staff-top={staffTop} />
    </g>
  );
}

function RestGlyph({ e, x, staffTop }: { e: LaidEvent; x: number; staffTop: number }) {
  const midY = staffTop + LINE_GAP * 2;
  if (e.base === 'w') {
    return <rect x={x + 1} y={staffTop + LINE_GAP} width={7} height={2.6} className="sheet-resthang" />;
  }
  if (e.base === 'h') {
    return <rect x={x + 1} y={midY - 2.6} width={7} height={2.6} className="sheet-resthang" />;
  }
  if (e.base === 'q') {
    return (
      <path
        d={`M ${x + 3} ${midY - 7} l 3.5 4 l -3 3 l 3.5 4 q -4.5 -1.5 -3.5 3`}
        className="sheet-restq"
      />
    );
  }
  const hooks = e.base === '16' ? 2 : 1;
  return (
    <g>
      <line x1={x + 5.5} y1={midY - 5} x2={x + 3} y2={midY + 6} className="sheet-stem" />
      {Array.from({ length: hooks }).map((_, i) => (
        <circle key={i} cx={x + 2.5} cy={midY - 4 + i * 4} r={1.4} className="sheet-dot" />
      ))}
      {e.dotted && <circle cx={x + 9} cy={midY} r={1.2} className="sheet-dot" />}
    </g>
  );
}
