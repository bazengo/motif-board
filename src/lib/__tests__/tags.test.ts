import { describe, it, expect } from 'vitest';
import {
  parseHashtags,
  stripHashtags,
  allTags,
  tagsForBrick,
  tagsForMix,
  matchesTags,
} from '../tags';
import { testBrick, testMix, testLayer } from './fixtures';

describe('parseHashtags', () => {
  it('finds tags and lowercases them', () => {
    expect(parseHashtags('a #Verse and a #hook')).toEqual(['verse', 'hook']);
  });

  it('de-duplicates', () => {
    expect(parseHashtags('#a #a #A')).toEqual(['a']);
  });

  it('allows digits, dashes and underscores', () => {
    expect(parseHashtags('#idea-2 #take_3')).toEqual(['idea-2', 'take_3']);
  });

  it('returns nothing for text without tags', () => {
    expect(parseHashtags('just a plain note')).toEqual([]);
  });
});

describe('stripHashtags', () => {
  it('removes tags from the displayed text', () => {
    expect(stripHashtags('a moody idea #verse')).toBe('a moody idea');
  });

  it('leaves the rest of the text intact across lines', () => {
    expect(stripHashtags('line one #a\nline two')).toBe('line one\nline two');
  });

  it('returns empty when the note was only tags', () => {
    expect(stripHashtags('#a #b')).toBe('');
  });
});

describe('allTags', () => {
  it('lists mixes first, then hashtags alphabetically', () => {
    const brick = testBrick({ processNotes: '#zeta #alpha' });
    const mix = testMix({ name: 'Chorus' });
    const tags = allTags([brick], [mix]);
    expect(tags.map((t) => t.label)).toEqual(['Chorus', '#alpha', '#zeta']);
  });

  it('merges tags coming from mix notes', () => {
    const mix = testMix({ notes: '#bridge' });
    expect(allTags([], [mix]).some((t) => t.id === '#bridge')).toBe(true);
  });

  it('does not duplicate a tag used in several places', () => {
    const a = testBrick({ processNotes: '#hook' });
    const b = testBrick({ processNotes: '#hook' });
    expect(allTags([a, b], []).filter((t) => t.id === '#hook')).toHaveLength(1);
  });
});

describe('tagsForBrick', () => {
  it('includes the mixes the brick belongs to', () => {
    const brick = testBrick();
    const mix = testMix({ name: 'Verse', layers: [testLayer(brick.id)] });
    const tags = tagsForBrick(brick, [mix]);
    expect(tags.map((t) => t.id)).toContain(`mix:${mix.id}`);
  });

  it('excludes mixes it is not part of', () => {
    const brick = testBrick();
    const mix = testMix({ layers: [] });
    expect(tagsForBrick(brick, [mix])).toHaveLength(0);
  });

  it('includes its own hashtags', () => {
    const brick = testBrick({ processNotes: '#idea' });
    expect(tagsForBrick(brick, []).map((t) => t.id)).toEqual(['#idea']);
  });
});

describe('matchesTags', () => {
  const mix = testMix();
  const brick = testBrick({ processNotes: '#verse' });

  it('matches everything when no filter is active', () => {
    expect(matchesTags(tagsForBrick(brick, []), [])).toBe(true);
  });

  it('matches when any active tag is present', () => {
    expect(matchesTags(tagsForBrick(brick, []), ['#verse', '#other'])).toBe(true);
  });

  it('rejects when none are present', () => {
    expect(matchesTags(tagsForBrick(brick, []), ['#chorus'])).toBe(false);
  });

  it('treats a mix as a tag', () => {
    expect(matchesTags(tagsForMix(mix), [`mix:${mix.id}`])).toBe(true);
  });
});
