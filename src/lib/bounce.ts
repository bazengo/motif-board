import { nanoid } from 'nanoid';
import type {
  Brick,
  Mix,
  Note,
  TimelineSection,
  InstrumentId,
} from '../types';
import { mixAllItems, mixBpm, mixLengthBeats } from './mix';
import { evaluateAutomation } from './automation';
import { buildTimelinePlan } from './timeline';

export interface Bounce {
  name: string;
  notes: Note[];
  lengthBeats: number;
  bpm: number;
  instrument: InstrumentId;
  percussion: boolean;
}

/**
 * Flattening sums every layer into ONE voice, so the result carries a single
 * instrument. A mix that's entirely percussion bounces to a drum card;
 * otherwise it becomes melodic on the first melodic layer's instrument (drum
 * hits in a mixed bounce then read as pitched — inherent to summing).
 */
function chooseVoice(bricks: Brick[]): {
  instrument: InstrumentId;
  percussion: boolean;
} {
  if (bricks.length > 0 && bricks.every((b) => b.percussion)) {
    return { instrument: bricks[0].instrument, percussion: true };
  }
  const melodic = bricks.find((b) => !b.percussion);
  return { instrument: melodic?.instrument ?? 'triangle', percussion: false };
}

/** Flatten a mix into a single brick's worth of notes (one full pass). */
export function bounceMix(mix: Mix, bricks: Brick[], globalBpm: number): Bounce {
  const bpm = mixBpm(mix, globalBpm);
  const loopBeats = mixLengthBeats(mix, bricks);
  const items = mixAllItems(mix, bricks);
  const notes: Note[] = [];
  const used: Brick[] = [];

  for (const it of items) {
    used.push(it.brick);
    const brickLen = it.brick.lengthBeats > 0 ? it.brick.lengthBeats : loopBeats;
    // short clips loop to fill the pass, matching playback
    const passes = it.loop ? Math.max(1, Math.ceil(loopBeats / brickLen)) : 1;
    for (let p = 0; p < passes; p++) {
      const offset = p * brickLen;
      for (const n of it.brick.notes) {
        const startBeat = offset + n.start;
        if (startBeat >= loopBeats - 1e-9) continue;
        const auto = evaluateAutomation(it.automation, startBeat / loopBeats);
        const velocity = clamp01(n.velocity * it.gain * auto);
        if (velocity <= 0.01) continue; // muted / faded out
        notes.push({
          id: nanoid(8),
          pitch: n.pitch,
          start: startBeat,
          duration: n.duration,
          velocity,
        });
      }
    }
  }

  return {
    name: `${mix.name} (bounce)`,
    notes,
    lengthBeats: Math.max(1, loopBeats),
    bpm,
    ...chooseVoice(used),
  };
}

/**
 * Flatten the whole arrangement into one brick. The plan is absolute seconds
 * (per-section tempo baked in); we express it in beats at the project tempo,
 * so the real-time length is preserved.
 */
export function bounceTimeline(
  timeline: TimelineSection[],
  mixes: Mix[],
  bricks: Brick[],
  globalBpm: number
): Bounce {
  const bpm = Number.isFinite(globalBpm) && globalBpm > 0 ? globalBpm : 120;
  const secPerBeat = 60 / bpm;
  const plan = buildTimelinePlan(timeline, mixes, bricks, globalBpm);

  const notes: Note[] = plan.notes.map((n) => ({
    id: nanoid(8),
    pitch: n.pitch,
    start: n.time / secPerBeat,
    duration: Math.max(0.0625, n.dur / secPerBeat),
    velocity: clamp01(n.velocity),
  }));

  const used = [
    ...new Map(plan.notes.map((n) => [n.brick.id, n.brick])).values(),
  ];
  // round the length up to a 16th so nothing is clipped
  const lengthBeats = Math.max(
    1,
    Math.ceil((plan.totalSeconds / secPerBeat) * 4) / 4
  );

  return {
    name: 'Arrangement (bounce)',
    notes,
    lengthBeats,
    bpm,
    ...chooseVoice(used),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
