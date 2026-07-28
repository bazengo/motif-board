/**
 * SMuFL glyph codepoints (Standard Music Font Layout), as implemented by
 * Bravura and Petaluma. Both fonts use the same codepoints, so switching
 * engraving style is purely a font-family change.
 *
 * Metrics that matter for placement: the em square is 4 staff spaces, so a
 * font-size equal to the staff height gives correctly-proportioned glyphs.
 * Each glyph's origin sits where it attaches to the staff — a notehead's
 * baseline runs through its own middle, a clef's through the line it names.
 *
 * Codepoints are written as escapes rather than literal Private Use Area
 * characters so the source stays readable and encoding-proof.
 */
export const GLYPH = {
  gClef: '',
  fClef: '',

  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',

  flag8thUp: '',
  flag8thDown: '',
  flag16thUp: '',
  flag16thDown: '',

  accidentalFlat: '',
  accidentalNatural: '',
  accidentalSharp: '',

  restWhole: '',
  restHalf: '',
  restQuarter: '',
  rest8th: '',
  rest16th: '',

  augmentationDot: '',
} as const;

/** Time-signature numerals live at U+E080 + digit. */
export function timeSigGlyphs(n: number): string {
  return String(n)
    .split('')
    .map((d) => String.fromCharCode(0xe080 + Number(d)))
    .join('');
}

export const NOTEHEAD_FOR: Record<string, string> = {
  w: GLYPH.noteheadWhole,
  h: GLYPH.noteheadHalf,
  q: GLYPH.noteheadBlack,
  '8': GLYPH.noteheadBlack,
  '16': GLYPH.noteheadBlack,
};

export const REST_FOR: Record<string, string> = {
  w: GLYPH.restWhole,
  h: GLYPH.restHalf,
  q: GLYPH.restQuarter,
  '8': GLYPH.rest8th,
  '16': GLYPH.rest16th,
};

export const ACCIDENTAL_FOR: Record<string, string> = {
  '♯': GLYPH.accidentalSharp, // ♯
  '♭': GLYPH.accidentalFlat, // ♭
  '♮': GLYPH.accidentalNatural, // ♮
};

/** Available engraving styles. Same glyphs, different hand. */
export const SHEET_FONTS = [
  { id: 'classical', label: 'Classical', family: 'Bravura' },
  { id: 'handwritten', label: 'Handwritten', family: 'Petaluma' },
] as const;

export type SheetFontId = (typeof SHEET_FONTS)[number]['id'];

export function familyFor(id: SheetFontId): string {
  return SHEET_FONTS.find((f) => f.id === id)?.family ?? 'Bravura';
}
