import * as Tone from 'tone';
import { Note as TonalNote } from 'tonal';
import type {
  Brick,
  InstrumentId,
  Mix,
  Envelope,
  AutomationPoint,
} from '../types';
import { DEFAULT_ENVELOPE } from '../types';
import { layerLevels, mixLengthBeats } from '../lib/mix';
import { evaluateAutomation, hasAutomation, sortPoints } from '../lib/automation';
import { getSelectedOutput } from './midi-out';
import { DRUM_CHANNEL } from '../lib/drums';
import { DrumKit } from './drumkit';
import type { ScheduledNote } from '../lib/timeline';

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

type Voiceable = Tone.PolySynth | Tone.Sampler | DrumKit;

/**
 * Every part starts this far into the transport. Combined with starting the
 * transport slightly ahead, it guarantees no event sits at exactly position 0,
 * where Tone's scheduler can miss it — that was dropping the first note of a
 * one-shot brick (looping mixes only hid it, since the note returned next pass).
 */
const PART_LEAD = 0.08; // seconds

/**
 * How far ahead the transport is started. Building a mix's synths costs real
 * time, and under load a thin margin lets position 0 slip past the scheduler —
 * which showed up as an intermittently missing first note.
 */
const START_DELAY = 0.2; // seconds

/** Percussion bricks always use the drum kit, whatever instrument is set. */
function makeVoiceFor(brick: Brick): Voiceable {
  return brick.percussion
    ? new DrumKit()
    : makeSynth(brick.instrument, brick.envelope);
}

function makeSynth(
  instrument: InstrumentId,
  env: Envelope = DEFAULT_ENVELOPE
): Tone.PolySynth | Tone.Sampler {
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
      return new Tone.PolySynth(Tone.FMSynth, { envelope: { ...env } });
    case 'am':
      return new Tone.PolySynth(Tone.AMSynth, { envelope: { ...env } });
    default:
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: instrument },
        envelope: { ...env },
      });
  }
}

interface NoteEvent {
  time: string | number; // BBS for looped bricks, absolute seconds on the timeline
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

function envSignature(brick: Brick): string {
  const e = brick.envelope ?? DEFAULT_ENVELOPE;
  return `${brick.instrument}:${e.attack},${e.decay},${e.sustain},${e.release}`;
}

function brickSignature(brick: Brick): string {
  return (
    envSignature(brick) +
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
  /** Fader level, driven by the mix panel. */
  volume: Tone.Volume | null;
  /** Automation rides its own node so envelope ramps and the fader can't
   *  fight over one AudioParam — they simply multiply. */
  autoVol: Tone.Volume | null;
  automation: AutomationPoint[];
  autoSig: string;
  autoId: number | null;
  loopSec: number;
  /** Period of one automation pass (whole mix length), seconds. */
  autoLen: number;
  part: Tone.Part<NoteEvent>;
  channel: number;
  instrument: InstrumentId;
  envSig: string;
  loop: boolean;
  lengthBeats: number;
  level: number; // current effective gain (0 = muted/not soloed)
  sig: string;
}

type PlayItem = {
  brick: Brick;
  loop: boolean;
  gain: number;
  automation?: AutomationPoint[];
  /** Length of one automation pass in beats (the whole mix). */
  autoLenBeats?: number;
};

function gainToDb(gain: number): number {
  // floor rather than -Infinity so the value can be ramped smoothly
  if (gain <= 0.001) return -60;
  return 20 * Math.log10(gain);
}

class AudioEngine {
  private voices = new Map<string, Voice>();
  private started = false;
  private listeners = new Set<(playing: boolean) => void>();
  private endTimer: number | null = null;
  private currentBpm = 120;
  private usedChannels = new Set<number>();
  private previewSynths = new Map<string, Voiceable>();
  private activeMixId: string | null = null;
  private clickSynth: Tone.MembraneSynth | null = null;
  private metroId: number | null = null;
  /** Bumped on every play/stop so an in-flight play can tell it was superseded. */
  private playToken = 0;
  /** What's playing — the timeline playhead should only follow an arrangement. */
  private mode: 'idle' | 'clip' | 'timeline' = 'idle';

  private paused = false;

  get playbackMode(): 'idle' | 'clip' | 'timeline' {
    return this.mode;
  }
  get isPaused(): boolean {
    return this.paused;
  }

  /** Pause without tearing down — the schedule survives so it can resume. */
  pauseTransport() {
    if (this.voices.size === 0) return;
    Tone.getTransport().pause();
    this.paused = true;
    this.emit(false);
  }

  resumeTransport() {
    if (this.voices.size === 0) return;
    Tone.getTransport().start(`+${START_DELAY}`);
    this.paused = false;
    this.emit(true);
  }

  /**
   * Turn looping on or off for a sounding brick without restarting it.
   * Switching it off lets the current pass finish rather than cutting mid-note.
   */
  setBrickLoop(brickId: string, loop: boolean) {
    const voice = this.voices.get(brickId);
    if (!voice) return;
    voice.loop = loop;
    voice.part.loop = loop;

    if (loop) {
      if (this.endTimer !== null) {
        clearTimeout(this.endTimer);
        this.endTimer = null;
      }
      return;
    }
    // play out the pass we're in, then stop
    const len = voice.lengthBeats > 0 ? voice.lengthBeats : 4;
    const pos = ((this.transportBeats() % len) + len) % len;
    const remaining = (len - pos) * (60 / (this.currentBpm || 120));
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.endTimer = window.setTimeout(
      () => this.stop(),
      (remaining + 0.3) * 1000
    );
  }

  /** Move the play position (seconds from the start of the material). */
  seek(seconds: number) {
    if (this.voices.size === 0) return;
    Tone.getTransport().seconds = Math.max(0, PART_LEAD + seconds);
  }
  /** Tempo the transport is currently running at. */
  get bpm(): number {
    return this.currentBpm;
  }

  /**
   * Overall output level, 0..1. Rides on the destination so it applies to
   * everything — bricks, mixes and arrangements — and takes effect live.
   */
  setMasterVolume(v: number) {
    const dest = Tone.getDestination();
    const db = gainToDb(Math.max(0, Math.min(1, v)));
    if (Math.abs(dest.volume.value - db) > 0.01) {
      dest.volume.rampTo(db, 0.05);
    }
  }

  /** Wait for sampled instruments to finish loading, so their first notes
   *  aren't silently dropped. Bounded, so a failed load can't hang playback. */
  private async waitForSamples() {
    try {
      await Promise.race([
        Tone.loaded(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {
      /* a buffer failed to load — start anyway rather than never play */
    }
  }

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

  /** Current transport position in beats (quarter notes) — for the playhead.
   *  Discounts the part lead-in so the cursor lines up with the notes. */
  transportBeats(): number {
    const s = Math.max(0, Tone.getTransport().seconds - PART_LEAD);
    return s * (this.currentBpm / 60);
  }

  isBrickPlaying(brickId: string): boolean {
    return this.voices.has(brickId);
  }

  /**
   * Where a sounding brick is within its own loop, for the per-card tracker.
   * Read from the voice's real loop length rather than derived from the
   * transport tempo — the arrangement runs the transport at a fixed 120 with
   * absolute-second events, so a tempo-derived position is meaningless there.
   */
  brickPosition(brickId: string): { progress: number; remaining: number } | null {
    const voice = this.voices.get(brickId);
    if (!voice || voice.loopSec <= 0) return null;
    const elapsed = Math.max(0, Tone.getTransport().seconds - PART_LEAD);
    const len = voice.loopSec;
    const pos = ((elapsed % len) + len) % len;
    return { progress: pos / len, remaining: len - pos };
  }

  /** Elapsed transport time in seconds — for the timeline playhead. */
  transportSeconds(): number {
    return Math.max(0, Tone.getTransport().seconds - PART_LEAD);
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
    if (voice.level <= 0.001) return; // muted / not soloed
    // Tone fires this callback at (audio) event time already, so send the
    // note-on immediately — same path that works for note preview — and
    // schedule the note-off in the performance.now() domain the port expects.
    // (An audio-clock timestamp here silently fails on some MIDI ports.)
    const v = Math.max(1, Math.min(127, Math.round(vel * 127)));
    out.send([0x90 | voice.channel, pitch, v]);
    out.send([0x80 | voice.channel, pitch, 0], performance.now() + durSec * 1000);
  }

  /**
   * Lay the layer's volume envelope down over each pass. Scheduled per pass
   * rather than once, so it repeats with the loop and picks up edits.
   */
  private scheduleAutomation(voice: Voice, startAt: number) {
    const transport = Tone.getTransport();
    if (voice.autoId !== null) {
      transport.clear(voice.autoId);
      voice.autoId = null;
    }
    const av = voice.autoVol;
    if (!av) return;
    if (!hasAutomation(voice.automation)) {
      av.volume.cancelScheduledValues(0);
      av.volume.value = 0; // 0 dB — no change
      return;
    }
    const len = Math.max(0.05, voice.autoLen);
    voice.autoId = transport.scheduleRepeat(
      (time) => {
        const pts = sortPoints(voice.automation);
        av.volume.cancelScheduledValues(time);
        av.volume.setValueAtTime(
          gainToDb(evaluateAutomation(pts, 0)),
          time
        );
        for (const p of pts) {
          const at = time + Math.max(0, Math.min(1, p.t)) * len;
          av.volume.linearRampToValueAtTime(gainToDb(p.v), at);
        }
        // hold the final value to the end of the pass
        av.volume.linearRampToValueAtTime(
          gainToDb(evaluateAutomation(pts, 1)),
          time + len
        );
      },
      len,
      startAt
    );
  }

  /** Transport time of the next pass boundary for a voice. */
  private nextPassStart(loopSec: number): number {
    const len = Math.max(0.05, loopSec);
    const elapsed = Math.max(0, Tone.getTransport().seconds - PART_LEAD);
    return PART_LEAD + Math.ceil((elapsed + 0.05) / len) * len;
  }

  private disposeVoice(voice: Voice) {
    if (voice.autoId !== null) {
      Tone.getTransport().clear(voice.autoId);
      voice.autoId = null;
    }
    voice.part?.dispose();
    voice.synth?.dispose();
    voice.autoVol?.dispose();
    voice.volume?.dispose();
    const out = getSelectedOutput();
    if (out) out.send([0xb0 | voice.channel, 123, 0]); // all notes off
  }

  /** Build a voice for a brick and schedule it. `startAt` is a transport time. */
  private createVoice(
    brick: Brick,
    loop: boolean,
    gain: number,
    channel: number,
    secPerBeat: number,
    startAt: number,
    automation: AutomationPoint[] = [],
    autoLenBeats?: number
  ): Voice {
    const midiActive = !!getSelectedOutput();
    const internalOn = this.monitorInternal || !midiActive;
    let volume: Tone.Volume | null = null;
    let autoVol: Tone.Volume | null = null;
    let synth: Voiceable | null = null;
    if (internalOn) {
      // synth -> automation -> fader -> out
      volume = new Tone.Volume(gainToDb(gain)).toDestination();
      autoVol = new Tone.Volume(0).connect(volume);
      synth = makeVoiceFor(brick).connect(autoVol);
      if (synth instanceof DrumKit) synth.prime(brick.notes.map((n) => n.pitch));
    }

    const voice: Voice = {
      brickId: brick.id,
      synth,
      volume,
      autoVol,
      automation,
      autoSig: JSON.stringify(automation),
      autoId: null,
      loopSec: Math.max(0.05, brick.lengthBeats * secPerBeat),
      autoLen: Math.max(
        0.05,
        (autoLenBeats ?? brick.lengthBeats) * secPerBeat
      ),
      part: null as unknown as Tone.Part<NoteEvent>,
      channel,
      instrument: brick.instrument,
      envSig: envSignature(brick),
      loop,
      lengthBeats: brick.lengthBeats,
      level: gain,
      sig: brickSignature(brick),
    };

    const part = this.makePart(voice, buildEvents(brick, secPerBeat));
    part.loop = loop;
    part.loopStart = 0;
    part.loopEnd = beatsToBBS(brick.lengthBeats);
    part.start(startAt);
    voice.part = part;
    this.scheduleAutomation(voice, startAt);
    return voice;
  }

  private makePart(voice: Voice, events: NoteEvent[]): Tone.Part<NoteEvent> {
    return new Tone.Part<NoteEvent>((time, ev) => {
      if (voice.synth) voice.synth.triggerAttackRelease(ev.note, ev.dur, time, ev.vel);
      this.sendMidi(voice, ev.pitch, ev.dur, time, ev.vel);
    }, events);
  }

  /** Play a set of bricks together at `bpm`. Pass `mixId` so later gain /
   *  mute / solo changes to that mix can be applied live. */
  async play(
    items: PlayItem[],
    bpm: number,
    mixId?: string,
    startBeat = 0
  ) {
    await this.ensureStarted();
    this.stop();
    if (items.length === 0) return;
    const token = ++this.playToken;
    this.mode = 'clip';
    this.activeMixId = mixId ?? null;

    // never let a bad tempo reach the transport — NaN there stops everything
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const transport = Tone.getTransport();
    transport.bpm.value = safeBpm;
    // rewind before building parts so nothing re-evaluates against a stale position
    transport.position = 0;
    this.currentBpm = safeBpm;
    const secPerBeat = 60 / safeBpm;

    let anyLoop = false;
    let maxEndBeats = 0;
    let index = 0;

    for (const item of items) {
      const { brick, loop, gain, automation } = item;
      // percussion bricks always use GM channel 10 so drum kits respond;
      // melodic layers get their own channel so a multi-rack can separate them
      const channel = brick.percussion ? DRUM_CHANNEL : index % 16;
      this.usedChannels.add(channel);

      const voice = this.createVoice(
        brick,
        loop,
        gain,
        channel,
        secPerBeat,
        PART_LEAD,
        automation ?? [],
        item.autoLenBeats
      );
      this.voices.set(brick.id, voice);
      anyLoop = anyLoop || loop;
      for (const n of brick.notes) {
        maxEndBeats = Math.max(maxEndBeats, n.start + n.duration);
      }
      maxEndBeats = Math.max(maxEndBeats, brick.lengthBeats);
      index++;
    }

    // Sampled instruments must be ready before the transport moves, or their
    // opening notes are dropped. Building several synths for a mix also takes
    // real time, so the transport lead is only reserved *after* that work.
    await this.waitForSamples();
    if (token !== this.playToken) return; // superseded while waiting

    // Start at the musical position only — NOT plus PART_LEAD. Parts already
    // sit PART_LEAD ahead, so adding it here would drop the transport exactly
    // on the first events and the scheduler would miss them.
    const offset = Math.max(0, startBeat) * secPerBeat;
    transport.position = 0;
    transport.start(`+${START_DELAY}`, offset);
    this.emit(true);

    if (!anyLoop) {
      const remaining = Math.max(0, maxEndBeats - Math.max(0, startBeat));
      const ms = (remaining * secPerBeat + PART_LEAD + START_DELAY + 0.3) * 1000;
      this.endTimer = window.setTimeout(() => this.stop(), ms);
    }
  }

  playBrick(brick: Brick) {
    return this.play([{ brick, loop: false, gain: 0.9 }], brick.bpm);
  }

  /**
   * Play a pre-flattened arrangement. Times are absolute seconds (tempo is
   * already baked in), so the transport runs at a constant rate and per-section
   * tempo changes reproduce exactly.
   */
  async playPlan(
    notes: ScheduledNote[],
    totalSeconds: number,
    startSec = 0,
    loop = false
  ) {
    await this.ensureStarted();
    this.stop();
    if (notes.length === 0) return;
    const token = ++this.playToken;
    this.mode = 'timeline';

    const transport = Tone.getTransport();
    transport.bpm.value = 120; // irrelevant: all times are absolute seconds
    this.currentBpm = 120;

    // one voice per distinct brick (layer gain is folded into velocity)
    const byBrick = new Map<string, ScheduledNote[]>();
    for (const n of notes) {
      const list = byBrick.get(n.brick.id);
      if (list) list.push(n);
      else byBrick.set(n.brick.id, [n]);
    }

    const midiActive = !!getSelectedOutput();
    const internalOn = this.monitorInternal || !midiActive;
    let index = 0;

    for (const [brickId, list] of byBrick) {
      const brick = list[0].brick;
      const channel = brick.percussion ? DRUM_CHANNEL : index % 16;
      this.usedChannels.add(channel);

      let volume: Tone.Volume | null = null;
      let synth: Voiceable | null = null;
      if (internalOn) {
        volume = new Tone.Volume(0).toDestination();
        synth = makeVoiceFor(brick).connect(volume);
      }

      const voice: Voice = {
        brickId,
        synth,
        volume,
        // the arrangement bakes automation into note velocity, so this voice
        // needs no envelope node of its own
        autoVol: null,
        automation: [],
        autoSig: '[]',
        autoId: null,
        loopSec: 0,
        autoLen: 0,
        part: null as unknown as Tone.Part<NoteEvent>,
        channel,
        instrument: brick.instrument,
        envSig: envSignature(brick),
        loop: false,
        lengthBeats: brick.lengthBeats,
        level: 1,
        sig: brickSignature(brick),
      };

      const part = this.makePart(
        voice,
        list.map((n) => ({
          time: n.time,
          note: midiToName(n.pitch),
          dur: n.dur,
          vel: n.velocity,
          pitch: n.pitch,
        }))
      );
      if (synth instanceof DrumKit) synth.prime(list.map((n) => n.pitch));

      part.loop = false;
      part.start(PART_LEAD);
      voice.part = part;

      this.voices.set(brickId, voice);
      index++;
    }

    await this.waitForSamples();
    if (token !== this.playToken) return; // superseded while waiting

    transport.position = 0;
    if (loop) {
      transport.loop = true;
      // loop back to 0, not to PART_LEAD — landing on the events again would
      // drop the first note of every pass
      transport.loopStart = 0;
      transport.loopEnd = PART_LEAD + totalSeconds;
    } else {
      transport.loop = false;
    }
    this.paused = false;
    transport.start(`+${START_DELAY}`, Math.max(0, startSec));
    this.emit(true);

    if (!loop) {
      const remaining = Math.max(0, totalSeconds - Math.max(0, startSec));
      this.endTimer = window.setTimeout(
        () => this.stop(),
        (remaining + PART_LEAD + START_DELAY + 0.6) * 1000
      );
    }
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

      // rebuild the voice when the instrument OR its envelope changes, so
      // envelope tweaks are audible without restarting playback
      const nextEnvSig = envSignature(brick);
      if (nextEnvSig !== voice.envSig && voice.synth && voice.volume) {
        const next = makeVoiceFor(brick).connect(voice.volume);
        voice.synth.dispose();
        voice.synth = next;
        voice.instrument = brick.instrument;
        voice.envSig = nextEnvSig;
      }

      if (brick.lengthBeats !== voice.lengthBeats) {
        // Rebuild the Part — a running looping Part doesn't reliably honour a
        // changed loopEnd, so recreate it to apply the new loop length live.
        voice.part.dispose();
        const part = this.makePart(voice, buildEvents(brick, secPerBeat));
        part.loop = voice.loop;
        part.loopStart = 0;
        part.loopEnd = beatsToBBS(brick.lengthBeats);
        part.start(PART_LEAD);
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

  /**
   * Live mixing: push the playing mix's gain / mute / solo straight onto the
   * running voices, so faders move the sound without restarting playback.
   */
  syncMixLevels(mixes: Mix[], bricks: Brick[] = []) {
    if (!this.activeMixId) return;
    const mix = mixes.find((m) => m.id === this.activeMixId);
    if (!mix) return;
    const levels = layerLevels(mix);
    const mixLen = mixLengthBeats(mix, bricks);

    // --- membership: bricks ticked in/out of the mix during playback ---
    const wanted = new Set(mix.layers.map((l) => l.brickId));
    for (const [brickId, voice] of [...this.voices]) {
      if (!wanted.has(brickId)) {
        this.disposeVoice(voice);
        this.voices.delete(brickId);
      }
    }
    if (Tone.getTransport().state === 'started') {
      const secPerBeat = 60 / this.currentBpm;
      for (const layer of mix.layers) {
        if (this.voices.has(layer.brickId)) continue;
        const brick = bricks.find((b) => b.id === layer.brickId);
        if (!brick) continue;
        // Join on the next loop boundary so the new layer lands in time
        // instead of starting mid-phrase.
        const loopSec = Math.max(0.05, brick.lengthBeats * secPerBeat);
        const elapsed = Math.max(0, Tone.getTransport().seconds - PART_LEAD);
        const k = Math.ceil((elapsed + 0.05) / loopSec);
        const startAt = PART_LEAD + k * loopSec;
        const channel = brick.percussion ? DRUM_CHANNEL : this.voices.size % 16;
        this.usedChannels.add(channel);
        this.voices.set(
          brick.id,
          this.createVoice(
            brick,
            layer.loop,
            levels.get(layer.brickId) ?? 0,
            channel,
            secPerBeat,
            startAt,
            layer.automation ?? [],
            mixLen
          )
        );
      }
    }

    if (this.voices.size === 0) return;

    // per-layer loop toggles apply live, like mute/solo/gain
    for (const layer of mix.layers) {
      const voice = this.voices.get(layer.brickId);
      if (!voice) continue;
      if (voice.loop !== layer.loop) {
        voice.loop = layer.loop;
        voice.part.loop = layer.loop;
      }
      // edited envelopes take effect from the next pass, so a redraw never
      // jumps the level mid-phrase
      const sig = JSON.stringify(layer.automation ?? []);
      if (sig !== voice.autoSig) {
        voice.autoSig = sig;
        voice.automation = layer.automation ?? [];
        this.scheduleAutomation(voice, this.nextPassStart(voice.autoLen));
      }
    }

    for (const [brickId, level] of levels) {
      const voice = this.voices.get(brickId);
      if (!voice) continue;
      voice.level = level; // also gates MIDI-out for muted layers
      if (!voice.volume) continue;
      const db = gainToDb(level);
      if (Math.abs(voice.volume.volume.value - db) > 0.01) {
        // short ramp avoids zipper noise while dragging a fader
        voice.volume.volume.rampTo(db, 0.05);
      }
    }
  }

  private ensureClick(): Tone.MembraneSynth {
    if (!this.clickSynth) {
      this.clickSynth = new Tone.MembraneSynth({
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
      }).toDestination();
    }
    return this.clickSynth;
  }

  /** Metronome tick for count-in. */
  async metronomeClick(accent = false) {
    await this.ensureStarted();
    this.ensureClick().triggerAttackRelease(accent ? 'C6' : 'G5', 0.05);
  }

  /** Click every beat while the transport runs, accenting each downbeat. */
  startMetronome(beatsPerBar = 4) {
    this.stopMetronome();
    const transport = Tone.getTransport();
    const secPerBeat = 60 / (this.currentBpm || 120);
    const click = this.ensureClick();
    let beat = 0;
    this.metroId = transport.scheduleRepeat(
      (time) => {
        const accent = beat % Math.max(1, beatsPerBar) === 0;
        beat++;
        click.triggerAttackRelease(accent ? 'C6' : 'G5', 0.05, time);
      },
      secPerBeat,
      PART_LEAD
    );
  }

  stopMetronome() {
    if (this.metroId !== null) {
      Tone.getTransport().clear(this.metroId);
      this.metroId = null;
    }
  }

  /** Audition a single pitch (used when placing notes). */
  async preview(
    pitch: number,
    instrument: InstrumentId,
    gain = 0.8,
    percussion = false,
    env: Envelope = DEFAULT_ENVELOPE
  ) {
    await this.ensureStarted();
    // cache per instrument *and* envelope, so auditions match playback
    const key = percussion
      ? 'drums'
      : `${instrument}:${env.attack},${env.decay},${env.sustain},${env.release}`;
    let synth = this.previewSynths.get(key);
    if (!synth) {
      const vol = new Tone.Volume(gainToDb(gain)).toDestination();
      synth = (percussion ? new DrumKit() : makeSynth(instrument, env)).connect(
        vol
      );
      this.previewSynths.set(key, synth);
    }
    if (synth instanceof DrumKit) synth.triggerAttackRelease(pitch, 0.3);
    else synth.triggerAttackRelease(midiToName(pitch), 0.3);

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
    this.playToken++; // cancel any play still waiting on samples
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.loop = false;
    this.paused = false;
    this.stopMetronome();
    this.allNotesOff();
    for (const v of this.voices.values()) {
      v.part.dispose();
      v.synth?.dispose();
      v.volume?.dispose();
    }
    this.voices.clear();
    this.usedChannels.clear();
    this.activeMixId = null;
    this.mode = 'idle';
    this.emit(false);
  }
}

export const engine = new AudioEngine();
