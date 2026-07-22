import type { Brick, Mix, TimelineSection } from '../types';
import { mixPlayItems } from './mix';

/** A mix is as long as its longest brick (in quarter-note beats). */
export function mixLengthBeats(mix: Mix, bricks: Brick[]): number {
  let len = 0;
  for (const l of mix.layers) {
    const b = bricks.find((x) => x.id === l.brickId);
    if (b) len = Math.max(len, b.lengthBeats);
  }
  return len || 4;
}

export function sectionBpm(section: TimelineSection, masterBpm: number): number {
  return section.lockBpm ? masterBpm : section.bpm;
}

/** Total beats a section occupies (mix length x repeats). */
export function sectionBeats(
  section: TimelineSection,
  mix: Mix,
  bricks: Brick[]
): number {
  return mixLengthBeats(mix, bricks) * Math.max(1, section.repeats);
}

export function sectionSeconds(
  section: TimelineSection,
  mix: Mix,
  bricks: Brick[],
  masterBpm: number
): number {
  return (
    sectionBeats(section, mix, bricks) * (60 / sectionBpm(section, masterBpm))
  );
}

export interface ScheduledNote {
  brick: Brick;
  pitch: number;
  time: number; // absolute seconds from timeline start
  dur: number; // seconds
  velocity: number;
}

export interface TimelinePlan {
  notes: ScheduledNote[];
  totalSeconds: number;
  /** Absolute start time (seconds) of each section, parallel to `timeline`. */
  starts: number[];
}

/**
 * Flatten the timeline into absolute-second note events. Per-section tempo is
 * baked into the times here, so playback/export never has to juggle a tempo
 * map — a constant-rate transport reproduces it exactly.
 */
export function buildTimelinePlan(
  timeline: TimelineSection[],
  mixes: Mix[],
  bricks: Brick[],
  masterBpm: number
): TimelinePlan {
  const notes: ScheduledNote[] = [];
  const starts: number[] = [];
  let t = 0;

  for (const section of timeline) {
    starts.push(t);
    const mix = mixes.find((m) => m.id === section.mixId);
    if (!mix) continue;

    const bpm = sectionBpm(section, masterBpm);
    const secPerBeat = 60 / bpm;
    const loopBeats = mixLengthBeats(mix, bricks);
    const repeats = Math.max(1, section.repeats);
    const items = mixPlayItems(mix, bricks);

    for (let r = 0; r < repeats; r++) {
      const base = t + r * loopBeats * secPerBeat;
      for (const { brick, gain } of items) {
        for (const n of brick.notes) {
          notes.push({
            brick,
            pitch: n.pitch,
            time: base + n.start * secPerBeat,
            dur: n.duration * secPerBeat,
            // layer gain is folded into velocity so one synth per brick is enough
            velocity: Math.max(0.01, Math.min(1, n.velocity * gain)),
          });
        }
      }
    }

    t += loopBeats * repeats * secPerBeat;
  }

  notes.sort((a, b) => a.time - b.time);
  return { notes, totalSeconds: t, starts };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
