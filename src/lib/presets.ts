import { nanoid } from 'nanoid';
import type { Brick, InstrumentPreset } from '../types';
import {
  DEFAULT_ENVELOPE,
  DEFAULT_FILTER,
  DEFAULT_FILTER_ENVELOPE,
} from '../types';

/** The sound-defining slice of a brick. */
export function presetFromBrick(brick: Brick, name: string): InstrumentPreset {
  return {
    id: nanoid(8),
    name,
    instrument: brick.instrument,
    percussion: brick.percussion,
    envelope: { ...(brick.envelope ?? DEFAULT_ENVELOPE) },
    filter: { ...(brick.filter ?? DEFAULT_FILTER) },
    filterEnvelope: { ...(brick.filterEnvelope ?? DEFAULT_FILTER_ENVELOPE) },
  };
}

/** Applied as a patch onto a brick — never touches notes, name or placement. */
export function presetPatch(preset: InstrumentPreset): Partial<Brick> {
  return {
    instrument: preset.instrument,
    percussion: preset.percussion,
    envelope: { ...preset.envelope },
    filter: { ...preset.filter },
    filterEnvelope: { ...preset.filterEnvelope },
  };
}

interface PresetFile {
  app: 'motif-board-instruments';
  version: 1;
  presets: InstrumentPreset[];
}

export function exportPresets(
  presets: InstrumentPreset[],
  filename = 'motif-board-instruments.json'
) {
  const data: PresetFile = {
    app: 'motif-board-instruments',
    version: 1,
    presets,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Read a preset file. Ids are reissued so importing into a project that
 * already has presets (or importing the same file twice) can't collide.
 */
export async function importPresets(file: File): Promise<InstrumentPreset[]> {
  const data = JSON.parse(await file.text()) as Partial<PresetFile>;
  if (data.app !== 'motif-board-instruments' || !Array.isArray(data.presets)) {
    throw new Error('Not a Motif Board instrument file.');
  }
  return data.presets.map((p) => ({
    id: nanoid(8),
    name: String(p.name ?? 'Imported'),
    instrument: p.instrument,
    percussion: !!p.percussion,
    envelope: { ...DEFAULT_ENVELOPE, ...p.envelope },
    filter: { ...DEFAULT_FILTER, ...p.filter },
    filterEnvelope: { ...DEFAULT_FILTER_ENVELOPE, ...p.filterEnvelope },
  }));
}
