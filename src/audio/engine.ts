import * as Tone from 'tone';
import { Note as TonalNote } from 'tonal';
import type { Brick, InstrumentId } from '../types';
import { getSelectedOutput } from './midi-out';
import { DRUM_CHANNEL } from '../lib/drums';

// Convert a MIDI pitch to a note name Tone understands ("C4", "F#5", ...).
export function midiToName(midi: number): string {
  return TonalNote.fromMidi(midi);
}

// Beats (quarter notes) -> Tone "bars:beats:sixteenths". Tone normalises values
// that overflow a bar, so "0:5:2" is fine. We snap to 16ths (the roll grid).
function beatsToBBS(beats: number): string {
  const sixteenths = Math.round(beats * 4);
  const q = Math.floor(sixteenths / 4);
  const s = sixteenths - q * 4;
  return `0:${q}:${s}`;
}

type Voiceable = Tone.PolySynth | Tone.Sampler;

function makeSynth(instrument: InstrumentId): Voiceable {
  switch (instrument) {
    case 'piano':
      return new Tone.Sampler({
        urls: {
          A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
          A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
          A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
          A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
          A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
          A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
          A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
          A7: 'A7.mp3', C8: 'C8.mp3',
        },
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
        release: 1,
      });
    case 'fm':
      return new Tone.PolySynth(Tone.FMSynth);
    case 'am':
      return new Tone.PolySynth(Tone.AMSynth);
    default:
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: instrument },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.6 },
      });
  }
}

interface NoteEvent {
  time: string;
  note: string;
  dur: number; // seconds
  vel: number;
  pitch: number; // MIDI number
}

function buildEvents(brick: Brick, secPerBeat: number): NoteEvent[] {
  return brick.notes.map((n) => ({
    time: beatsToBBS(n.start),
    note: midiToName(n.pitch),
    dur: n.duration * secPerBeat,
    vel: n.velocity,
    pitch: n.pitch,
  }));
}

function brickSignature(brick: Brick): string {
  return (
    brick.instrument +
    '|' +
    brick.lengthBeats +
    '|' +
    brick.notes
      .map((n) => `${n.pitch},${n.start},${n.duration},${n.velocity}`)
      .join(';')
  );
}

interface Voice {
  brickId: string;
  synth: Voiceable | null; // null when monitoring is off (MIDI-only)
  volume: Tone.Volume | null;
  part: Tone.Part<NoteEvent>;
  channel: number;
  instrument: InstrumentId;
  loop: boolean;
  lengthBeats: number;
  sig: string;
}

type PlayItem = { brick: Brick; loop: boolean; gain: number };

function gainToDb(gain: number): number {
  if (gain <= 0.0001) return -Infinity;
  return 20 * Math.log10(gain);
}

class AudioEngine {
  private voices = new Map<string, Voice>();
  private started = false;
  private listeners = new Set<(playing: boolean) => void>();
  private endTimer: number | null = null;
  private currentBpm = 120;
  private usedChannels = new Set<number>();
  private previewSynths = new Map<InstrumentId, Voiceable>();

  monitorInternal = true;

  onChange(cb: (playing: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(playing: boolean) {
    this.listeners.forEach((l) => l(playing));
  }
  get isPlaying(): boolean {
    return this.voices.size > 0;
  }

  /** Current transport position in beats (quarter notes) — for the playhead. */
  transportBeats(): number {
    return Tone.getTransport().seconds * (this.currentBpm / 60);
  }

  isBrickPlaying(brickId: string): boolean {
    return this.voices.has(brickId);
  }

  private async ensureStarted() {
    if (!this.started) {
      await Tone.start();
      this.started = true;
    }
  }

  private sendMidi(voice: Voice, pitch: number, durSec: number, _time: number, vel: number) {
    const out = getSelectedOutput();
    if (!out) return;
    // Tone fires this callback at (audio) event time already, so send the
    // note-on immediately — same path that works for note preview — and
    // schedule the note-off in the performance.now() domain the port expects.
    // (An audio-clock timestamp here silently fails on some MIDI ports.)
    const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
    out.send([0x90 | voice.channel, pitch, v]);
    out.send([0x80 | voice.channel, pitch, 0], performance.now() + durSec * 1000);
  }

  private makePart(voice: Voice, events: NoteEvent[]): Tone.Part<NoteEvent> {
    return new Tone.Part<NoteEvent>((time, ev) => {
      if (voice.synth) voice.synth.triggerAttackRelease(ev.note, ev.dur, time, ev.vel);
      this.sendMidi(voice, ev.pitch, ev.dur, time, ev.vel);
    }, events);
  }

  /** Play a set of bricks together at `bpm`. */
  async play(items: PlayItem[], bpm: number) {
    await this.ensureStarted();
    this.stop();
    if (items.length === 0) return;

    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    this.currentBpm = bpm;
    const secPerBeat = 60 / bpm;
    const midiActive = !!getSelectedOutput();
    const internalOn = this.monitorInternal || !midiActive;

    let anyLoop = false;
    let maxEndBeats = 0;
    let index = 0;

    for (const { brick, loop, gain } of items) {
      // percussion bricks always use GM channel 10 so drum kits respond;
      // melodic layers get their own channel so a multi-rack can separate them
      const channel = brick.percussion ? DRUM_CHANNEL : index % 16;
      this.usedChannels.add(channel);

      let volume: Tone.Volume | null = null;
      let synth: Voiceable | null = null;
      if (internalOn) {
        volume = new Tone.Volume(gainToDb(gain)).toDestination();
        synth = makeSynth(brick.instrument).connect(volume);
      }

      const voice: Voice = {
        brickId: brick.id,
        synth,
        volume,
        part: null as unknown as Tone.Part<NoteEvent>,
        channel,
        instrument: brick.instrument,
        loop,
        lengthBeats: brick.lengthBeats,
        sig: brickSignature(brick),
      };

      const part = this.makePart(voice, buildEvents(brick, secPerBeat));
      part.loop = loop;
      part.loopStart = 0;
      part.loopEnd = beatsToBBS(brick.lengthBeats);
      part.start(0);
      voice.part = part;

      this.voices.set(brick.id, voice);
      anyLoop = anyLoop || loop;
      for (const n of brick.notes) {
        maxEndBeats = Math.max(maxEndBeats, n.start + n.duration);
      }
      maxEndBeats = Math.max(maxEndBeats, brick.lengthBeats);
      index++;
    }

    transport.position = 0;
    // Start slightly ahead so the scheduler catches events at time 0 — without
    // this, the very first note is missed until the loop comes back around.
    const START_DELAY = 0.1;
    transport.start(`+${START_DELAY}`);
    this.emit(true);

    if (!anyLoop) {
      const ms = (maxEndBeats * secPerBeat + START_DELAY + 0.3) * 1000;
      this.endTimer = window.setTimeout(() => this.stop(), ms);
    }
  }

  playBrick(brick: Brick) {
    return this.play([{ brick, loop: false, gain: 0.9 }], brick.bpm);
  }

  /** Re-read currently-playing bricks so edits are heard live (notes, length,
   *  instrument). Called on every store change; cheap no-op when nothing plays. */
  syncLive(bricks: Brick[]) {
    if (this.voices.size === 0) return;
    const secPerBeat = 60 / this.currentBpm;
    for (const voice of this.voices.values()) {
      const brick = bricks.find((b) => b.id === voice.brickId);
      if (!brick) continue;
      const sig = brickSignature(brick);
      if (sig === voice.sig) continue;
      voice.sig = sig;

      if (brick.instrument !== voice.instrument && voice.synth && voice.volume) {
        const next = makeSynth(brick.instrument).connect(voice.volume);
        voice.synth.dispose();
        voice.synth = next;
        voice.instrument = brick.instrument;
      }

      if (brick.lengthBeats !== voice.lengthBeats) {
        // Rebuild the Part — a running looping Part doesn't reliably honour a
        // changed loopEnd, so recreate it to apply the new loop length live.
        voice.part.dispose();
        const part = this.makePart(voice, buildEvents(brick, secPerBeat));
        part.loop = voice.loop;
        part.loopStart = 0;
        part.loopEnd = beatsToBBS(brick.lengthBeats);
        part.start(0);
        voice.part = part;
        voice.lengthBeats = brick.lengthBeats;
      } else {
        voice.part.clear();
        for (const ev of buildEvents(brick, secPerBeat)) {
          voice.part.add(ev.time, ev);
        }
      }
    }
  }

  /** Audition a single pitch (used when placing notes). */
  async preview(pitch: number, instrument: InstrumentId, gain = 0.8) {
    await this.ensureStarted();
    let synth = this.previewSynths.get(instrument);
    if (!synth) {
      const vol = new Tone.Volume(gainToDb(gain)).toDestination();
      synth = makeSynth(instrument).connect(vol);
      this.previewSynths.set(instrument, synth);
    }
    synth.triggerAttackRelease(midiToName(pitch), 0.3);

    const out = getSelectedOutput();
    if (out) {
      out.send([0x90, pitch, 90]);
      out.send([0x80, pitch, 0], performance.now() + 300);
    }
  }

  private allNotesOff() {
    const out = getSelectedOutput();
    if (!out) return;
    for (const ch of this.usedChannels) {
      out.send([0xb0 | ch, 123, 0]); // all notes off
    }
  }

  stop() {
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    this.allNotesOff();
    for (const v of this.voices.values()) {
      v.part.dispose();
      v.synth?.dispose();
      v.volume?.dispose();
    }
    this.voices.clear();
    this.usedChannels.clear();
    this.emit(false);
  }
}

export const engine = new AudioEngine();
