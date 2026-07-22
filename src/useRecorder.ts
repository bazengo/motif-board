import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { engine } from './audio/engine';
import { mixAllItems } from './lib/mix';
import { bricksInGroup } from './lib/groups';
import {
  onNoteOn,
  onNoteOff,
  emitNoteOn,
  emitNoteOff,
  keyToSemitone,
} from './audio/midi-in';

/**
 * Note input + recording for the brick editor. Notes arrive from a MIDI
 * keyboard or the computer keyboard; while recording they're captured against
 * the looping brick's playhead.
 */
export function useRecorder(brickId: string) {
  const [octave, setOctave] = useState(4);
  const [recording, setRecording] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [quantizeInput, setQuantizeInput] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** What to play alongside while recording: null, `mix:<id>` or `group:<id>`. */
  const [backing, setBacking] = useState<string | null>(null);
  const [metronome, setMetronome] = useState(false);
  const [held, setHeld] = useState<number[]>([]);

  // pitch -> beat position where the note started
  const pending = useRef(new Map<number, number>());
  const recordingRef = useRef(false);
  const quantizeRef = useRef(quantizeInput);
  recordingRef.current = recording;
  quantizeRef.current = quantizeInput;

  const currentBeat = useCallback(() => {
    const b = useStore.getState().bricks.find((x) => x.id === brickId);
    if (!b) return 0;
    const raw = engine.transportBeats();
    return ((raw % b.lengthBeats) + b.lengthBeats) % b.lengthBeats;
  }, [brickId]);

  // --- capture incoming notes ---
  useEffect(() => {
    const offOn = onNoteOn((pitch, velocity) => {
      const st = useStore.getState();
      const brick = st.bricks.find((x) => x.id === brickId);
      if (!brick) return;
      engine.preview(pitch, brick.instrument, velocity, brick.percussion);
      setHeld((h) => (h.includes(pitch) ? h : [...h, pitch]));
      if (recordingRef.current) pending.current.set(pitch, currentBeat());
    });

    const offOff = onNoteOff((pitch) => {
      setHeld((h) => h.filter((p) => p !== pitch));
      if (!recordingRef.current) return;
      const start = pending.current.get(pitch);
      if (start == null) return;
      pending.current.delete(pitch);
      const st = useStore.getState();
      const brick = st.bricks.find((x) => x.id === brickId);
      if (!brick) return;
      const end = currentBeat();
      // wrap if the note crossed the loop point
      let dur = end - start;
      if (dur <= 0) dur += brick.lengthBeats;
      const grid = st.grid;
      const snap = (v: number) => Math.round(v / grid) * grid;
      const s = quantizeRef.current ? snap(start) : start;
      const d = Math.max(grid, quantizeRef.current ? snap(dur) : dur);
      st.addNote(brickId, {
        pitch,
        start: Math.max(0, Math.min(brick.lengthBeats - grid, s)),
        duration: d,
        velocity: 0.8,
      });
    });

    return () => {
      offOn();
      offOff();
    };
  }, [brickId, currentBeat]);

  // --- computer keyboard as a playable instrument ---
  useEffect(() => {
    const down = new Set<string>();
    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        setOctave((o) => Math.max(0, o - 1));
        return;
      }
      if (k === 'x') {
        setOctave((o) => Math.min(8, o + 1));
        return;
      }
      const semi = keyToSemitone(k);
      if (semi == null || down.has(k)) return;
      down.add(k);
      e.preventDefault();
      emitNoteOn(12 * (octave + 1) + semi, 0.8);
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      const semi = keyToSemitone(k);
      if (semi == null || !down.has(k)) return;
      down.delete(k);
      emitNoteOff(12 * (octave + 1) + semi);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [octave]);

  const stop = useCallback(() => {
    setRecording(false);
    setCountdown(null);
    pending.current.clear();
    engine.stop();
  }, []);

  const start = useCallback(async () => {
    const st = useStore.getState();
    const brick = st.bricks.find((x) => x.id === brickId);
    if (!brick) return;

    const begin = () => {
      setCountdown(null);
      pending.current.clear();
      setRecording(true);

      // loop the brick so you can hear what you're playing against, plus any
      // chosen backing (a mix or a board group) so you can play along to it
      const items: Parameters<typeof engine.play>[0] = [
        { brick, loop: true, gain: 0.9 },
      ];
      if (backing) {
        const [kind, id] = backing.split(':');
        if (kind === 'mix') {
          const mix = st.mixes.find((m) => m.id === id);
          if (mix) {
            for (const it of mixAllItems(mix, st.bricks)) {
              // the brick being recorded is already in the list
              if (it.brick.id !== brick.id) items.push({ ...it, loop: true });
            }
          }
        } else {
          const group = st.groups.find((g) => g.id === id);
          if (group) {
            for (const b of bricksInGroup(group, st.bricks)) {
              if (b.id !== brick.id)
                items.push({ brick: b, loop: true, gain: 0.75 });
            }
          }
        }
      }
      // everything follows the recorded brick's tempo
      engine.play(items, brick.bpm);
      if (metronome) engine.startMetronome(brick.timeSig?.num ?? 4);
      else engine.stopMetronome();
    };

    if (!countIn) {
      begin();
      return;
    }

    // count in one bar at the brick's tempo and time signature
    const beats = brick.timeSig?.num ?? 4;
    const msPerBeat = (60 / brick.bpm) * 1000;
    for (let i = 0; i < beats; i++) {
      setTimeout(() => {
        setCountdown(beats - i);
        engine.metronomeClick(i === 0);
      }, i * msPerBeat);
    }
    setTimeout(begin, beats * msPerBeat);
  }, [brickId, countIn, backing, metronome]);

  return {
    octave,
    setOctave,
    recording,
    countdown,
    countIn,
    setCountIn,
    backing,
    setBacking,
    metronome,
    setMetronome,
    quantizeInput,
    setQuantizeInput,
    held,
    start,
    stop,
  };
}
