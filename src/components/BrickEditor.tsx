import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { engine } from '../audio/engine';
import { exportBrick } from '../lib/midi';
import { PianoRoll } from './PianoRoll';
import { RecordBar } from './RecordBar';
import { InfoTip } from './InfoTip';
import { useRecorder } from '../useRecorder';
import {
  NOTE_NAMES,
  SCALE_TYPES,
  scaleNotes,
  chordMidi,
  parseProgression,
} from '../lib/theory';
import { INSTRUMENTS, TIME_SIGNATURES } from '../types';

export function BrickEditor() {
  const brickId = useStore((s) => s.selectedBrickId);
  const brick = useStore((s) => s.bricks.find((b) => b.id === s.selectedBrickId));
  const updateBrick = useStore((s) => s.updateBrick);
  const addNote = useStore((s) => s.addNote);
  const setNotes = useStore((s) => s.setNotes);
  const closeEditor = useStore((s) => s.closeEditor);

  const [tab, setTab] = useState<'details' | 'theory'>('details');
  const [audition, setAudition] = useState(true);
  const [transposeKey, setTransposeKey] = useState(false);
  const [chordSym, setChordSym] = useState('Am');
  const [chordOct, setChordOct] = useState(4);
  const [chordBeat, setChordBeat] = useState(0);
  const [replace, setReplace] = useState(true);
  const rec = useRecorder(brickId ?? '');

  const parsedChords = useMemo(
    () => parseProgression(brick?.chords ?? ''),
    [brick?.chords]
  );

  if (!brick || !brickId) return null;

  const [root, ...rest] = brick.key.split(' ');
  const scaleType = rest.join(' ') || 'major';

  function setKey(newRoot: string, newScale: string) {
    // Optionally transpose the brick's notes by the root change (nearest
    // direction, so the motif stays in register).
    if (transposeKey && newRoot !== root) {
      const oldPc = NOTE_NAMES.indexOf(root);
      const newPc = NOTE_NAMES.indexOf(newRoot);
      if (oldPc >= 0 && newPc >= 0) {
        let delta = (newPc - oldPc) % 12;
        if (delta > 6) delta -= 12;
        if (delta < -6) delta += 12;
        const notes = brick!.notes.map((n) => ({
          ...n,
          pitch: Math.max(0, Math.min(127, n.pitch + delta)),
        }));
        updateBrick(brick!.id, { key: `${newRoot} ${newScale}`, notes });
        return;
      }
    }
    updateBrick(brick!.id, { key: `${newRoot} ${newScale}` });
  }

  function insertChord(symbol: string, atBeat: number, octave: number, dur: number) {
    const midis = chordMidi(symbol, octave);
    for (const m of midis) {
      addNote(brick!.id, {
        pitch: m,
        start: atBeat,
        duration: dur,
        velocity: 0.7,
      });
    }
  }

  function stampProgression() {
    const chords = parsedChords;
    if (chords.length === 0) return;
    const len = brick!.lengthBeats;
    // integer-beat boundaries so blocks land on the grid and tile the brick
    const bound = (i: number) => Math.round((i * len) / chords.length);
    if (replace) setNotes(brick!.id, []);
    chords.forEach((c, i) => {
      const start = bound(i);
      const dur = Math.max(1, bound(i + 1) - start);
      insertChord(c, start, chordOct, dur);
    });
  }

  return (
    <div className="editor-backdrop" onPointerDown={closeEditor}>
      <div className="editor" onPointerDown={(e) => e.stopPropagation()}>
        <div className="editor-head">
          <span className="editor-color" style={{ background: brick.color }} />
          <input
            className="editor-name"
            value={brick.name}
            onChange={(e) => updateBrick(brick.id, { name: e.target.value })}
          />

          <label className="fld">
            Key
            <select value={root} onChange={(e) => setKey(e.target.value, scaleType)}>
              {NOTE_NAMES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <select value={scaleType} onChange={(e) => setKey(root, e.target.value)}>
              {SCALE_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          <label
            className="head-check"
            title="When you change the key root, shift the brick's notes to match"
          >
            <input
              type="checkbox"
              checked={transposeKey}
              onChange={(e) => setTransposeKey(e.target.checked)}
            />
            ⇅ transpose
          </label>

          <label className="fld">
            Time
            <select
              value={`${brick.timeSig?.num ?? 4}/${brick.timeSig?.den ?? 4}`}
              onChange={(e) => {
                const [num, den] = e.target.value.split('/').map(Number);
                updateBrick(brick.id, { timeSig: { num, den } });
              }}
            >
              {TIME_SIGNATURES.map((ts) => (
                <option key={`${ts.num}/${ts.den}`} value={`${ts.num}/${ts.den}`}>
                  {ts.num}/{ts.den}
                </option>
              ))}
            </select>
          </label>

          <label className="fld">
            BPM
            <input
              type="number"
              min={20}
              max={300}
              value={brick.bpm}
              onChange={(e) =>
                updateBrick(brick.id, { bpm: Number(e.target.value) || 120 })
              }
            />
          </label>

          <label className="fld">
            Length
            <input
              type="number"
              min={1}
              max={64}
              value={brick.lengthBeats}
              onChange={(e) =>
                updateBrick(brick.id, {
                  lengthBeats: Math.max(1, Number(e.target.value) || 8),
                })
              }
            />
            <span className="unit">beats</span>
          </label>

          <label className="fld">
            Sound
            <select
              value={brick.instrument}
              onChange={(e) =>
                updateBrick(brick.id, { instrument: e.target.value as never })
              }
            >
              {INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>

          <label className="fld percussion-fld" title="Drum brick: roll rows become GM drum sounds and MIDI goes out on channel 10">
            Mode
            <label className="audition-toggle">
              <input
                type="checkbox"
                checked={brick.percussion}
                onChange={(e) =>
                  updateBrick(brick.id, { percussion: e.target.checked })
                }
              />
              🥁 Percussion
            </label>
          </label>

          <div className="editor-head-actions">
            <button className="primary-btn" onClick={() => engine.playBrick(brick)}>
              ▶ Play
            </button>
            <button className="ghost-btn" onClick={() => engine.stop()}>
              ■
            </button>
            <button className="ghost-btn" onClick={() => exportBrick(brick)}>
              ⇩ MIDI
            </button>
            <button className="ghost-btn" onClick={closeEditor}>
              ✕
            </button>
          </div>
        </div>

        <div className="editor-body">
          <div className="editor-roll">
            <RecordBar rec={rec} />
            <PianoRoll brickId={brickId} audition={audition} />
            <div className="roll-toolbar">
              <label className="audition-toggle">
                <input
                  type="checkbox"
                  checked={audition}
                  onChange={(e) => setAudition(e.target.checked)}
                />
                🔊 Hear notes as I place them
              </label>
              <span className="roll-help">
                Editing
                <InfoTip label="Piano roll help">
                  <strong>Click</strong> empty grid to add · <strong>drag</strong>{' '}
                  a note to move · drag its <strong>right edge</strong> to resize
                  · drag empty space to <strong>box-select</strong> ·{' '}
                  <strong>shift-click</strong> to multi-select ·{' '}
                  <strong>Delete</strong> removes the selection ·{' '}
                  <strong>Ctrl+C/X/V</strong> copy, cut, paste. Green rows are
                  in-scale.
                </InfoTip>
              </span>
            </div>
          </div>

          <div className="editor-side">
            <div className="side-tabs">
              <button
                className={tab === 'details' ? 'on' : ''}
                onClick={() => setTab('details')}
              >
                Notes & lyrics
              </button>
              <button
                className={tab === 'theory' ? 'on' : ''}
                onClick={() => setTab('theory')}
              >
                Theory
              </button>
            </div>

            {tab === 'details' && (
              <div className="side-content">
                <label className="side-label">Chords</label>
                <textarea
                  rows={2}
                  placeholder="Am - F - C - G"
                  value={brick.chords}
                  onChange={(e) => updateBrick(brick.id, { chords: e.target.value })}
                />
                <label className="side-label">Lyrics</label>
                <textarea
                  rows={6}
                  placeholder="Verse, hook, phrases…"
                  value={brick.lyrics}
                  onChange={(e) => updateBrick(brick.id, { lyrics: e.target.value })}
                />
                <label className="side-label">Process notes</label>
                <textarea
                  rows={5}
                  placeholder="Where this came from, how to develop it…"
                  value={brick.processNotes}
                  onChange={(e) =>
                    updateBrick(brick.id, { processNotes: e.target.value })
                  }
                />
              </div>
            )}

            {tab === 'theory' && (
              <div className="side-content">
                <label className="side-label">Scale: {brick.key}</label>
                <div className="scale-notes">
                  {scaleNotes(brick.key).map((n) => (
                    <span key={n} className="scale-chip">
                      {n}
                    </span>
                  ))}
                </div>

                <label className="side-label">
                  Chords
                  <InfoTip label="Chord input help">
                    Recognised: triads <code>C</code> <code>Am</code>{' '}
                    <code>F#m</code>, sevenths <code>Cmaj7</code>{' '}
                    <code>G7</code>, sus / add <code>Csus4</code>{' '}
                    <code>Cadd9</code>, extensions <code>C9</code>{' '}
                    <code>Am11</code>, and slash chords / inversions{' '}
                    <code>C/E</code> <code>G/B</code> — the note after the slash
                    becomes the bass. Lowercase is fine; separate with spaces,
                    dashes or bars. Shared with the Notes &amp; lyrics tab.
                  </InfoTip>
                </label>
                <textarea
                  rows={2}
                  placeholder="Am F C G"
                  value={brick.chords}
                  onChange={(e) => updateBrick(brick.id, { chords: e.target.value })}
                />

                <label className="side-label">
                  Stamp chords into the roll
                  <InfoTip label="Stamp help">
                    Lays the chords above out as note blocks, tiled evenly
                    across the brick's {brick.lengthBeats} beats.
                  </InfoTip>
                </label>
                {parsedChords.length === 0 ? (
                  <p className="side-hint empty">
                    No chords recognised yet — type names like{' '}
                    <code>Am F C G</code> in the Chords field.
                  </p>
                ) : (
                  <div className="chord-preview">
                    {parsedChords.map((c, i) => (
                      <span key={i} className="chord-chip">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <label className="menu-check nested">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Replace existing notes (off = add on top)
                </label>
                <button
                  className="ghost-btn full"
                  disabled={parsedChords.length === 0}
                  onClick={stampProgression}
                >
                  ⤵ Stamp {parsedChords.length} chord
                  {parsedChords.length === 1 ? '' : 's'} at octave {chordOct}
                </button>
                <button
                  className="ghost-btn full"
                  onClick={() => setNotes(brick.id, [])}
                >
                  🗑 Clear all notes
                </button>

                <label className="side-label">Insert single chord</label>
                <div className="chord-insert">
                  <input
                    value={chordSym}
                    onChange={(e) => setChordSym(e.target.value)}
                    placeholder="Cmaj7"
                  />
                  <label>
                    oct
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={chordOct}
                      onChange={(e) => setChordOct(Number(e.target.value) || 4)}
                    />
                  </label>
                  <label>
                    beat
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={chordBeat}
                      onChange={(e) => setChordBeat(Number(e.target.value) || 0)}
                    />
                  </label>
                  <button
                    className="mini-btn"
                    onClick={() => insertChord(chordSym, chordBeat, chordOct, 1)}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
