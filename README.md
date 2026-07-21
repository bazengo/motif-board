# Motif Board

A **MIDI scratchpad for leitmotifs** — a sticky-note corkboard for capturing small,
named musical ideas ("bricks"), auditioning them, iterating on them, and exporting
MIDI to develop further in mature software (Kontakt, a DAW, etc.).

It is deliberately **not** a full DAW. Think of it as a place to make the lego
bricks you assemble into finished pieces elsewhere.

## What it does

- **Corkboard of bricks** — each brick is a motif with its own piano roll, chord
  annotations, lyrics, process notes, key, tempo, and instrument. Drag them
  around; recolor them; choose what each card shows (chords / lyrics /
  description / a mini piano-roll preview).
- **Piano roll editor** — click to add notes, drag to move, drag the right edge to
  resize. **Box-select** by dragging empty space, **shift-click** to multi-select,
  move/delete groups. Green rows show the current scale. Optional **audition** —
  hear notes as you place them.
- **Music theory toolkit** — scale display for the brick's key, and a chord
  **stamp**: type chord names (`Am F C G`, `Cmaj7`, slash chords / inversions like
  `C/E`) and lay them out as note blocks across the brick.
- **Playback + layered mix** — play any brick, or stack several in the **mix**
  (loop / mute / solo / gain per layer) and play them together.
- **Leitmotif lineage** — **Branch** a brick to make an iteration; parent→child
  connector lines show how a motif evolves. Only one iteration of a lineage plays
  in the mix at a time.
- **Sampled + synth instruments** — a sampled piano plus several synth voices.
- **MIDI in/out**
  - Import a `.mid` file (one brick per track).
  - Export a brick or the whole mix as MIDI.
  - **Live Web MIDI output** — drive external instruments in real time. Each mix
    layer sends on its own MIDI channel (1–16).

## Driving Kontakt (or any external instrument)

The app runs in the browser, so it can't host VST/AU plugins directly — but it can
**send MIDI** to them via the Web MIDI API.

1. Install a virtual MIDI port — on Windows, [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html).
2. Open the app in **Chrome or Edge** (Web MIDI isn't available in Firefox/Safari
   or embedded preview panes).
3. Toolbar → **🎹 MIDI out** → **Enable Web MIDI** → pick the loopMIDI port →
   **Send test note** to confirm.
4. Point Kontakt (standalone or in a DAW) at the same port. Set the instrument to
   receive on **channel 1** (or Omni). For different sounds per mix layer, load a
   Kontakt Multi and assign each channel a different instrument.

## Tech

- [Vite](https://vite.dev/) + React + TypeScript
- [Tone.js](https://tonejs.github.io/) — audio scheduling & synths/sampler
- [Tonal](https://github.com/tonaljs/tonal) — scales & chords
- [@tonejs/midi](https://github.com/Tonejs/Midi) — MIDI import/export
- [Zustand](https://github.com/pmndrs/zustand) — state (persisted to `localStorage`)

## Develop

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # typecheck + production build
npm run preview  # preview the production build
```

Requires Node.js (LTS). Data is stored locally in your browser; there is no backend.
