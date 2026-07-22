import * as Tone from 'tone';
import { Note as TonalNote } from 'tonal';

// A synthesized GM drum kit. Classic drum-machine approach — membrane voices
// for kicks/toms, filtered noise for snares/hats/claps, metallic voices for
// cymbals — so percussion bricks sound like drums with no samples to download.
// Each GM pitch owns one voice, which also gives natural choke behaviour
// (a hi-hat retrigger cuts the previous one, like real hats).

type VoiceSpec =
  | { kind: 'membrane'; pitch: string; decay: number; octaves?: number }
  | { kind: 'noise'; decay: number; hp?: number; type?: 'white' | 'pink' | 'brown' }
  | { kind: 'metal'; freq: number; decay: number; harmonicity?: number };

const KIT: Record<number, VoiceSpec> = {
  35: { kind: 'membrane', pitch: 'B0', decay: 0.45, octaves: 6 }, // acoustic kick
  36: { kind: 'membrane', pitch: 'C1', decay: 0.4, octaves: 6 }, // kick 1
  37: { kind: 'noise', decay: 0.04, hp: 2500 }, // side stick
  38: { kind: 'noise', decay: 0.18, hp: 1200 }, // acoustic snare
  39: { kind: 'noise', decay: 0.26, hp: 900 }, // hand clap
  40: { kind: 'noise', decay: 0.13, hp: 1800 }, // electric snare
  41: { kind: 'membrane', pitch: 'G1', decay: 0.4 }, // low floor tom
  42: { kind: 'noise', decay: 0.045, hp: 8000 }, // closed hi-hat
  43: { kind: 'membrane', pitch: 'B1', decay: 0.38 }, // high floor tom
  44: { kind: 'noise', decay: 0.09, hp: 7000 }, // pedal hi-hat
  45: { kind: 'membrane', pitch: 'D2', decay: 0.35 }, // low tom
  46: { kind: 'noise', decay: 0.38, hp: 7500 }, // open hi-hat
  47: { kind: 'membrane', pitch: 'F2', decay: 0.33 }, // low-mid tom
  48: { kind: 'membrane', pitch: 'A2', decay: 0.3 }, // hi-mid tom
  49: { kind: 'metal', freq: 300, decay: 1.5 }, // crash 1
  50: { kind: 'membrane', pitch: 'C3', decay: 0.28 }, // high tom
  51: { kind: 'metal', freq: 420, decay: 1.1, harmonicity: 8 }, // ride 1
  52: { kind: 'metal', freq: 280, decay: 1.7 }, // chinese cymbal
  53: { kind: 'metal', freq: 600, decay: 0.7, harmonicity: 12 }, // ride bell
  54: { kind: 'noise', decay: 0.14, hp: 5500 }, // tambourine
  55: { kind: 'metal', freq: 350, decay: 0.8 }, // splash
  56: { kind: 'metal', freq: 560, decay: 0.25, harmonicity: 16 }, // cowbell
  57: { kind: 'metal', freq: 320, decay: 1.4 }, // crash 2
  58: { kind: 'noise', decay: 0.4, hp: 3000 }, // vibraslap
  59: { kind: 'metal', freq: 440, decay: 1.0, harmonicity: 8 }, // ride 2
  60: { kind: 'membrane', pitch: 'A3', decay: 0.18 }, // hi bongo
  61: { kind: 'membrane', pitch: 'F3', decay: 0.2 }, // low bongo
  62: { kind: 'membrane', pitch: 'G3', decay: 0.16 }, // mute hi conga
  63: { kind: 'membrane', pitch: 'E3', decay: 0.24 }, // open hi conga
  64: { kind: 'membrane', pitch: 'C3', decay: 0.26 }, // low conga
  65: { kind: 'membrane', pitch: 'D3', decay: 0.22 }, // high timbale
  66: { kind: 'membrane', pitch: 'A2', decay: 0.24 }, // low timbale
  67: { kind: 'metal', freq: 900, decay: 0.3, harmonicity: 12 }, // high agogo
  68: { kind: 'metal', freq: 700, decay: 0.3, harmonicity: 12 }, // low agogo
  69: { kind: 'noise', decay: 0.07, hp: 6500 }, // cabasa
  70: { kind: 'noise', decay: 0.05, hp: 7000 }, // maracas
  71: { kind: 'metal', freq: 1400, decay: 0.3 }, // short whistle
  72: { kind: 'metal', freq: 1400, decay: 0.7 }, // long whistle
  73: { kind: 'noise', decay: 0.12, hp: 4000 }, // short guiro
  74: { kind: 'noise', decay: 0.3, hp: 4000 }, // long guiro
  75: { kind: 'membrane', pitch: 'C5', decay: 0.08 }, // claves
  76: { kind: 'membrane', pitch: 'A4', decay: 0.1 }, // hi wood block
  77: { kind: 'membrane', pitch: 'F4', decay: 0.12 }, // low wood block
  78: { kind: 'membrane', pitch: 'E4', decay: 0.14 }, // mute cuica
  79: { kind: 'membrane', pitch: 'C4', decay: 0.3 }, // open cuica
  80: { kind: 'metal', freq: 1200, decay: 0.4, harmonicity: 20 }, // mute triangle
  81: { kind: 'metal', freq: 1200, decay: 1.4, harmonicity: 20 }, // open triangle
};

const FALLBACK: VoiceSpec = { kind: 'noise', decay: 0.12, hp: 2000 };

interface Voice {
  trigger: (dur: number, time: number, vel: number) => void;
  dispose: () => void;
}

/**
 * Drop-in replacement for a Tone instrument, but routed by drum pitch.
 * Exposes the same triggerAttackRelease/connect/dispose surface the engine
 * already uses for synths and samplers.
 */
export class DrumKit {
  private out: Tone.Gain;
  private voices = new Map<number, Voice>();

  constructor() {
    this.out = new Tone.Gain(1);
  }

  connect(node: Tone.InputNode): this {
    this.out.connect(node as never);
    return this;
  }

  toDestination(): this {
    this.out.toDestination();
    return this;
  }

  private build(spec: VoiceSpec): Voice {
    if (spec.kind === 'membrane') {
      const synth = new Tone.MembraneSynth({
        octaves: spec.octaves ?? 4,
        envelope: { attack: 0.001, decay: spec.decay, sustain: 0, release: 0.02 },
      }).connect(this.out);
      return {
        trigger: (_d, time, vel) =>
          synth.triggerAttackRelease(spec.pitch, spec.decay, time, vel),
        dispose: () => synth.dispose(),
      };
    }
    if (spec.kind === 'metal') {
      const synth = new Tone.MetalSynth({
        harmonicity: spec.harmonicity ?? 5.1,
        resonance: 4000,
        envelope: { attack: 0.001, decay: spec.decay, release: 0.02 },
      }).connect(this.out);
      synth.frequency.value = spec.freq;
      return {
        trigger: (_d, time, vel) =>
          synth.triggerAttackRelease(spec.decay, time, vel * 0.6),
        dispose: () => synth.dispose(),
      };
    }
    // filtered noise for snares / hats / shakers
    const filter = new Tone.Filter(spec.hp ?? 1000, 'highpass').connect(this.out);
    const synth = new Tone.NoiseSynth({
      noise: { type: spec.type ?? 'white' },
      envelope: { attack: 0.001, decay: spec.decay, sustain: 0, release: 0.02 },
    }).connect(filter);
    return {
      trigger: (_d, time, vel) =>
        synth.triggerAttackRelease(spec.decay, time, vel),
      dispose: () => {
        synth.dispose();
        filter.dispose();
      },
    };
  }

  private voiceFor(pitch: number): Voice {
    let v = this.voices.get(pitch);
    if (!v) {
      v = this.build(KIT[pitch] ?? FALLBACK);
      this.voices.set(pitch, v);
    }
    return v;
  }

  /** Build the voices for these pitches now, so the first hit isn't spent
   *  constructing Tone nodes inside the scheduler callback. */
  prime(pitches: Iterable<number>) {
    for (const p of pitches) this.voiceFor(p);
  }

  /** `note` may be a name ("C1") or a raw MIDI number. */
  triggerAttackRelease(
    note: string | number,
    duration: number,
    time?: number,
    velocity = 0.8
  ) {
    const pitch =
      typeof note === 'number' ? note : (TonalNote.midi(note) ?? 36);
    this.voiceFor(pitch).trigger(duration, time ?? Tone.now(), velocity);
  }

  dispose() {
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.out.dispose();
  }
}
