import { useEffect, useState } from 'react';
import {
  ensureMidi,
  isMidiSupported,
  listOutputs,
  selectOutput,
  getSelectedId,
  getSelectedOutput,
  onMidiChange,
  type MidiOutputInfo,
} from '../audio/midi-out';
import { engine } from '../audio/engine';
import { InfoTip } from './InfoTip';

function sendTestNote() {
  const out = getSelectedOutput();
  if (!out) {
    alert('Pick an output port first (e.g. your loopMIDI port).');
    return;
  }
  out.send([0x90, 60, 100]); // C4 on, channel 1
  out.send([0x80, 60, 0], performance.now() + 500);
}

export function MidiSelector() {
  const [supported] = useState(isMidiSupported());
  const [enabled, setEnabled] = useState(false);
  const [outputs, setOutputs] = useState<MidiOutputInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(getSelectedId());
  const [monitor, setMonitor] = useState(engine.monitorInternal);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onMidiChange(() => {
      setOutputs(listOutputs());
      setSelected(getSelectedId());
    });
  }, []);

  async function enable() {
    setError(null);
    setBusy(true);
    try {
      const ok = await ensureMidi();
      if (!ok) {
        setError(
          'Web MIDI is unavailable. Open the app directly in Chrome or Edge — ' +
            'an in-editor / preview browser cannot access MIDI.'
        );
        return;
      }
      setEnabled(true);
      const outs = listOutputs();
      setOutputs(outs);
      // auto-pick the first real output (usually your loopMIDI port)
      if (outs.length > 0 && !getSelectedId()) {
        selectOutput(outs[0].id);
        setSelected(outs[0].id);
      }
    } catch (err) {
      setError(
        'MIDI access was blocked or dismissed: ' +
          (err instanceof Error ? err.message : String(err)) +
          '. Check for a permission prompt, or open in Chrome/Edge directly.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <span className="midi-unsupported" title="Web MIDI needs Chrome or Edge">
        MIDI out: not supported here
      </span>
    );
  }

  return (
    <div className="midi-selector">
      <button className="ghost-btn" onClick={() => setOpen((v) => !v)}>
        🎹 MIDI out{selected ? ': on' : ''} ▾
      </button>
      {open && (
        <div className="midi-pop" onMouseLeave={() => setOpen(false)}>
          {!enabled ? (
            <>
              <p className="midi-hint">
                Route to Kontakt or any DAW. On Windows, install a virtual port
                (loopMIDI) first, then pick it here. Must be Chrome or Edge,
                opened directly (not a preview pane inside another app).
              </p>
              <button className="primary-btn full" onClick={enable} disabled={busy}>
                {busy ? 'Requesting…' : 'Enable Web MIDI'}
              </button>
              {error && <p className="midi-error">{error}</p>}
            </>
          ) : (
            <>
              <label className="side-label">Output port</label>
              <select
                value={selected ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  selectOutput(id);
                  setSelected(id);
                }}
              >
                <option value="">— Internal synth only —</option>
                {outputs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {outputs.length === 0 && (
                <p className="midi-hint">
                  No output ports found. Install loopMIDI (or connect a MIDI
                  device) and reopen this menu.
                </p>
              )}
              <button
                className="ghost-btn full"
                onClick={sendTestNote}
                disabled={!selected}
              >
                🔔 Send test note (C4)
              </button>
              <p className="midi-hint">
                Kontakt setup
                <InfoTip label="Kontakt setup">
                  Enable this port under Kontakt's MIDI input and set the
                  instrument to receive on <strong>channel&nbsp;1</strong> (or
                  Omni). Each mix layer sends on its own channel (1–16), so a
                  multi-rack can give every layer a different sound. Percussion
                  bricks always send on <strong>channel&nbsp;10</strong>.
                </InfoTip>
              </p>
              <label className="audition-toggle">
                <input
                  type="checkbox"
                  checked={monitor}
                  onChange={(e) => {
                    engine.monitorInternal = e.target.checked;
                    setMonitor(e.target.checked);
                  }}
                />
                Also monitor with internal synth
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
