import { useEffect, useState } from 'react';
import {
  ensureMidiIn,
  listInputs,
  selectInput,
  getSelectedInputId,
  onInputChange,
  KEYBOARD_HINT,
  type MidiInputInfo,
} from '../audio/midi-in';
import { midiToName } from '../audio/engine';
import type { useRecorder } from '../useRecorder';

export function RecordBar({ rec }: { rec: ReturnType<typeof useRecorder> }) {
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string | null>(getSelectedInputId());
  const [err, setErr] = useState<string | null>(null);

  useEffect(
    () =>
      onInputChange(() => {
        setInputs(listInputs());
        setSelected(getSelectedInputId());
      }),
    []
  );

  async function enable() {
    setErr(null);
    try {
      const ok = await ensureMidiIn();
      if (!ok) {
        setErr('Web MIDI unavailable — use Chrome or Edge, opened directly.');
        return;
      }
      setEnabled(true);
      const list = listInputs();
      setInputs(list);
      if (list.length && !getSelectedInputId()) {
        selectInput(list[0].id);
        setSelected(list[0].id);
      }
    } catch (e) {
      setErr('MIDI access was blocked: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="record-bar">
      <button
        className={'rec-btn' + (rec.recording ? ' on' : '')}
        onClick={() => (rec.recording ? rec.stop() : rec.start())}
        title={rec.recording ? 'Stop recording' : 'Arm and record'}
      >
        {rec.recording ? '■ Stop' : '● Record'}
      </button>

      {rec.countdown != null && (
        <span className="rec-count">{rec.countdown}</span>
      )}

      <label className="brush-check">
        <input
          type="checkbox"
          checked={rec.countIn}
          onChange={(e) => rec.setCountIn(e.target.checked)}
        />
        Count-in
      </label>
      <label className="brush-check">
        <input
          type="checkbox"
          checked={rec.quantizeInput}
          onChange={(e) => rec.setQuantizeInput(e.target.checked)}
        />
        Quantize input
      </label>

      <label className="brush-field">
        Octave
        <input
          type="number"
          min={0}
          max={8}
          value={rec.octave}
          onChange={(e) => rec.setOctave(Number(e.target.value) || 4)}
          style={{ width: 52 }}
        />
      </label>

      <span className="rec-held">
        {rec.held.length > 0
          ? rec.held.map((p) => midiToName(p)).join(' ')
          : KEYBOARD_HINT}
      </span>

      <span className="brush-spacer" />

      {!enabled ? (
        <button className="ghost-btn brush-btn" onClick={enable}>
          🎹 Enable MIDI in
        </button>
      ) : (
        <label className="brush-field">
          Input
          <select
            value={selected ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              selectInput(id);
              setSelected(id);
            }}
          >
            <option value="">— none —</option>
            {inputs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {err && <span className="rec-err">{err}</span>}
    </div>
  );
}
