import type { Brick, Mix, MixLayer, Note, TimelineSection } from '../../types';
import { DEFAULT_DISPLAY, DEFAULT_ENVELOPE } from '../../types';

let n = 0;
const uid = (p: string) => `${p}${++n}`;

export function testNote(partial: Partial<Note> = {}): Note {
  return {
    id: uid('n'),
    pitch: 60,
    start: 0,
    duration: 1,
    velocity: 0.8,
    ...partial,
  };
}

export function testBrick(partial: Partial<Brick> = {}): Brick {
  return {
    id: uid('b'),
    name: 'Brick',
    color: '#ffd166',
    tags: [],
    notes: [],
    chords: '',
    lyrics: '',
    processNotes: '',
    key: 'C major',
    bpm: 120,
    lengthBeats: 8,
    instrument: 'triangle',
    timeSig: { num: 4, den: 4 },
    board: { x: 0, y: 0, rotation: 0 },
    parentId: null,
    display: { ...DEFAULT_DISPLAY },
    percussion: false,
    envelope: { ...DEFAULT_ENVELOPE },
    ...partial,
  };
}

export function testLayer(brickId: string, partial: Partial<MixLayer> = {}): MixLayer {
  return { brickId, loop: true, mute: false, solo: false, gain: 0.8, ...partial };
}

export function testMix(partial: Partial<Mix> = {}): Mix {
  return {
    id: uid('m'),
    name: 'Mix',
    color: '#7bdff2',
    board: { x: 0, y: 0 },
    layers: [],
    notes: '',
    lockBpm: true,
    bpm: 120,
    ...partial,
  };
}

export function testSection(
  mixId: string,
  partial: Partial<TimelineSection> = {}
): TimelineSection {
  return {
    id: uid('s'),
    mixId,
    repeats: 1,
    lockBpm: true,
    bpm: 120,
    timeSig: { num: 4, den: 4 },
    ...partial,
  };
}
