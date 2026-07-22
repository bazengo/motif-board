import { useEffect, useState } from 'react';
import {
  ensureMidiIn,
  listInputs,
  selectInput,
  getSelectedInputId,
  onInputChange,
  describeMidiError,
  type MidiInputInfo,
} from '../audio/midi-in';
import { midiToName } from '../audio/engine';
import { useStore } from '../store';
import { InfoTip } from './InfoTip';
import type { useRecorder } from '../useRecorder';

export function RecordBar({ rec }: { rec: ReturnType<typeof useRecorder> }) {
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string | null>(getSelectedInputId());
  const [err, setErr] = useState<string | null>(null);
  const mixes = useStore((s) => s.mixes);
  const groups = useStore((s) => s.groups);

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
        setErr(describeMidiError(new Error('unsupported')));
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
      setErr(describeMidiError(e));
    }
  }

  return (
    <div className="record-bar">
      <button
        className={'rec-btn' + (rec.recording ? ' on' : '')}
        onClick={() => (rec.recording ? rec.stop() : rec.start())}
      >
        {rec.recording ? '■ Stop' : '● Record'}
      </button>

      {/* fixed slot so the countdown appearing doesn't shift the row */}
      <span className="rec-count">{rec.countdown ?? ''}</span>

      <div className="rec-group">
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
          Quantize
        </label>
        <InfoTip label="Recording help">
          <strong>Record</strong> captures what you play against the looping
          brick. <strong>Count-in</strong> ticks one bar first at this brick's
          own tempo and time signature. <strong>Quantize</strong> snaps what you
          play to the current grid — turn it off to keep your exact feel.
        </InfoTip>
      </div>

      <div className="rec-group">
        <label className="brush-field">
          Play along
          <select
            value={rec.backing ?? ''}
            onChange={(e) => rec.setBacking(e.target.value || null)}
            title="Loop a mix or board group alongside, starting after the count-in"
          >
            <option value="">— nothing —</option>
            {mixes.length > 0 && (
              <optgroup label="Mixes">
                {mixes.map((m) => (
                  <option key={m.id} value={`mix:${m.id}`}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
            {groups.length > 0 && (
              <optgroup label="Groups">
                {groups.map((g) => (
                  <option key={g.id} value={`group:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>

      <div className="rec-group">
        <span className="rec-label">Oct</span>
        <button
          className="oct-btn"
          onClick={() => rec.setOctave(Math.max(0, rec.octave - 1))}
        >
          −
        </button>
        <span className="oct-value">{rec.octave}</span>
        <button
          className="oct-btn"
          onClick={() => rec.setOctave(Math.min(8, rec.octave + 1))}
        >
          +
        </button>
      </div>

      {/* fixed width: held notes replace nothing, so the row never reflows */}
      <span className="rec-held" title="Notes currently held">
        {rec.held.length > 0 ? rec.held.map((p) => midiToName(p)).join(' ') : '—'}
      </span>
      <InfoTip label="Keyboard layout">
        Play with the computer keyboard: <strong>A</strong>=C,{' '}
        <strong>W</strong>=C♯, <strong>S</strong>=D, <strong>E</strong>=D♯,{' '}
        <strong>D</strong>=E, <strong>F</strong>=F … <strong>J</strong>=B,{' '}
        <strong>K</strong>=C above. <strong>Z</strong> / <strong>X</strong> shift
        octave. Works in any browser.
      </InfoTip>

      <span className="brush-spacer" />

      {!enabled ? (
        <button className="ghost-btn brush-btn" onClick={enable}>
          🎹 MIDI device
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

      {err && (
        <div className="rec-err">
          {err}
          <button className="rec-err-x" onClick={() => setErr(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
