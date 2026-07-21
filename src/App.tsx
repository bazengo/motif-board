import { useEffect, useRef, useState } from 'react';
import { useStore, clampBpm } from './store';
import { engine } from './audio/engine';
import { importMidi } from './lib/midi';
import { exportProject, importProject } from './lib/project';
import {
  initHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  onHistory,
} from './history';
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
  const addMix = useStore((s) => s.addMix);
  const openEditor = useStore((s) => s.openEditor);

  const [playing, setPlaying] = useState(false);
  const [, forceHistory] = useState(0);
  const midiFileRef = useRef<HTMLInputElement | null>(null);
  const projFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => engine.onChange(setPlaying), []);
  useEffect(() => initHistory(), []);
  useEffect(() => onHistory(() => forceHistory((n) => n + 1)), []);

  // Live editing: push brick changes into currently-playing voices.
  useEffect(
    () => useStore.subscribe((state) => engine.syncLive(state.bricks)),
    []
  );

  // Undo/redo keyboard shortcuts (ignore when typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function onImportMidi(e: React.ChangeEvent<HTMLInputElement>) {
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

  async function onImportProject(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !confirm('Load this project? It replaces the current board (export first if unsure).')
    ) {
      e.target.value = '';
      return;
    }
    try {
      await importProject(file);
    } catch (err) {
      alert('Could not read that project file.');
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
          <div className="btn-group">
            <button className="ghost-btn" onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
              ↶
            </button>
            <button className="ghost-btn" onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">
              ↷
            </button>
          </div>

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

          <div className="btn-group">
            <button className="ghost-btn" onClick={() => projFileRef.current?.click()} title="Load project (.json)">
              ⇧ Open
            </button>
            <button className="ghost-btn" onClick={() => exportProject()} title="Save project (.json)">
              ⇩ Save
            </button>
          </div>
          <input ref={projFileRef} type="file" accept=".json" hidden onChange={onImportProject} />

          <button className="ghost-btn" onClick={() => midiFileRef.current?.click()}>
            ⇧ MIDI
          </button>
          <input ref={midiFileRef} type="file" accept=".mid,.midi" hidden onChange={onImportMidi} />

          <button className="ghost-btn" onClick={() => addMix()}>
            + Mix
          </button>
          <button
            className="primary-btn"
            onClick={() => {
              const id = addBrick();
              openEditor(id);
            }}
          >
            + Brick
          </button>
        </div>
      </header>

      <div className="main">
        <Board />
        <aside className="sidebar">
          <MixPanel />
        </aside>
      </div>

      {editorOpen && <BrickEditor />}
    </div>
  );
}

export default App;
