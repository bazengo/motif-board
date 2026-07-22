import { describe, it, expect } from 'vitest';
import {
  GM_DRUMS,
  DRUM_PITCHES,
  DRUM_CHANNEL,
  drumName,
  drumShortName,
} from '../drums';

describe('GM drum map', () => {
  it('uses MIDI channel 10 (zero-based 9)', () => {
    expect(DRUM_CHANNEL).toBe(9);
  });

  it('covers the standard GM percussion range', () => {
    expect(Math.min(...DRUM_PITCHES)).toBe(35);
    expect(Math.max(...DRUM_PITCHES)).toBe(81);
  });

  it('lists pitches high to low so cymbals sit above the kick', () => {
    expect(DRUM_PITCHES).toEqual([...DRUM_PITCHES].sort((a, b) => b - a));
  });

  it('has a name for every pitch it lists', () => {
    for (const p of DRUM_PITCHES) expect(GM_DRUMS[p]).toBeTruthy();
  });
});

describe('drumName', () => {
  it('names known drums', () => {
    expect(drumName(36)).toBe('Bass Drum 1');
    expect(drumName(38)).toBe('Acoustic Snare');
    expect(drumName(42)).toBe('Closed Hi-Hat');
  });

  it('falls back for pitches outside the map', () => {
    expect(drumName(20)).toBe('Perc 20');
  });
});

describe('drumShortName', () => {
  it('abbreviates for narrow note blocks', () => {
    expect(drumShortName(38)).toBe('Snare');
    expect(drumShortName(42)).toBe('Closed HH');
    expect(drumShortName(49)).toBe('Crash Cym 1');
  });

  it('falls back for unmapped pitches', () => {
    expect(drumShortName(20)).toBe('P20');
  });
});
