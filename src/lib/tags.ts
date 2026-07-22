import type { Brick, Mix } from '../types';

// Tags come from two places:
//  - #hashtags typed into a brick's process notes or a mix's notes
//  - each mix is itself a tag (its members carry it)

export interface Tag {
  id: string; // "#verse" or "mix:<id>"
  label: string;
  color: string;
  kind: 'text' | 'mix';
}

const TEXT_TAG_COLOR = '#8ecae6';
const HASHTAG_RE = /#([\p{L}\p{N}_-]+)/gu;

/** Pull #hashtags out of a block of text. */
export function parseHashtags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HASHTAG_RE)) out.push(m[1].toLowerCase());
  return [...new Set(out)];
}

export function brickTextTags(brick: Brick): string[] {
  return parseHashtags(brick.processNotes ?? '');
}

export function mixTextTags(mix: Mix): string[] {
  return parseHashtags(mix.notes ?? '');
}

/** Every tag in the project, mixes first then hashtags alphabetically. */
export function allTags(bricks: Brick[], mixes: Mix[]): Tag[] {
  const tags: Tag[] = mixes.map((m) => ({
    id: `mix:${m.id}`,
    label: m.name,
    color: m.color,
    kind: 'mix' as const,
  }));

  const text = new Set<string>();
  for (const b of bricks) brickTextTags(b).forEach((t) => text.add(t));
  for (const m of mixes) mixTextTags(m).forEach((t) => text.add(t));

  for (const t of [...text].sort()) {
    tags.push({
      id: `#${t}`,
      label: `#${t}`,
      color: TEXT_TAG_COLOR,
      kind: 'text',
    });
  }
  return tags;
}

/** Tags carried by a brick: its hashtags plus the mixes it belongs to. */
export function tagsForBrick(brick: Brick, mixes: Mix[]): Tag[] {
  const out: Tag[] = mixes
    .filter((m) => m.layers.some((l) => l.brickId === brick.id))
    .map((m) => ({
      id: `mix:${m.id}`,
      label: m.name,
      color: m.color,
      kind: 'mix' as const,
    }));
  for (const t of brickTextTags(brick)) {
    out.push({ id: `#${t}`, label: `#${t}`, color: TEXT_TAG_COLOR, kind: 'text' });
  }
  return out;
}

export function tagsForMix(mix: Mix): Tag[] {
  const out: Tag[] = [
    { id: `mix:${mix.id}`, label: mix.name, color: mix.color, kind: 'mix' },
  ];
  for (const t of mixTextTags(mix)) {
    out.push({ id: `#${t}`, label: `#${t}`, color: TEXT_TAG_COLOR, kind: 'text' });
  }
  return out;
}

/** With no active tags everything matches; otherwise match ANY active tag. */
export function matchesTags(itemTags: Tag[], active: string[]): boolean {
  if (active.length === 0) return true;
  const ids = new Set(itemTags.map((t) => t.id));
  return active.some((a) => ids.has(a));
}
