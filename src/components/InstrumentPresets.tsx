import { useRef, useState } from 'react';
import { useStore } from '../store';
import { exportPresets, importPresets } from '../lib/presets';
import { InfoTip } from './InfoTip';

/**
 * Save the current brick's sound as a named instrument, apply saved ones to
 * any other brick, and move them between projects as a file.
 */
export function InstrumentPresets({ brickId }: { brickId: string }) {
  const presets = useStore((s) => s.presets);
  const savePreset = useStore((s) => s.savePreset);
  const applyPreset = useStore((s) => s.applyPreset);
  const renamePreset = useStore((s) => s.renamePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const addPresets = useStore((s) => s.addPresets);

  const [selected, setSelected] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const current = presets.find((p) => p.id === selected) ?? null;

  function save() {
    const id = savePreset(brickId, `Instrument ${presets.length + 1}`);
    if (id) {
      setSelected(id);
      // land in the rename box rather than interrupting with a prompt
      requestAnimationFrame(() => nameRef.current?.select());
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importPresets(file);
      addPresets(imported);
      if (imported[0]) setSelected(imported[0].id);
    } catch (err) {
      alert('Could not read that instrument file.');
      console.error(err);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <>
      <label className="side-label">
        Instruments
        <InfoTip label="Instrument presets">
          Saves this brick's <strong>sound</strong> — waveform, envelopes and
          filter — under a name, leaving its notes alone. Apply it to any other
          brick, or export your instruments to a file and import them into
          another project. Presets are copies: editing a brick afterwards won't
          change the saved instrument, or vice versa.
        </InfoTip>
      </label>

      <div className="preset-row">
        <select
          className="sound-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">
            {presets.length ? '— saved instruments —' : 'none saved yet'}
          </option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {current && (
        <>
          <div className="preset-row">
            <input
              ref={nameRef}
              className="preset-name"
              value={current.name}
              onChange={(e) => renamePreset(current.id, e.target.value)}
              title="Rename instrument"
            />
            <button
              className="tag-btn"
              onClick={() => {
                deletePreset(current.id);
                setSelected('');
              }}
              title="Delete instrument"
            >
              🗑
            </button>
          </div>
          <button
            className="ghost-btn full"
            onClick={() => applyPreset(current.id, brickId)}
            title="Give this brick that sound"
          >
            ↧ Apply to this brick
          </button>
        </>
      )}

      <button className="ghost-btn full" onClick={save}>
        ＋ Save this sound
      </button>

      <div className="preset-row">
        <button
          className="ghost-btn"
          onClick={() => fileRef.current?.click()}
          title="Import instruments from a file"
        >
          ⇧ Import
        </button>
        <button
          className="ghost-btn"
          disabled={presets.length === 0}
          onClick={() => exportPresets(presets)}
          title="Export all saved instruments to a file"
        >
          ⇩ Export all
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        hidden
        onChange={onImport}
      />
    </>
  );
}
