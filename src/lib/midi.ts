import { Midi } from '@tonejs/midi';
import { nanoid } from 'nanoid';
import type { Brick, Note } from '../types';
import { makeBrick } from '../store';
import { DRUM_CHANNEL } from './drums';

function download(bytes: Uint8Array, filename: string) {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'brick';
}

/** One brick -> one-track MIDI file, using the brick's own tempo. */
export function exportBrick(brick: Brick) {
  const midi = new Midi();
  midi.header.setTempo(brick.bpm);
  const track = midi.addTrack();
  track.name = brick.name;
  if (brick.percussion) track.channel = DRUM_CHANNEL;
  const secPerBeat = 60 / brick.bpm;
  for (const n of brick.notes) {
    track.addNote({
      midi: n.pitch,
      time: n.start * secPerBeat,
      duration: n.duration * secPerBeat,
      velocity: n.velocity,
    });
  }
  download(midi.toArray(), `${safeName(brick.name)}.mid`);
}

/** Several bricks -> one multi-track MIDI file at the shared mix tempo. */
export function exportMix(bricks: Brick[], bpm: number, filename = 'mix.mid') {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const secPerBeat = 60 / bpm;
  for (const brick of bricks) {
    const track = midi.addTrack();
    track.name = brick.name;
    if (brick.percussion) track.channel = DRUM_CHANNEL;
    for (const n of brick.notes) {
      track.addNote({
        midi: n.pitch,
        time: n.start * secPerBeat,
        duration: n.duration * secPerBeat,
        velocity: n.velocity,
      });
    }
  }
  download(midi.toArray(), filename);
}

/** Import a .mid file -> one Brick per non-empty track. */
export async function importMidi(file: File): Promise<Brick[]> {
  const buf = await file.arrayBuffer();
  const midi = new Midi(buf);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const secPerBeat = 60 / bpm;
  const base = file.name.replace(/\.midi?$/i, '');
  const bricks: Brick[] = [];

  midi.tracks.forEach((track, i) => {
    if (track.notes.length === 0) return;
    const notes: Note[] = track.notes.map((n) => ({
      id: nanoid(8),
      pitch: n.midi,
      start: n.time / secPerBeat,
      duration: Math.max(0.25, n.duration / secPerBeat),
      velocity: n.velocity || 0.8,
    }));
    const maxEnd = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
    const lengthBeats = Math.max(4, Math.ceil(maxEnd / 4) * 4);
    bricks.push(
      makeBrick({
        name: track.name || `${base}${midi.tracks.length > 1 ? ` ${i + 1}` : ''}`,
        notes,
        percussion: track.channel === DRUM_CHANNEL,
        bpm: Math.round(bpm),
        lengthBeats,
      })
    );
  });

  return bricks;
}
