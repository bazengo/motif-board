import { useEffect, useRef, useState } from 'react';
import { useStore, clampBpm } from './store';
import { engine } from './audio/engine';
import { importMidi } from './lib/midi';
import { Board } from './components/Board';
import { MixPanel } from './components/MixPanel';
import { BrickEditor } from './components/BrickEditor';
import { MidiSelector } from './components/MidiSelector';
import './styles.css';

function App() {
  const editorOpen = useStore((s) => s.editorOpen);
  const globalBpm = useStore((s) => s.globalBpm);
  const setGlobalBpm = useStore((s) => s.setGlobalBpm);
  const addBrick = useStore((s) => s.addBrick);
  const openEditor = useStore((s) => s.openEditor);
  const brickCount = useStore((s) => s.bricks.length);

  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => engine.onChange(setPlaying), []);

  // Live editing: push brick changes into any currently-playing voices so edits
  // are heard during playback (loops pick up new/changed notes on the next pass).
  useEffect(
    () => useStore.subscribe((state) => engine.syncLive(state.bricks)),
    []
  );

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bricks = await importMidi(file);
      let firstId: string | null = null;
      for (const b of bricks) {
        const id = addBrick(b);
        if (!firstId) firstId = id;
      }
      if (firstId) openEditor(firstId);
    } catch (err) {
      alert('Could not read that MIDI file.');
      console.error(err);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-title">Motif Board</div>
            <div className="brand-sub">a MIDI scratchpad for leitmotifs</div>
          </div>
        </div>

        <div className="topbar-controls">
          <label className="fld">
            Project BPM
            <input
              type="number"
              min={20}
              max={300}
              value={globalBpm}
              onChange={(e) => setGlobalBpm(clampBpm(Number(e.target.value)))}
            />
          </label>

          {playing && (
            <button className="ghost-btn" onClick={() => engine.stop()}>
              ■ Stop
            </button>
          )}

          <MidiSelector />

          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
            ⇧ Import MIDI
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".mid,.midi"
            hidden
            onChange={onImport}
          />

          <button
            className="primary-btn"
            onClick={() => {
              const id = addBrick();
              openEditor(id);
            }}
          >
            + New brick
          </button>
        </div>
      </header>

      <div className="main">
        <Board />
        {brickCount > 0 && (
          <aside className="sidebar">
            <MixPanel />
          </aside>
        )}
      </div>

      {editorOpen && <BrickEditor />}
    </div>
  );
}

export default App;
