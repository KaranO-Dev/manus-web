"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  audioEngine,
  CHORD_ROOTS,
  FINGER_LABELS,
  MODES,
  RHYTHMS,
  TEMPERAMENTS,
  VOICES,
  type EngineMode,
  type FingerIndex,
  type HandSide,
  type ModeId,
  type PlayQuantizeMode,
  type RhythmId,
  type SynthParams,
  type TemperamentId,
  type UIMode,
  type VoiceBank,
  type ScoreRecap,
  type VoiceId,
  isBeamSong,
} from "@/lib/audio";
import {
  getPinchEnterThreshold,
  loadPinchEnterThreshold,
  setPinchEnterThreshold,
  type MacroGestureEvent,
} from "@/lib/gestures";
import { SHADER_LOOKS, type ShaderLookId } from "@/lib/shader";
import { count } from "@/lib/events";
import { FitLine } from "@/components/FitLine";
import { StageCanvas, type TelemetryState } from "@/components/StageCanvas";

const LEFT_KEYS = ["A", "S", "D", "F"] as const;
const RIGHT_KEYS = ["J", "K", "L", ";"] as const;
const TE_COLORS = ["#2D7FF9", "#F5A623", "#9E9C95", "#FF3B2F"] as const;
const THEREMIN_OFF_HINT = "Off while the theremin is off. Turn it on in the toolbar.";

type SavedPatch = {
  name: string;
  voice: VoiceId;
  mode: ModeId;
  look: ShaderLookId;
  engineMode: EngineMode;
  synth: SynthParams;
  catchStride: 1 | 2 | 4;
  laserStrum: boolean;
  bourdon: boolean;
};

const BENCH_KEY = "manus.bench.v1";
const THEREMIN_KEY = "manus.theremin";

/* The recap's grades: the engine's name for each, its label on the key, and the word a screen reader says */
const GRADE_KEY = [
  ["PERFECT", "Perfect", "perfect"],
  ["GREAT", "Great", "great"],
  ["GOOD", "Good", "good"],
  ["MISS", "Miss", "missed"],
] as const;

// The footer's key legend: the keys no toolbar button shows, since each button writes its own key on itself, and ? for the guide
const FOOTER_KEYS = [
  ["ASDF", "Chords/Bass"],
  ["JKL;", "Lead Beams"],
  ["1–6", "Voice"],
  ["B", "Bank A/B"],
  ["G", "Drone + Chord"],
  ["?", "Guide"],
] as const;

// Every key, listed at the bottom of the guide
const GUIDE_KEYS = [
  ["A S D F", "Chords and bass"],
  ["J K L ;", "Lead beams"],
  ["1–6", "Voice"],
  ["B", "Bank A or B"],
  ["G", "Drone and a chord"],
  ["Space", "Sub drone"],
  ["Z", "Hold stutter, while held"],
  ["P", "Play riff"],
  ["N", "Play along"],
  ["I", "Pinch play or glide strum"],
  ["T", "Theremin"],
  ["Q", "Quantize or hand guide"],
  ["E", "Recall"],
  ["R", "Tape record"],
  ["Delete", "Clear the tape"],
  ["V", "Record a clip"],
  ["C", "Camera"],
  ["X", "Simple or Expert"],
  ["M", "MIDI, in Expert"],
  ["W", "Lesson"],
  ["?", "This guide"],
  ["Arrows", "Turn a focused knob"],
  ["Esc", "Close"],
] as const;
/** The rhythms with a backing stem: what a setlist slot can hold, and the default setlist */
const STEM_RHYTHMS: RhythmId[] = RHYTHMS.filter((r) => r.loopFile).map((r) => r.id);
const DEFAULT_SETLIST: RhythmId[] = [...STEM_RHYTHMS];

function readBench(): { patches: (SavedPatch | null)[]; setlist: RhythmId[] } {
  const empty = {
    patches: [null, null, null, null] as (SavedPatch | null)[],
    setlist: DEFAULT_SETLIST,
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(BENCH_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as {
      patches?: (SavedPatch | null)[];
      setlist?: RhythmId[];
    };
    return {
      patches:
        Array.isArray(data.patches) && data.patches.length === 4
          ? data.patches
          : empty.patches,
      setlist:
        Array.isArray(data.setlist) && data.setlist.length === 4
          ? // The fourth rhythm used to have the id "veridis"; a setlist saved under it maps to "solar"
            data.setlist.map((id) => ((id as string) === "veridis" ? "solar" : id))
          : empty.setlist,
    };
  } catch {
    return empty;
  }
}

/** A button label that swaps between two texts without changing the button's width: both are laid out, one shows */
function SwapLabel({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span className="swap-label">
      <span data-shown={on} aria-hidden={!on || undefined}>
        {onText}
      </span>
      <span data-shown={!on} aria-hidden={on || undefined}>
        {offText}
      </span>
    </span>
  );
}

/** The key that does what this button does, a small keycap after its label. Hidden on phones and touch screens */
function KeyHint({ k }: { k: string }) {
  return (
    <kbd className="key-hint" aria-hidden="true">
      {k}
    </kbd>
  );
}

function PhysicalEncoder({
  label,
  shortLabel,
  valueNorm,
  capColor,
  onChange,
  disabledHint,
}: {
  label: string;
  /** Shown instead of the label where the knob is too narrow for it (a phone) */
  shortLabel?: string;
  valueNorm: number;
  capColor: string;
  onChange: (nextVal: number) => void;
  /** Set while the knob does nothing: it dims, ignores input, and says why */
  disabledHint?: string;
}) {
  const off = disabledHint !== undefined;
  const clamped = Math.max(0, Math.min(1, valueNorm));
  const angleDeg = -135 + clamped * 270;
  const dragRef = useRef<{
    startY: number;
    startX: number;
    startVal: number;
    moved: boolean;
  } | null>(null);

  const nudge = (delta: number) =>
    onChange(Math.max(0.02, Math.min(0.98, clamped + delta)));

  return (
    <div
      className="knob-socket"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={off ? "off" : undefined}
      aria-disabled={off || undefined}
      title={off ? `${label}: ${disabledHint}` : `${label}: drag up or down, scroll, click to step, or use the arrow keys`}
      onKeyDown={(e) => {
        if (off) return;
        const step = e.shiftKey ? 0.1 : 0.02;
        const keys: Record<string, () => void> = {
          ArrowUp: () => nudge(step),
          ArrowRight: () => nudge(step),
          ArrowDown: () => nudge(-step),
          ArrowLeft: () => nudge(-step),
          PageUp: () => nudge(0.1),
          PageDown: () => nudge(-0.1),
          Home: () => onChange(0.02),
          End: () => onChange(0.98),
        };
        const act = keys[e.key];
        if (!act) return;
        e.preventDefault();
        act();
      }}
      onWheel={(e) => {
        if (off) return;
        e.preventDefault();
        const delta = (-e.deltaY + e.deltaX) * 0.0025;
        onChange(Math.max(0.02, Math.min(0.98, clamped + delta)));
      }}
      onPointerDown={(e) => {
        if (off) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          startY: e.clientY,
          startX: e.clientX,
          startVal: clamped,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const dy = dragRef.current.startY - e.clientY;
        const dx = e.clientX - dragRef.current.startX;
        if (Math.abs(dy) > 3 || Math.abs(dx) > 3) {
          dragRef.current.moved = true;
          const next = Math.max(
            0.02,
            Math.min(0.98, dragRef.current.startVal + (dy + dx * 0.5) / 110)
          );
          onChange(next);
        }
      }}
      onPointerUp={(e) => {
        if (dragRef.current && !dragRef.current.moved) {
          audioEngine.playMechanicalClick(1320);
          const stepped = ((clamped + 0.16) % 0.96) + 0.04;
          onChange(stepped);
        }
        dragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
      }}
      onDoubleClick={() => {
        if (off) return;
        audioEngine.playMechanicalClick(1520);
        onChange(0.5);
      }}
    >
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle
          cx="23"
          cy="23"
          r="20"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1.2"
          strokeDasharray="2 3.2"
        />
        <circle
          cx="23"
          cy="23"
          r="16.5"
          fill="#121215"
          stroke="#08080A"
          strokeWidth="1.5"
        />
        <g transform={`rotate(${angleDeg} 23 23)`}>
          <circle
            cx="23"
            cy="23"
            r="12.5"
            fill={capColor}
            stroke="rgba(255,255,255,0.38)"
            strokeWidth="1"
          />
          <line
            x1="23"
            y1="11.5"
            x2="23"
            y2="20"
            stroke="#111113"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="17"
            y1="23"
            x2="29"
            y2="23"
            stroke="rgba(17,17,19,0.4)"
            strokeWidth="1.4"
          />
        </g>
      </svg>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8px",
          color: "#d0cdc4",
          marginTop: "1px",
        }}
      >
        {shortLabel ? (
          <>
            <span className="knob-label-long">{label}</span>
            <span className="knob-label-short">{shortLabel}</span>
          </>
        ) : (
          label
        )}
      </span>
    </div>
  );
}

function OledTapeGraphic({
  playing,
  recording,
  progress,
  waveform,
  onClick,
}: {
  playing: boolean;
  recording: boolean;
  progress: number;
  waveform: number[];
  onClick: () => void;
}) {
  const rotDeg = Math.round(progress * 720);
  const reelColor = recording ? "#FF3B2F" : playing ? "#2D7FF9" : "#7C7A72";

  const wavePoints = waveform
    .map((v, i) => {
      const x = 14 + (i / Math.max(1, waveform.length - 1)) * 128;
      const y = 45 + v * 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to toggle 4-Bar Tape Looper"
      style={{ justifySelf: "end", display: "block" }}
    >
      <svg width="156" height="58" viewBox="0 0 156 58">
        <rect
          x="2"
          y="3"
          width="152"
          height="52"
          rx="5"
          fill="#0B0B10"
          stroke="rgba(244,239,230,0.18)"
          strokeWidth="1"
        />

        <polyline
          fill="none"
          stroke={playing ? "#F5A623" : "#2D7FF9"}
          strokeWidth="1.4"
          points={wavePoints}
        />

        <g transform={`translate(44, 24) rotate(${rotDeg})`}>
          <circle
            cx="0"
            cy="0"
            r="15.5"
            fill="none"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <circle
            cx="0"
            cy="0"
            r="4.5"
            fill="none"
            stroke="#F4EFE6"
            strokeWidth="1.2"
          />
          <line
            x1="0"
            y1="-4.5"
            x2="0"
            y2="-14"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <line
            x1="4"
            y1="2.3"
            x2="12"
            y2="7"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <line
            x1="-4"
            y1="2.3"
            x2="-12"
            y2="7"
            stroke={reelColor}
            strokeWidth="1.4"
          />
        </g>

        <g transform={`translate(112, 24) rotate(${rotDeg})`}>
          <circle
            cx="0"
            cy="0"
            r="15.5"
            fill="none"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <circle
            cx="0"
            cy="0"
            r="4.5"
            fill="none"
            stroke="#F4EFE6"
            strokeWidth="1.2"
          />
          <line
            x1="0"
            y1="-4.5"
            x2="0"
            y2="-14"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <line
            x1="4"
            y1="2.3"
            x2="12"
            y2="7"
            stroke={reelColor}
            strokeWidth="1.4"
          />
          <line
            x1="-4"
            y1="2.3"
            x2="-12"
            y2="7"
            stroke={reelColor}
            strokeWidth="1.4"
          />
        </g>
      </svg>
    </button>
  );
}

function MicroFader({
  label,
  value,
  display,
  onChange,
  resetValue,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (next: number) => void;
  resetValue: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const applyAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(next);
  };

  return (
    <div className="micro-fader">
      <div className="micro-fader-top">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div
        ref={trackRef}
        className="micro-fader-track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onWheel={(e) => {
          e.preventDefault();
          onChange(
            Math.max(0, Math.min(1, value + -e.deltaY * 0.0012))
          );
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = true;
          applyAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          applyAt(e.clientX);
        }}
        onPointerUp={() => {
          dragRef.current = false;
        }}
        onPointerCancel={() => {
          dragRef.current = false;
        }}
        onDoubleClick={() => onChange(resetValue)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.05 : 0.01;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(1, value + step));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(0, value - step));
          } else if (e.key === "Home") {
            onChange(0);
          } else if (e.key === "End") {
            onChange(1);
          }
        }}
      >
        <div
          className="micro-fader-fill"
          style={{ width: `calc(${value * 100}% - 4px)` }}
        />
        <div className="micro-fader-cap" style={{ left: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export default function ManusInstrumentPage() {
  const [uiMode, setUiMode] = useState<UIMode>("simple");
  const [quantizeMode, setQuantizeMode] =
    useState<PlayQuantizeMode>("quantized");
  const [voice, setVoice] = useState<VoiceId>("organ");
  const [voiceBank, setVoiceBank] = useState<VoiceBank>("A");
  const [engineMode, setEngineMode] = useState<EngineMode>("hybrid");
  const temperament: TemperamentId = "equal";
  const [mode, setMode] = useState<ModeId>("dorian");
  const [look, setLook] = useState<ShaderLookId>("speculum");
  const [rhythm, setRhythm] = useState<RhythmId>("off");
  const [seqStepsVersion, setSeqStepsVersion] = useState<number>(0);
  const [cameraRequested, setCameraRequested] = useState<boolean>(false);
  // Off is pinch play: an open hand aims without a sound and a pinch plays the beam. On is glide strum: crossing a beam plays it
  const [laserStrumEnabled, setLaserStrumEnabled] = useState<boolean>(false);
  const [thereminEnabled, setThereminEnabled] = useState(true);

  // The theremin's switch, from the button or the T key: a rising or falling cue, and kept for the next visit
  const toggleTheremin = useCallback(() => {
    const next = !thereminEnabled;
    audioEngine.playSwitchCue(next);
    setThereminEnabled(next);
    try {
      window.localStorage.setItem(THEREMIN_KEY, next ? "on" : "off");
    } catch {
      /* storage blocked or full: the choice isn't kept for the next visit */
    }
  }, [thereminEnabled]);

  useEffect(() => {
    // Read after hydration on purpose: the server cannot see localStorage
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage after hydration
      if (window.localStorage.getItem(THEREMIN_KEY) === "off") setThereminEnabled(false);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const [catchStride, setCatchStride] = useState<1 | 2 | 4>(4);
  const [benchOpen, setBenchOpen] = useState(false);
  const [patches, setPatches] = useState<(SavedPatch | null)[]>(
    () => readBench().patches
  );
  const [setlist, setSetlist] = useState<RhythmId[]>(
    () => readBench().setlist
  );
  const [setlistOn, setSetlistOn] = useState(false);
  const [recap, setRecap] = useState<ScoreRecap | null>(null);
  const [pinchEnter, setPinchEnter] = useState(0.52);
  const [midiClock, setMidiClock] = useState(false);
  const [calNote, setCalNote] = useState("");
  const setlistOnRef = useRef(false);
  const setlistRef = useRef(setlist);
  const pinchRef = useRef(0);
  const [setlistIndex, setSetlistIndex] = useState(0);
  const setlistIndexRef = useRef(0); // the same index, for handleTelemetry, which runs outside React's render
  const [bourdonDrone, setBourdonDrone] = useState<boolean>(false);
  const [codexOpen, setCodexOpen] = useState<boolean>(false);
  const [synthParams, setSynthParams] = useState<SynthParams>({
    attackNorm: 0.08,
    releaseNorm: 0.55,
    subLevel: 0.52,
    driveNorm: 0.45,
    chorusMix: 0.48,
    bpm: 120,
  });
  const [midiStatus, setMidiStatus] = useState<{
    enabled: boolean;
    portNames: string[];
  }>({ enabled: false, portNames: [] });
  const [clipRecording, setClipRecording] = useState<boolean>(false);
  const [macroToast, setMacroToast] = useState<MacroGestureEvent | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [loopState, setLoopState] = useState({
    recording: false,
    playing: false,
    progress: 0,
    bar: 1,
    count: 0,
  });

  const [telemetry, setTelemetry] = useState<TelemetryState>({
    cameraActive: false,
    demoMode: true,
    handsDetected: 2,
    lastNote: "Oct I",
    lastSolmization: "D4",
    lastFreqHz: 293.66,
    lastFinger: "BEAM 6 · D4",
    currentVowel: "A",
    spaceWarp: 0.36,
    blurAmount: 0.28,
    filterCutoffNorm: 0.72,
    wristTwistNorm: 0.5,
    handBridgeNorm: 0.4,
    reverbAmount: 0.5,
    activeFingersLeft: [false, false, false, false],
    activeFingersRight: [false, false, false, false],
    hoveredStringIndex: 5,
    ribbonSlotHover: -1,
    ribbonHoldProgress: 0,
    waveform: Array(32).fill(0),
    activeStepIndex: 0,
    songStepFloat: 0,
    chordRootIdx: 0,
    stutterActive: false,
    guideTargetBeam: null,
    arcadeScore: 0,
    arcadeCombo: 0,
    arcadeMultiplier: 1,
    arcadeGrade: null,
    arcadeHands: false,
    pinchDistance: 0,
    visionMs: 16,
    audioMs: 0,
  });

  const externalTriggerRef = useRef<
    ((hand: HandSide, finger: FingerIndex, silentAudio?: boolean) => void) | null
  >(null);
  const externalPortalSurgeRef = useRef<(() => void) | null>(null);
  const externalSetKnobRef = useRef<
    ((knob: "cutoff" | "warp" | "rotatio" | "reverb", val: number) => void) | null
  >(null);

  const handleTelemetry = useCallback((t: TelemetryState) => {
    setTelemetry(t);
    setLoopState(audioEngine.getLoopState());
    pinchRef.current = t.pinchDistance;
    if (!setlistOnRef.current) return;
    if (!audioEngine.consumeSongBoundary()) return;
    const songs = setlistRef.current.filter((id) => id !== "off");
    const next = setlistIndexRef.current + 1;
    if (!songs.length || next >= songs.length) {
      setlistOnRef.current = false;
      setSetlistOn(false);
      audioEngine.setSetlistArmed(false);
      audioEngine.setRhythmPattern("off");
      setRhythm("off");
      const done = audioEngine.takeRecap();
      if (done && (done.hits > 0 || done.misses > 0)) setRecap(done);
      setlistIndexRef.current = 0;
      setSetlistIndex(0);
      return;
    }
    const id = songs[next];
    audioEngine.setRhythmPattern(id);
    setRhythm(id);
    setSynthParams(audioEngine.getSynthParams());
    const spec = RHYTHMS.find((r) => r.id === id);
    if (spec) {
      setVoice(spec.defaultVoice);
      const found = VOICES.find((v) => v.id === spec.defaultVoice);
      if (found) setVoiceBank(found.bank);
    }
    setlistIndexRef.current = next;
    setSetlistIndex(next);
  }, []);

  useEffect(() => {
    // Read after hydration on purpose: the calibrated pinch lives in localStorage, which the server cannot see
    loadPinchEnterThreshold();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage after hydration
    setPinchEnter(getPinchEnterThreshold());
  }, []);

  useEffect(() => {
    setlistOnRef.current = setlistOn;
    setlistRef.current = setlist;
  }, [setlistOn, setlist]);

  const persistBench = (
    nextPatches: (SavedPatch | null)[],
    nextSetlist: RhythmId[]
  ) => {
    try {
      window.localStorage.setItem(
        BENCH_KEY,
        JSON.stringify({ patches: nextPatches, setlist: nextSetlist })
      );
    } catch {
      /* storage blocked or full: the bench works for this visit only */
    }
  };

  const applyRhythm = useCallback((next: RhythmId) => {
    if (next !== "off") count("song-start");
    audioEngine.setRhythmPattern(next);
    setRhythm(next);
    setSynthParams(audioEngine.getSynthParams());
    if (next === "off") {
      setSetlistOn(false);
      setlistOnRef.current = false;
      audioEngine.setSetlistArmed(false);
      const done = audioEngine.takeRecap();
      if (done && (done.hits > 0 || done.misses > 0)) setRecap(done);
    }
  }, []);

  // Each toolbar button's action, shared by its click and its key
  const toggleRiff = useCallback(() => {
    const riffOn = rhythm !== "off" && !isBeamSong(rhythm);
    const next: RhythmId = riffOn ? "off" : "saltarello";
    audioEngine.playMechanicalClick(1320);
    if (next !== "off") {
      setVoice("organ");
      setVoiceBank("A");
    }
    applyRhythm(next);
  }, [rhythm, applyRhythm]);

  const togglePinchPlay = useCallback(() => {
    audioEngine.playMechanicalClick(1250);
    setLaserStrumEnabled((prev) => !prev);
  }, []);

  const togglePlayAlong = useCallback(() => {
    audioEngine.playMechanicalClick(900);
    if (isBeamSong(rhythm)) {
      applyRhythm("off");
      return;
    }
    const spec = RHYTHMS.find((r) => r.id === "anthem");
    if (spec) {
      setVoice(spec.defaultVoice);
      const found = VOICES.find((v) => v.id === spec.defaultVoice);
      if (found) setVoiceBank(found.bank);
    }
    applyRhythm("anthem");
  }, [rhythm, applyRhythm]);

  const toggleBench = useCallback(() => {
    audioEngine.playMechanicalClick(1100);
    setBenchOpen((open) => !open);
  }, []);

  const toggleQuantize = useCallback(() => {
    audioEngine.playMechanicalClick(1280);
    const next: PlayQuantizeMode = quantizeMode === "guide" ? "quantized" : "guide";
    setQuantizeMode(next);
    audioEngine.setPlayQuantizeMode(next);
  }, [quantizeMode]);

  const toggleDrone = useCallback(() => {
    const next = !bourdonDrone;
    setBourdonDrone(next);
    audioEngine.toggleBourdonDrone(next, mode);
  }, [bourdonDrone, mode]);

  const connectMidi = useCallback(async () => {
    setMidiStatus(await audioEngine.initWebMidi());
  }, []);

  const toggleCamera = useCallback(() => {
    audioEngine.ensureContext();
    audioEngine.playMechanicalClick(1480);
    setCameraRequested((prev) => !prev);
  }, []);

  const toggleUiMode = useCallback(() => {
    audioEngine.playMechanicalClick(1380);
    setUiMode((prev) => (prev === "simple" ? "expert" : "simple"));
  }, []);

  const clearTape = useCallback(() => {
    audioEngine.clearLoop();
    setLoopState(audioEngine.getLoopState());
  }, []);

  const updateSynthParam = useCallback((partial: Partial<SynthParams>) => {
    audioEngine.setSynthParams(partial);
    setSynthParams(audioEngine.getSynthParams());
  }, []);

  const handleMacroGesture = useCallback(
    (ev: MacroGestureEvent) => {
      setMacroToast(ev);

      if (ev.kind === "RIBBON_VOICE") {
        audioEngine.playMechanicalClick(1380);
        setVoice((prev) => {
          const idx = VOICES.findIndex((v) => v.id === prev);
          const nextSpec = VOICES[(idx + 1) % VOICES.length];
          setVoiceBank(nextSpec.bank);
          return nextSpec.id;
        });
      } else if (ev.kind === "RIBBON_SHADER") {
        audioEngine.playMechanicalClick(1160);
        setLook((prev) => {
          const idx = SHADER_LOOKS.findIndex((l) => l.id === prev);
          return SHADER_LOOKS[(idx + 1) % SHADER_LOOKS.length].id;
        });
      } else if (ev.kind === "RIBBON_MODE") {
        audioEngine.playMechanicalClick(1260);
        setMode((prev) => {
          const idx = MODES.findIndex((m) => m.id === prev);
          return MODES[(idx + 1) % MODES.length].id;
        });
      } else if (
        ev.kind === "RIBBON_DRONE" ||
        ev.kind === "FIST_DRONE_LOCK"
      ) {
        audioEngine.triggerCrownChord(mode, voice);
        setBourdonDrone((prev) => {
          const next = !prev;
          audioEngine.toggleBourdonDrone(next, mode);
          return next;
        });
      } else if (ev.kind === "RIBBON_LOOP") {
        const next = audioEngine.toggleRecordLoop();
        setLoopState((prev) => ({
          ...prev,
          recording: next.recording,
          playing: next.playing,
          count: next.count,
        }));
      }
    },
    [mode, voice]
  );

  useEffect(() => {
    if (!macroToast) return;
    const id = window.setTimeout(() => setMacroToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [macroToast]);

  useEffect(() => {
    if (bourdonDrone) {
      audioEngine.toggleBourdonDrone(true, mode);
    }
  }, [mode, bourdonDrone]);

  const toggleClipRecording = useCallback(() => {
    if (clipRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setClipRecording(false);
      return;
    }

    const glCanvas = document.querySelector(
      ".stage-canvas-gl"
    ) as HTMLCanvasElement | null;
    const hudCanvas = document.querySelector(
      ".stage-canvas-hud"
    ) as HTMLCanvasElement | null;
    if (!glCanvas || !hudCanvas) return;

    const compCanvas = document.createElement("canvas");
    compCanvas.width = glCanvas.width || 1280;
    compCanvas.height = glCanvas.height || 720;
    const compCtx = compCanvas.getContext("2d")!;

    let active = true;
    const copyFrame = () => {
      if (!active) return;
      compCtx.drawImage(glCanvas, 0, 0, compCanvas.width, compCanvas.height);
      compCtx.drawImage(hudCanvas, 0, 0, compCanvas.width, compCanvas.height);
      requestAnimationFrame(copyFrame);
    };
    copyFrame();

    const videoStream = compCanvas.captureStream(30);
    const audioStream = audioEngine.getRecordingAudioStream();
    if (audioStream) {
      audioStream.getAudioTracks().forEach((t) => videoStream.addTrack(t));
    }

    recordedChunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(videoStream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm",
      });
    } catch {
      active = false; // this browser can't record the stage, so stop copying frames
      return;
    }

    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      active = false;
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `manus-performance-${Date.now()}.webm`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };

    mediaRecorderRef.current = rec;
    rec.start();
    setClipRecording(true);
  }, [clipRecording]);

  const bankVoices = VOICES.filter((v) => v.bank === voiceBank);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || e.key === "/") {
        e.preventDefault();
        setCodexOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && codexOpen) {
        setCodexOpen(false);
        return;
      }
      if (e.key === "Escape") {
        setRecap(null);
        return;
      }

      const k = e.key.toUpperCase();

      const leftIdx = LEFT_KEYS.indexOf(k as (typeof LEFT_KEYS)[number]);
      if (leftIdx !== -1) {
        e.preventDefault();
        audioEngine.setChordRootIndex(leftIdx as 0 | 1 | 2 | 3);
        externalTriggerRef.current?.("left", leftIdx as FingerIndex);
        return;
      }

      const rightIdx = RIGHT_KEYS.indexOf(k as (typeof RIGHT_KEYS)[number]);
      if (rightIdx !== -1) {
        e.preventDefault();
        externalTriggerRef.current?.("right", rightIdx as FingerIndex);
        return;
      }

      if (["1", "2", "3", "4", "5", "6"].includes(k)) {
        const idx = Number(k) - 1;
        if (bankVoices[idx]) {
          audioEngine.playMechanicalClick(1350);
          setVoice(bankVoices[idx].id);
        }
      } else if (k === "B") {
        e.preventDefault();
        audioEngine.playMechanicalClick(1300);
        setVoiceBank((prev) => (prev === "A" ? "B" : "A"));
      } else if (k === " ") {
        // preventDefault also keeps Space from pressing a toolbar button that still has focus from a click
        e.preventDefault();
        toggleDrone();
      } else if (k === "R") {
        e.preventDefault();
        audioEngine.toggleRecordLoop();
        setLoopState(audioEngine.getLoopState());
      } else if (k === "C") {
        e.preventDefault();
        toggleCamera();
      } else if (k === "T") {
        e.preventDefault();
        toggleTheremin();
      } else if (k === "G") {
        e.preventDefault();
        externalPortalSurgeRef.current?.();
        handleMacroGesture({
          kind: "FIST_DRONE_LOCK",
          title: "DRONE & CHORD SURGE",
          subtitle: "Sub-Brass Drone + 5-Voice Chord",
          timestamp: performance.now(),
        });
      } else if (k in buttonKeys) {
        e.preventDefault();
        buttonKeys[k]();
      } else if (k === "Z") {
        e.preventDefault();
        audioEngine.setStutterFreeze(true);
      } else if (k === "BACKSPACE" || k === "DELETE") {
        e.preventDefault();
        clearTape();
      }
    }

    // the toolbar's keys, each written on its button
    const buttonKeys: Record<string, () => void> = {
      P: toggleRiff,
      I: togglePinchPlay,
      N: togglePlayAlong,
      E: toggleBench,
      Q: toggleQuantize,
      V: toggleClipRecording,
      X: toggleUiMode,
      ...(uiMode === "expert" ? { M: () => void connectMidi() } : {}),
    };

    // Z holds the stutter only while it is down, like the `HOLD STUTTER` button
    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toUpperCase() === "Z") audioEngine.setStutterFreeze(false);
    }
    function onBlur() {
      audioEngine.setStutterFreeze(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    codexOpen,
    bankVoices,
    handleMacroGesture,
    toggleTheremin,
    toggleDrone,
    toggleCamera,
    toggleRiff,
    togglePinchPlay,
    togglePlayAlong,
    toggleBench,
    toggleQuantize,
    toggleClipRecording,
    toggleUiMode,
    connectMidi,
    clearTape,
    uiMode,
  ]);

  const currentVoiceSpec = VOICES.find((v) => v.id === voice) ?? VOICES[0];
  const currentLookSpec =
    SHADER_LOOKS.find((l) => l.id === look) ?? SHADER_LOOKS[0];
  const currentModeSpec = MODES.find((m) => m.id === mode) ?? MODES[0];
  const currentTempSpec =
    TEMPERAMENTS.find((t) => t.id === temperament) ?? TEMPERAMENTS[0];
  const dynamicWdth = Math.round(75 + telemetry.spaceWarp * 70);
  const dynamicWght = Math.round(450 + telemetry.filterCutoffNorm * 450);

  const activeSequenceSteps =
    rhythm !== "off"
      ? audioEngine.getSequenceSteps(rhythm)
      : audioEngine.getSequenceSteps("saltarello");
  // The engine owns the steps; a step edit bumps seqStepsVersion so this render reads them again
  void seqStepsVersion;

  const savePatch = (slot: number) => {
    const patch: SavedPatch = {
      name: `${currentVoiceSpec.roman} ${synthParams.bpm}`,
      voice,
      mode,
      look,
      engineMode,
      synth: audioEngine.getSynthParams(),
      catchStride,
      laserStrum: laserStrumEnabled,
      bourdon: bourdonDrone,
    };
    setPatches((prev) => {
      const next = [...prev];
      next[slot] = patch;
      persistBench(next, setlist);
      return next;
    });
    audioEngine.playMechanicalClick(1400);
  };

  const loadPatch = (patch: SavedPatch) => {
    setVoice(patch.voice);
    const found = VOICES.find((v) => v.id === patch.voice);
    if (found) setVoiceBank(found.bank);
    setMode(patch.mode);
    setLook(patch.look);
    setEngineMode(patch.engineMode);
    audioEngine.setEngineMode(patch.engineMode);
    audioEngine.setActiveVoiceAndMode(patch.voice, patch.mode);
    updateSynthParam(patch.synth);
    setCatchStride(patch.catchStride);
    audioEngine.setCatchStride(patch.catchStride);
    setLaserStrumEnabled(patch.laserStrum);
    setBourdonDrone(patch.bourdon);
    audioEngine.toggleBourdonDrone(patch.bourdon, patch.mode);
    audioEngine.playMechanicalClick(980);
  };

  const cycleSetSlot = (index: number) => {
    const order: RhythmId[] = ["off", ...STEM_RHYTHMS];
    setSetlist((prev) => {
      const next = [...prev];
      const at = order.indexOf(next[index]);
      next[index] = order[(at + 1) % order.length];
      persistBench(patches, next);
      return next;
    });
  };

  const playSet = () => {
    const songs = setlist.filter((id) => id !== "off");
    if (!songs.length) return;
    setlistIndexRef.current = 0;
    setSetlistIndex(0);
    setSetlistOn(true);
    setlistOnRef.current = true;
    audioEngine.setSetlistArmed(true);
    const spec = RHYTHMS.find((r) => r.id === songs[0]);
    if (spec) {
      setVoice(spec.defaultVoice);
      const found = VOICES.find((v) => v.id === spec.defaultVoice);
      if (found) setVoiceBank(found.bank);
    }
    applyRhythm(songs[0]);
  };

  const capturePinch = (phase: "open" | "pinch") => {
    if (!cameraRequested) {
      setCalNote("Open the camera first, then hold the pose.");
      return;
    }
    setCalNote(phase === "open" ? "Hold the hand open…" : "Hold the pinch…");
    const bag: number[] = [];
    const id = window.setInterval(() => {
      if (pinchRef.current > 0.05) bag.push(pinchRef.current);
    }, 70);
    window.setTimeout(() => {
      window.clearInterval(id);
      if (!bag.length) {
        setCalNote("No hand in frame.");
        return;
      }
      const avg = bag.reduce((sum, n) => sum + n, 0) / bag.length;
      const key = phase === "open" ? "manus.pinch.open" : "manus.pinch.closed";
      try {
        window.localStorage.setItem(key, String(avg));
      } catch {
        /* storage blocked or full: this pose isn't saved */
      }
      const stored = (k: string) => {
        try {
          return window.localStorage.getItem(k);
        } catch {
          return null; // storage blocked: the other pose reads as not yet calibrated
        }
      };
      const openRaw = Number(phase === "open" ? avg : stored("manus.pinch.open"));
      const closedRaw = Number(phase === "pinch" ? avg : stored("manus.pinch.closed"));
      if (openRaw > 0 && closedRaw > 0 && openRaw > closedRaw + 0.08) {
        const mid = (openRaw + closedRaw) / 2;
        setPinchEnterThreshold(mid);
        setPinchEnter(mid);
        setCalNote(`Pinch set. Open ${openRaw.toFixed(2)}, closed ${closedRaw.toFixed(2)}.`);
      } else {
        setCalNote(
          phase === "open"
            ? `Open hand ${avg.toFixed(2)}. Now pinch.`
            : `Pinch ${avg.toFixed(2)}. Hold the other pose too.`
        );
      }
    }, 1200);
  };

  return (
    <main className="chassis">
      {/* The gesture guide, opened by the `GUIDE` button or the ? key */}
      {codexOpen ? (
        <div
          className="codex-backdrop"
          onClick={() => setCodexOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="MANUS Gesture Guide"
        >
          <div className="codex-modal" onClick={(e) => e.stopPropagation()}>
            <div className="codex-header">
              <div>
                <span className="codex-title">
                  MANUS // VISUAL HAND GESTURE &amp; SYNTHESIS MANUAL
                </span>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    color: "#b5b1a8",
                    marginTop: "3px",
                  }}
                >
                  Open-hand hover aims silently over the 8 beams — pinch Thumb +
                  Index to pluck (or hold pinch &amp; drag to strum)!
                </p>
              </div>
              <button
                type="button"
                className="codex-close-btn"
                onClick={() => setCodexOpen(false)}
              >
                CLOSE [ESC]
              </button>
            </div>

            <div className="codex-grid">
              {/* Card 1: aim with an open hand, pluck with a pinch */}
              <div className="codex-card">
                <div>
                  <div className="codex-diagram">
                    <svg width="160" height="72" viewBox="0 0 160 72">
                      <line
                        x1="40"
                        y1="6"
                        x2="40"
                        y2="66"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="80"
                        y1="6"
                        x2="80"
                        y2="66"
                        stroke="#2D7FF9"
                        strokeWidth="2.5"
                      />
                      <line
                        x1="120"
                        y1="6"
                        x2="120"
                        y2="66"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="80"
                        cy="36"
                        r="14"
                        fill="rgba(255,59,47,0.2)"
                        stroke="#FF3B2F"
                        strokeWidth="2"
                      />
                      <path
                        d="M68 56 L76 38 M92 56 L84 38"
                        stroke="#FFFFFF"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                      <circle cx="80" cy="36" r="4" fill="#FFFFFF" />
                    </svg>
                  </div>
                  <div className="codex-card-head" style={{ marginTop: "8px" }}>
                    <span>01 · PINCH TO PLUCK</span>
                    <span style={{ color: "var(--te-blue)" }}>
                      SILENT HOVER
                    </span>
                  </div>
                  <div className="codex-card-title">
                    Hover Aims Silently · Pinch Plucks
                  </div>
                  <p className="codex-card-desc">
                    Moving your <strong>open hand</strong> left/right aims
                    silently over Beams #1–#8.{" "}
                    <strong>Pinch Thumb + Index</strong> on a beam to pluck it,
                    or <strong>hold pinched &amp; drag</strong> to strum.
                  </p>
                </div>
                <button
                  type="button"
                  className="codex-try-btn"
                  onClick={() => externalTriggerRef.current?.("right", 1)}
                >
                  Play beam 6
                </button>
              </div>

              {/* Card 2: hand height (the theremin) */}
              <div className="codex-card">
                <div>
                  <div className="codex-diagram">
                    <svg width="160" height="72" viewBox="0 0 160 72">
                      <line
                        x1="16"
                        y1="26"
                        x2="144"
                        y2="26"
                        stroke="#F5A623"
                        strokeWidth="2"
                      />
                      <path
                        d="M80 12 L80 60 M74 18 L80 12 L86 18 M74 54 L80 60 L86 54"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <circle cx="80" cy="26" r="5" fill="#F5A623" />
                    </svg>
                  </div>
                  <div className="codex-card-head" style={{ marginTop: "8px" }}>
                    <span>02 · THEREMIN Y (0–100%)</span>
                    <span style={{ color: "var(--te-ochre)" }}>
                      UP / DOWN
                    </span>
                  </div>
                  <div className="codex-card-title">
                    Filter, talkbox vowel &amp; reverb
                  </div>
                  <p className="codex-card-desc">
                    Raise or lower your hand between the bottom (
                    <strong>0%</strong>) and the M1–M5 keys (
                    <strong>100%</strong>) to sweep the{" "}
                    <strong>filter (220 Hz to 9.8 kHz)</strong>, the vowel{" "}
                    <strong>[U-O-A-E-I]</strong> and the reverb. With{" "}
                    <strong>THEREMIN</strong> off, height does nothing.
                  </p>
                </div>
                <button
                  type="button"
                  className="codex-try-btn"
                  disabled={!thereminEnabled}
                  onClick={() =>
                    externalSetKnobRef.current?.(
                      "cutoff",
                      ((telemetry.filterCutoffNorm + 0.25) % 0.9) + 0.1
                    )
                  }
                >
                  {thereminEnabled ? "Sweep the filter" : "The theremin is off"}
                </button>
              </div>

              {/* Card 3: the left hand's chords and the fist stutter */}
              <div className="codex-card">
                <div>
                  <div className="codex-diagram">
                    <svg width="160" height="72" viewBox="0 0 160 72">
                      <rect
                        x="18"
                        y="18"
                        width="28"
                        height="36"
                        rx="4"
                        fill="#2D7FF9"
                        fillOpacity="0.25"
                        stroke="#2D7FF9"
                        strokeWidth="1.5"
                      />
                      <rect
                        x="52"
                        y="18"
                        width="28"
                        height="36"
                        rx="4"
                        fill="#F5A623"
                        fillOpacity="0.35"
                        stroke="#F5A623"
                        strokeWidth="2"
                      />
                      <rect
                        x="86"
                        y="18"
                        width="28"
                        height="36"
                        rx="4"
                        fill="#262630"
                        stroke="#555"
                        strokeWidth="1"
                      />
                      <rect
                        x="120"
                        y="18"
                        width="28"
                        height="36"
                        rx="4"
                        fill="#262630"
                        stroke="#555"
                        strokeWidth="1"
                      />
                    </svg>
                  </div>
                  <div className="codex-card-head" style={{ marginTop: "8px" }}>
                    <span>03 · LEFT HAND CONDUCTOR</span>
                    <span style={{ color: "var(--te-ochre)" }}>
                      CHORDS &amp; FIST
                    </span>
                  </div>
                  <div className="codex-card-title">
                    Chords (I / bVI / IV / V) &amp; Stutter
                  </div>
                  <p className="codex-card-desc">
                    Move your <strong>Left Hand</strong> across Beams 1–4 to
                    shift the entire song&apos;s{" "}
                    <strong>Chord Root (I → bVI → IV → V)</strong>. Close your{" "}
                    <strong>Left Fist</strong> for a 1/16 beat stutter.
                  </p>
                </div>
                <button
                  type="button"
                  className="codex-try-btn"
                  onClick={() => {
                    const next = ((telemetry.chordRootIdx + 1) % 4) as
                      | 0
                      | 1
                      | 2
                      | 3;
                    audioEngine.setChordRootIndex(next);
                    externalTriggerRef.current?.("left", next);
                  }}
                >
                  Shift the chord
                </button>
              </div>

              {/* Card 4: the macro ribbon and the hand guide */}
              <div className="codex-card">
                <div>
                  <div className="codex-diagram">
                    <svg width="160" height="72" viewBox="0 0 160 72">
                      <rect
                        x="16"
                        y="10"
                        width="128"
                        height="20"
                        rx="4"
                        fill="#181822"
                        stroke="#2D7FF9"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="80"
                        cy="50"
                        r="11"
                        fill="none"
                        stroke="#F5A623"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                      <circle cx="80" cy="50" r="4" fill="#F5A623" />
                    </svg>
                  </div>
                  <div className="codex-card-head" style={{ marginTop: "8px" }}>
                    <span>04 · TOP MACROS &amp; GUIDE</span>
                    <span style={{ color: "var(--te-green)" }}>
                      M1–M5 &amp; GUIDE
                    </span>
                  </div>
                  <div className="codex-card-title">
                    Function keys &amp; the strike line
                  </div>
                  <p className="codex-card-desc">
                    Touch <strong>M1–M5</strong> to switch voice, optics, scale,
                    drone, or tape. On a running sequence, pinch a gem as it
                    meets the receptor. <strong>HAND GUIDE</strong> holds each
                    note until you hit it.
                  </p>
                </div>
                <button
                  type="button"
                  className="codex-try-btn"
                  onClick={() => {
                    setQuantizeMode("guide");
                    audioEngine.setPlayQuantizeMode("guide");
                    setCodexOpen(false);
                  }}
                >
                  Turn on hand guide
                </button>
              </div>
            </div>

            <section className="codex-keys" aria-labelledby="codex-keys-title">
              <h3 id="codex-keys-title" className="codex-card-head">
                KEYS
              </h3>
              <ul>
                {GUIDE_KEYS.map(([key, name]) => (
                  <li key={key}>
                    <kbd>{key}</kbd>
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {/* Top bar: interface mode, readout, toolbar and credit */}
      <header className="topbar">
        <div className="brand">
          <div className="speaker-grille" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="speaker-dot" />
            ))}
          </div>
          <span className="brand-model">MANUS</span>
          <div className="mode-tabs" role="tablist" aria-label="Interface mode">
            <button
              type="button"
              role="tab"
              aria-selected={uiMode === "simple"}
              className="mode-tab"
              data-active={uiMode === "simple"}
              aria-keyshortcuts="X"
              title="Key: X switches between Simple and Expert."
              onClick={() => {
                audioEngine.playMechanicalClick(1380);
                setUiMode("simple");
              }}
            >
              SIMPLE
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={uiMode === "expert"}
              className="mode-tab"
              data-active={uiMode === "expert"}
              aria-keyshortcuts="X"
              title="Key: X switches between Simple and Expert."
              onClick={() => {
                audioEngine.playMechanicalClick(1380);
                setUiMode("expert");
              }}
            >
              EXPERT
            </button>
            <KeyHint k="X" />
          </div>
        </div>

        <div className="topbar-oled-slot">
          <div className="topbar-oled">
            <div className="stat-pair">
              <span className="stat-label">CHORD</span>
              <span className="stat-val stat-val--ochre">
                {CHORD_ROOTS[telemetry.chordRootIdx].roman}
              </span>
            </div>
            <div className="stat-pair">
              <span className="stat-label">VOWEL</span>
              <span className="stat-val stat-val--blue">
                [{telemetry.currentVowel}]
              </span>
            </div>
            <div className="stat-pair">
              <span className="stat-label">BEAM</span>
              <span className="stat-val">
                #{telemetry.hoveredStringIndex + 1} · {telemetry.lastSolmization} (
                {telemetry.lastFreqHz.toFixed(0)}Hz)
              </span>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="ctrl-btn"
            data-active={rhythm !== "off" && !isBeamSong(rhythm)}
            aria-keyshortcuts="P"
            onClick={toggleRiff}
          >
            <span
              className="lamp"
              data-lit={rhythm !== "off" && !isBeamSong(rhythm) ? "rec" : "false"}
            />
            <SwapLabel on={rhythm !== "off" && !isBeamSong(rhythm)} onText="STOP RIFF" offText="PLAY RIFF" />
            <KeyHint k="P" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={!laserStrumEnabled}
            title="PINCH PLAY: Hover aims silently, Pinch plucks. GLIDE STRUM: Crossing a beam strums automatically. Key: I."
            aria-keyshortcuts="I"
            onClick={togglePinchPlay}
          >
            <span
              className="lamp"
              data-lit={!laserStrumEnabled ? "true" : "warn"}
            />
            <SwapLabel on={!laserStrumEnabled} onText="PINCH PLAY" offText="GLIDE STRUM" />
            <KeyHint k="I" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={isBeamSong(rhythm)}
            title="Field Song, Harbor, or Night Step. One note per beat. Key: N."
            aria-keyshortcuts="N"
            onClick={togglePlayAlong}
          >
            <span
              className="lamp"
              data-lit={isBeamSong(rhythm) ? "true" : "false"}
            />
            <SwapLabel on={isBeamSong(rhythm)} onText="STOP SONG" offText="PLAY ALONG" />
            <KeyHint k="N" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={thereminEnabled}
            aria-pressed={thereminEnabled}
            aria-keyshortcuts="T"
            title="Height sweeps filter, vowel, and reverb. Off, height does nothing and the sound goes back to rest. Key: T."
            onClick={toggleTheremin}
          >
            <span className="lamp" data-lit={thereminEnabled ? "true" : "false"} />
            <SwapLabel on={thereminEnabled} onText="THEREMIN" offText="THEREMIN OFF" />
            <KeyHint k="T" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={benchOpen}
            aria-pressed={benchOpen}
            aria-keyshortcuts="E"
            onClick={toggleBench}
          >
            <span className="lamp" data-lit={benchOpen ? "true" : "false"} />
            RECALL
            <KeyHint k="E" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={quantizeMode === "guide"}
            aria-keyshortcuts="Q"
            onClick={toggleQuantize}
          >
            <span
              className="lamp"
              data-lit={quantizeMode === "guide" ? "warn" : "true"}
            />
            <SwapLabel on={quantizeMode === "guide"} onText="HAND GUIDE" offText="QUANTIZE" />
            <KeyHint k="Q" />
          </button>

          <button
            type="button"
            className="ctrl-btn ctrl-btn--gold"
            data-active={bourdonDrone}
            aria-pressed={bourdonDrone}
            aria-keyshortcuts="Space"
            onClick={toggleDrone}
          >
            <span className="lamp" data-lit={bourdonDrone ? "warn" : "false"} />
            DRONE {currentModeSpec.rootNote}1
            <KeyHint k="SPACE" />
          </button>

          {uiMode === "expert" ? (
            <button
              type="button"
              className="ctrl-btn"
              data-active={midiStatus.enabled}
              aria-keyshortcuts="M"
              onClick={connectMidi}
            >
              <span
                className="lamp"
                data-lit={midiStatus.enabled ? "true" : "false"}
              />
              {midiStatus.enabled
                ? `MIDI (${midiStatus.portNames.length})`
                : "MIDI"}
              <KeyHint k="M" />
            </button>
          ) : null}

          <button
            type="button"
            className="ctrl-btn"
            data-active={clipRecording}
            aria-keyshortcuts="V"
            onClick={toggleClipRecording}
          >
            <span
              className="lamp"
              data-lit={clipRecording ? "rec" : "false"}
            />
            <SwapLabel on={clipRecording} onText="SAVE WEBM" offText="REC CLIP" />
            <KeyHint k="V" />
          </button>

          <button
            type="button"
            className="ctrl-btn"
            data-active={cameraRequested}
            aria-keyshortcuts="C"
            onClick={toggleCamera}
          >
            <span
              className="lamp"
              data-lit={telemetry.cameraActive ? "true" : "false"}
            />
            <SwapLabel on={cameraRequested} onText="STOP CAM" offText="OPEN CAM" />
            <KeyHint k="C" />
          </button>

          <button
            type="button"
            className="ctrl-btn ctrl-btn--dark"
            aria-keyshortcuts="?"
            onClick={() => {
              audioEngine.playMechanicalClick(1360);
              setCodexOpen(true);
            }}
          >
            GUIDE
            <KeyHint k="?" />
          </button>
        </div>

        <div className="topbar-legend">
          {/* Both open a new tab, so the sound, loops and camera keep running here */}
          <span className="topbar-links">
            <a
              className="topbar-credit"
              href="https://karano.me"
              target="_blank"
              rel="noopener"
            >
              MANUS {process.env.NEXT_PUBLIC_MANUS_VERSION}, by Karan Oroumchi
            </a>
            <span aria-hidden="true"> · </span>
            <a
              className="topbar-credit"
              href="https://karano.me/work/manus"
              target="_blank"
              rel="noopener"
            >
              Read how it was made
            </a>
          </span>
          <p className="topbar-privacy">
            Camera frames stay on this device.
          </p>
        </div>
      </header>

      {/* Workspace: the stage on the left, the parameter rack on the right */}
      <div className="workspace">
        {/* Stage column: the camera and shader canvas, then one pad per beam */}
        <section className="stage-column" aria-label="Optical hand stage">
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: 0,
            }}
          >
            <StageCanvas
              voice={voice}
              mode={mode}
              look={look}
              rhythm={rhythm}
              bourdonDrone={bourdonDrone}
              loopPlaying={loopState.playing}
              quantizeMode={quantizeMode}
              cameraRequested={cameraRequested}
              laserStrumEnabled={laserStrumEnabled}
              thereminEnabled={thereminEnabled}
              onTelemetry={handleTelemetry}
              onMacroGesture={handleMacroGesture}
              onOpenGestureGuide={() => setCodexOpen(true)}
              externalTriggerRef={externalTriggerRef}
              externalPortalSurgeRef={externalPortalSurgeRef}
              externalSetKnobRef={externalSetKnobRef}
            />

            {macroToast ? (
              <div className="macro-banner" role="status">
                <span className="lamp" data-lit="warn" />
                <strong>{macroToast.title}</strong>
                <span>{macroToast.subtitle}</span>
              </div>
            ) : null}
          </div>

          {/* Beam pads: four for the left hand, four for the right */}
          <div className="finger-matrix">
            <div className="hand-bank">
              <div className="bank-header">
                <span>
                  BEAMS 1–4 // LEFT HAND CHORDS (I · bVI · IV · V) &amp; BASS
                </span>
                <span>KEYS A S D F</span>
              </div>
              <div className="pad-row">
                {([0, 1, 2, 3] as FingerIndex[]).map((fIdx) => (
                  <button
                    key={`left-${fIdx}`}
                    type="button"
                    className="tactile-pad"
                    data-active={telemetry.activeFingersLeft[fIdx]}
                    onClick={() => {
                      audioEngine.setChordRootIndex(fIdx);
                      externalTriggerRef.current?.("left", fIdx);
                    }}
                  >
                    <div className="pad-top">
                      <span>
                        <span
                          className="pad-dot"
                          style={{ background: TE_COLORS[fIdx] }}
                        />
                        <span className="pad-num">#{fIdx + 1} · </span>
                        <span className="pad-word">CHORD </span>
                        {CHORD_ROOTS[fIdx].roman}
                      </span>
                      <span className="pad-key">{LEFT_KEYS[fIdx]}</span>
                    </div>
                    <div className="pad-bottom">
                      <span className="pad-solm">
                        {currentModeSpec.solmizationLeft[fIdx]}
                      </span>
                      <span className="pad-note">
                        {currentModeSpec.noteNamesLeft[fIdx]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="hand-bank">
              <div className="bank-header">
                <span>BEAMS 5–8 // RIGHT HAND LEAD &amp; TALKBOX ARPEGGIO</span>
                <span>KEYS J K L ;</span>
              </div>
              <div className="pad-row">
                {([0, 1, 2, 3] as FingerIndex[]).map((fIdx) => (
                  <button
                    key={`right-${fIdx}`}
                    type="button"
                    className="tactile-pad"
                    data-active={telemetry.activeFingersRight[fIdx]}
                    onClick={() => externalTriggerRef.current?.("right", fIdx)}
                  >
                    <div className="pad-top">
                      <span>
                        <span
                          className="pad-dot"
                          style={{ background: TE_COLORS[fIdx] }}
                        />
                        <span className="pad-num">#{fIdx + 5} · </span>
                        {FINGER_LABELS[fIdx].latin}
                      </span>
                      <span className="pad-key">{RIGHT_KEYS[fIdx]}</span>
                    </div>
                    <div className="pad-bottom">
                      <span className="pad-solm">
                        {currentModeSpec.solmizationRight[fIdx]}
                      </span>
                      <span className="pad-note">
                        {currentModeSpec.noteNamesRight[fIdx]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Rack column: readout, knobs, voices, optics and scale, sequencer */}
        <aside className="rack-column" aria-label="Instrument parameter rack">
          {/* Readout: current note, voice and optics, tape reel, and the four knob values */}
          <div className="oled-screen">
            <div className="oled-header">
              <button
                type="button"
                style={{ color: "inherit", font: "inherit" }}
                title="Click to cycle Sound Engine Mode"
                onClick={() => {
                  const order: EngineMode[] = ["hybrid", "surge", "synth"];
                  const next =
                    order[(order.indexOf(engineMode) + 1) % order.length];
                  audioEngine.setEngineMode(next);
                  setEngineMode(next);
                }}
              >
                SYNTH OLED // {currentVoiceSpec.roman} ·{" "}
                {currentVoiceSpec.latin} · CHORD [
                {CHORD_ROOTS[telemetry.chordRootIdx].roman}]
              </button>
              <span>{telemetry.lastFreqHz.toFixed(1)} HZ</span>
            </div>

            <div className="oled-body">
              <button
                type="button"
                style={{ textAlign: "left" }}
                title="Click to audition active note"
                onClick={() => {
                  const hand: HandSide =
                    telemetry.hoveredStringIndex < 4 ? "left" : "right";
                  const finger = (telemetry.hoveredStringIndex %
                    4) as FingerIndex;
                  externalTriggerRef.current?.(hand, finger);
                }}
              >
                {/* One line however long the chord's name, shrunk to fit (FitLine) */}
                <FitLine
                  className="oled-note-big"
                  style={{
                    fontVariationSettings: `"wdth" ${dynamicWdth}, "wght" ${dynamicWght}`,
                  }}
                  text={`${telemetry.lastSolmization} · ${telemetry.lastNote}`}
                />
                <div className="oled-patch-line">
                  {currentVoiceSpec.name} ({currentVoiceSpec.surgePatch})
                </div>
                <div className="oled-fx-line">
                  {currentLookSpec.code} · {currentLookSpec.name} ·{" "}
                  {currentModeSpec.name} ({currentTempSpec.code})
                </div>
              </button>

              <OledTapeGraphic
                playing={loopState.playing || rhythm !== "off"}
                recording={loopState.recording}
                progress={loopState.progress}
                waveform={telemetry.waveform}
                onClick={() => {
                  const next = audioEngine.toggleRecordLoop();
                  setLoopState((prev) => ({
                    ...prev,
                    recording: next.recording,
                    playing: next.playing,
                    count: next.count,
                  }));
                }}
              />
            </div>

            <div className="oled-footer-params">
              <button
                type="button"
                className="oled-param"
                aria-disabled={!thereminEnabled || undefined}
                title={thereminEnabled ? undefined : THEREMIN_OFF_HINT}
                onClick={() =>
                  externalSetKnobRef.current?.(
                    "cutoff",
                    ((telemetry.filterCutoffNorm + 0.16) % 0.96) + 0.04
                  )
                }
              >
                <span style={{ color: TE_COLORS[0] }}>● THEREMIN Y</span>
                <strong>{thereminEnabled ? Math.round(telemetry.filterCutoffNorm * 100) : "OFF"}</strong>
              </button>
              <button
                type="button"
                className="oled-param"
                onClick={() =>
                  externalSetKnobRef.current?.(
                    "warp",
                    ((telemetry.spaceWarp + 0.16) % 0.96) + 0.04
                  )
                }
              >
                <span style={{ color: TE_COLORS[1] }}>● WARP</span>
                <strong>{Math.round(telemetry.spaceWarp * 100)}</strong>
              </button>
              <button
                type="button"
                className="oled-param"
                onClick={() =>
                  externalSetKnobRef.current?.(
                    "rotatio",
                    ((telemetry.wristTwistNorm + 0.16) % 0.96) + 0.04
                  )
                }
              >
                <span style={{ color: TE_COLORS[2] }}>● ROTATIO</span>
                <strong>{Math.round(telemetry.wristTwistNorm * 100)}</strong>
              </button>
              <button
                type="button"
                className="oled-param"
                onClick={() =>
                  externalSetKnobRef.current?.(
                    "reverb",
                    ((telemetry.reverbAmount + 0.16) % 0.96) + 0.04
                  )
                }
              >
                <span style={{ color: TE_COLORS[3] }}>● REVERB</span>
                <strong>
                  {/* Simplified copy of the engine's wet level: warp 55% plus height 45%, times E4 times 2, capped at 1. The engine also adds a 0.12 floor and weights the mix by 0.78 */}
                  {Math.round(
                    Math.min(
                      1,
                      (telemetry.spaceWarp * 0.55 + telemetry.filterCutoffNorm * 0.45) *
                        telemetry.reverbAmount *
                        2
                    ) * 100
                  )}
                </strong>
              </button>
            </div>
          </div>

          {/* Knobs E1 to E4: height, warp, rotation, reverb */}
          <div className="encoder-well">
            <PhysicalEncoder
              label={thereminEnabled ? "E1 THEREMIN Y" : "E1 THEREMIN OFF"}
              shortLabel={thereminEnabled ? undefined : "E1 OFF"}
              valueNorm={telemetry.filterCutoffNorm}
              capColor={TE_COLORS[0]}
              onChange={(val) => externalSetKnobRef.current?.("cutoff", val)}
              disabledHint={thereminEnabled ? undefined : THEREMIN_OFF_HINT}
            />
            <PhysicalEncoder
              label="E2 PRISM WARP"
              valueNorm={telemetry.spaceWarp}
              capColor={TE_COLORS[1]}
              onChange={(val) => externalSetKnobRef.current?.("warp", val)}
            />
            <PhysicalEncoder
              label="E3 ROTATIO"
              valueNorm={telemetry.wristTwistNorm}
              capColor={TE_COLORS[2]}
              onChange={(val) => externalSetKnobRef.current?.("rotatio", val)}
            />
            <PhysicalEncoder
              label="E4 REVERB"
              valueNorm={telemetry.reverbAmount}
              capColor={TE_COLORS[3]}
              onChange={(val) => externalSetKnobRef.current?.("reverb", val)}
            />
          </div>

          {/* The 12 voices in two banks of six: A is 01–06, B is 07–12 */}
          <div className="module-well">
            <div className="well-head">
              <span>STUDIO SYNTHESIS VOICES (12)</span>
              <div className="bank-switch">
                <button
                  type="button"
                  className="bank-pill"
                  data-active={voiceBank === "A"}
                  onClick={() => {
                    audioEngine.playMechanicalClick(1300);
                    setVoiceBank("A");
                    const firstA = VOICES.find((v) => v.bank === "A");
                    if (firstA) setVoice(firstA.id);
                  }}
                >
                  BANK A (01–06)
                </button>
                <button
                  type="button"
                  className="bank-pill"
                  data-active={voiceBank === "B"}
                  onClick={() => {
                    audioEngine.playMechanicalClick(1300);
                    setVoiceBank("B");
                    const firstB = VOICES.find((v) => v.bank === "B");
                    if (firstB) setVoice(firstB.id);
                  }}
                >
                  BANK B (07–12)
                </button>
              </div>
            </div>
            <div className="key-grid-6">
              {bankVoices.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="te-key"
                  data-selected={voice === v.id}
                  onClick={() => {
                    audioEngine.playMechanicalClick(1350);
                    setVoice(v.id);
                  }}
                >
                  <div className="te-key-top">
                    <span>
                      {v.roman} · {v.latin}
                    </span>
                    <span className="te-key-led" />
                  </div>
                  <div className="te-key-name">{v.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Expert: synth faders and tempo, then the optics and the scale. Simple: the optics only */}
          {uiMode === "expert" ? (
            <div className="module-well">
              <div className="well-head">
                <span>ENVELOPE · SUB · DRIVE · CHORUS</span>
                <span>DRAG THE FADERS</span>
              </div>
              <div className="fader-bank">
                <MicroFader
                  label="ATTACK"
                  value={synthParams.attackNorm}
                  display={`${Math.round(4 + synthParams.attackNorm * 280)}ms`}
                  resetValue={0.08}
                  onChange={(attackNorm) => updateSynthParam({ attackNorm })}
                />
                <MicroFader
                  label="RELEASE"
                  value={synthParams.releaseNorm}
                  display={`${(0.28 + synthParams.releaseNorm * 1.85).toFixed(2)}s`}
                  resetValue={0.55}
                  onChange={(releaseNorm) => updateSynthParam({ releaseNorm })}
                />
                <MicroFader
                  label="SUB"
                  value={synthParams.subLevel}
                  display={`${Math.round(synthParams.subLevel * 100)}%`}
                  resetValue={0.52}
                  onChange={(subLevel) => updateSynthParam({ subLevel })}
                />
                <MicroFader
                  label="DRIVE"
                  value={synthParams.driveNorm}
                  display={`${Math.round(synthParams.driveNorm * 100)}%`}
                  resetValue={0.45}
                  onChange={(driveNorm) => updateSynthParam({ driveNorm })}
                />
                <MicroFader
                  label="CHORUS"
                  value={synthParams.chorusMix}
                  display={`${Math.round(synthParams.chorusMix * 100)}%`}
                  resetValue={0.48}
                  onChange={(chorusMix) => updateSynthParam({ chorusMix })}
                />
                <MicroFader
                  label="TEMPO"
                  value={Math.max(0, Math.min(1, (synthParams.bpm - 80) / 70))}
                  display={`${synthParams.bpm} BPM`}
                  resetValue={(120 - 80) / 70}
                  onChange={(norm) =>
                    updateSynthParam({ bpm: Math.round(80 + norm * 70) })
                  }
                />
              </div>
              <div className="optic-row" aria-label="Mirror optics">
                {SHADER_LOOKS.map((sLook) => (
                  <button
                    key={sLook.id}
                    type="button"
                    className="te-key"
                    data-selected={look === sLook.id}
                    onClick={() => {
                      audioEngine.playMechanicalClick(1040);
                      setLook(sLook.id);
                    }}
                  >
                    <div className="te-key-top">
                      <span>{sLook.code}</span>
                      <span
                        className="te-key-led"
                        style={
                          look === sLook.id
                            ? {
                                background: sLook.accentHex,
                                boxShadow: `0 0 6px ${sLook.accentHex}`,
                              }
                            : undefined
                        }
                      />
                    </div>
                    <div className="te-key-name">{sLook.name}</div>
                  </button>
                ))}
              </div>
              <div className="key-grid-4">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="te-key"
                    data-selected={mode === m.id}
                    onClick={() => {
                      audioEngine.playMechanicalClick(1180);
                      setMode(m.id);
                    }}
                  >
                    <div className="te-key-top">
                      <span>{m.rootNote}</span>
                      <span className="te-key-led" />
                    </div>
                    <div className="te-key-name">{m.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="module-well">
              <div className="well-head">
                <span>MIRROR OPTICS BEHIND HAND [FX 1–6]</span>
                <span>TOP M2 · 8-TAP GOLDEN BOKEH</span>
              </div>
              <div className="key-grid-6">
                {SHADER_LOOKS.map((sLook) => (
                  <button
                    key={sLook.id}
                    type="button"
                    className="te-key"
                    data-selected={look === sLook.id}
                    onClick={() => {
                      audioEngine.playMechanicalClick(1040);
                      setLook(sLook.id);
                    }}
                  >
                    <div className="te-key-top">
                      <span>{sLook.code}</span>
                      <span
                        className="te-key-led"
                        style={
                          look === sLook.id
                            ? {
                                background: sLook.accentHex,
                                boxShadow: `0 0 6px ${sLook.accentHex}`,
                              }
                            : undefined
                        }
                      />
                    </div>
                    <div className="te-key-name">{sLook.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sequencer: songs and riffs, the 16-step editor (Expert) or the chord keys (Simple), and the tape looper */}
          <div className="module-well">
            <div className="well-head">
              <span>
                {uiMode === "expert"
                  ? "16-STEP BEAM SEQUENCER (CLICK STEPS #1–#8)"
                  : "STUDIO BACKING SEQUENCER & CHORD CONDUCTOR"}
              </span>
              <span className="bpm-step">
                <button
                  type="button"
                  aria-label="Slower"
                  onClick={() =>
                    updateSynthParam({
                      bpm: audioEngine.getSongBpm(
                        rhythm === "off" ? "saltarello" : rhythm
                      ) - 4,
                    })
                  }
                >
                  −
                </button>
                <strong>
                  {audioEngine.getSongBpm(rhythm === "off" ? "saltarello" : rhythm)}{" "}
                  BPM
                </strong>
                <button
                  type="button"
                  aria-label="Faster"
                  onClick={() =>
                    updateSynthParam({
                      bpm: audioEngine.getSongBpm(
                        rhythm === "off" ? "saltarello" : rhythm
                      ) + 4,
                    })
                  }
                >
                  +
                </button>
              </span>
            </div>

            <div className="key-grid-3" style={{ marginBottom: "4px" }}>
              {RHYTHMS.filter((r) => isBeamSong(r.id)).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="te-key"
                  data-selected={rhythm === r.id}
                  onClick={() => {
                    audioEngine.playMechanicalClick(900);
                    if (rhythm === r.id) {
                      applyRhythm("off");
                      return;
                    }
                    setVoice(r.defaultVoice);
                    const found = VOICES.find((v) => v.id === r.defaultVoice);
                    if (found) setVoiceBank(found.bank);
                    applyRhythm(r.id);
                  }}
                >
                  <div className="te-key-top">
                    <span>{r.name}</span>
                    <span className="te-key-led" />
                  </div>
                  <div className="te-key-name">{audioEngine.getSongBpm(r.id)} BPM</div>
                </button>
              ))}
            </div>

            <div className="key-grid-4" style={{ marginBottom: "4px" }}>
              {RHYTHMS.filter((r) => !isBeamSong(r.id)).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="te-key"
                  data-selected={rhythm === r.id}
                  onClick={() => {
                    const next: RhythmId = rhythm === r.id ? "off" : r.id;
                    audioEngine.playMechanicalClick(980);
                    if (next !== "off") {
                      setVoice(r.defaultVoice);
                      const vSpec = VOICES.find((v) => v.id === r.defaultVoice);
                      if (vSpec) setVoiceBank(vSpec.bank);
                    }
                    setSetlistOn(false);
                    audioEngine.setSetlistArmed(false);
                    applyRhythm(next);
                  }}
                >
                  <div className="te-key-top">
                    <span>{r.code}</span>
                    <span className="te-key-led" />
                  </div>
                  <div className="te-key-name">{r.name}</div>
                </button>
              ))}
            </div>

            {uiMode === "expert" && isBeamSong(rhythm) ? (
              <p className="song-note">
                This song is 32 notes, one per beat. Pinch each gem on the white line.
              </p>
            ) : uiMode === "expert" ? (
              <div
                className="step-seq-grid"
                aria-label="16-Step Beam Sequencer"
              >
                {activeSequenceSteps.map((beamIdx, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    className="step-cell"
                    data-playhead={
                      rhythm !== "off" && telemetry.activeStepIndex === sIdx
                    }
                    title={`Step ${sIdx + 1}: Plays Beam #${
                      beamIdx + 1
                    } (Click to change beam)`}
                    onClick={() => {
                      const targetSeq =
                        rhythm === "off" ? "saltarello" : rhythm;
                      const nextBeam = (beamIdx + 1) % 8;
                      audioEngine.setSequenceStepBeam(
                        targetSeq,
                        sIdx,
                        nextBeam
                      );
                      setSeqStepsVersion((v) => v + 1);
                      const hand: HandSide = nextBeam < 4 ? "left" : "right";
                      const finger = (nextBeam % 4) as FingerIndex;
                      externalTriggerRef.current?.(hand, finger);
                    }}
                  >
                    <span>#{beamIdx + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="key-grid-4">
                {CHORD_ROOTS.map((c) => (
                  <button
                    key={c.index}
                    type="button"
                    className="te-key"
                    data-selected={telemetry.chordRootIdx === c.index}
                    onClick={() => {
                      audioEngine.playMechanicalClick(1140);
                      audioEngine.setChordRootIndex(c.index);
                      externalTriggerRef.current?.("left", c.index);
                    }}
                  >
                    <div className="te-key-top">
                      <span>CHORD {c.roman}</span>
                      <span className="te-key-led" />
                    </div>
                    <div className="te-key-name">{c.name}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="looper-bar">
              <button
                type="button"
                className="ctrl-btn"
                data-active={telemetry.stutterActive}
                aria-keyshortcuts="Z"
                onPointerDown={() => audioEngine.setStutterFreeze(true)}
                onPointerUp={() => audioEngine.setStutterFreeze(false)}
                onPointerLeave={() => audioEngine.setStutterFreeze(false)}
              >
                <span
                  className="lamp"
                  data-lit={telemetry.stutterActive ? "warn" : "false"}
                />
                HOLD STUTTER
                <KeyHint k="Z" />
              </button>

              <button
                type="button"
                className="ctrl-btn"
                data-active={loopState.recording}
                aria-keyshortcuts="R"
                onClick={() => {
                  const next = audioEngine.toggleRecordLoop();
                  setLoopState({
                    ...loopState,
                    recording: next.recording,
                    playing: next.playing,
                    count: next.count,
                  });
                }}
              >
                <span
                  className="lamp"
                  data-lit={loopState.recording ? "rec" : "false"}
                />
                {loopState.recording ? "OVERDUB" : "TAPE REC"}
                <KeyHint k="R" />
              </button>

              <div className="loop-progress">
                <div
                  className="loop-playhead"
                  style={{ width: `${Math.round(loopState.progress * 100)}%` }}
                />
                <span style={{ position: "relative", zIndex: 1 }}>
                  {rhythm !== "off"
                    ? `STEP ${(telemetry.activeStepIndex % activeSequenceSteps.length) + 1}/${activeSequenceSteps.length} · ${
                        telemetry.arcadeHands ? "CATCH" : "AUTO"
                      } · ${String(telemetry.arcadeScore).padStart(6, "0")} · ${
                        telemetry.arcadeMultiplier
                      }×`
                    : loopState.playing
                      ? `TAPE BAR ${loopState.bar}/4`
                      : "READY · 8 BEAMS"}
                </span>
              </div>

              <button
                type="button"
                className="ctrl-btn"
                aria-keyshortcuts="Backspace"
                title="Clears the tape loop. Key: Backspace or Delete."
                onClick={clearTape}
              >
                CLEAR
                <KeyHint k="DEL" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Recall: four patches, the setlist, pinch calibration and the MIDI clock */}
      {benchOpen ? (
        <div className="bench" onPointerDown={(e) => e.stopPropagation()}>
          <div className="bench-head">
            <strong>Recall</strong>
            <button type="button" onClick={() => setBenchOpen(false)}>
              Close
            </button>
          </div>

          <div className="bench-label">Patches</div>
          <div className="bench-row">
            {patches.map((patch, index) => (
              <button
                key={index}
                type="button"
                className="bench-slot"
                disabled={!patch}
                onClick={() => patch && loadPatch(patch)}
              >
                <span>{index + 1}</span>
                <em>{patch ? patch.name : "Empty"}</em>
              </button>
            ))}
          </div>
          <div className="bench-row">
            {patches.map((_, index) => (
              <button
                key={`save-${index}`}
                type="button"
                className="bench-save"
                onClick={() => savePatch(index)}
              >
                Save {index + 1}
              </button>
            ))}
          </div>

          <div className="bench-label">
            Setlist {setlistOn ? `· song ${setlistIndex + 1}` : ""}
          </div>
          <div className="bench-row">
            {setlist.map((id, index) => {
              const spec = RHYTHMS.find((r) => r.id === id);
              return (
                <button
                  key={`set-${index}`}
                  type="button"
                  className="bench-slot"
                  data-on={setlistOn && index === setlistIndex}
                  onClick={() => cycleSetSlot(index)}
                >
                  <span>{index + 1}</span>
                  <em>{spec ? spec.code : "Off"}</em>
                </button>
              );
            })}
          </div>
          <button type="button" className="bench-go" onClick={playSet}>
            Play set
          </button>

          <div className="bench-label">Pinch</div>
          <label className="bench-slider">
            <span>Easier when the mark is to the right</span>
            <input
              type="range"
              min={22}
              max={78}
              value={Math.round(pinchEnter * 100)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100;
                setPinchEnter(next);
                setPinchEnterThreshold(next);
              }}
            />
          </label>
          <div className="bench-row">
            <button type="button" className="bench-save" onClick={() => capturePinch("open")}>
              Hold open
            </button>
            <button type="button" className="bench-save" onClick={() => capturePinch("pinch")}>
              Hold pinch
            </button>
          </div>
          <p className="bench-note">
            {calNote ||
              (telemetry.pinchDistance > 0
                ? `Hand distance ${telemetry.pinchDistance.toFixed(2)}`
                : "Camera off. Distance shows when a hand is in frame.")}
          </p>

          <div className="bench-label">MIDI clock</div>
          <button
            type="button"
            className="bench-go"
            data-on={midiClock}
            onClick={async () => {
              const next = !midiClock;
              if (next) {
                const status = await audioEngine.initWebMidi();
                setMidiStatus(status);
                if (!status.enabled) {
                  setCalNote("MIDI did not open.");
                  return;
                }
                audioEngine.setMidiClockFollow(true);
                setMidiClock(true);
              } else {
                audioEngine.setMidiClockFollow(false);
                setMidiClock(false);
              }
            }}
          >
            {midiClock
              ? `Clock in · ${audioEngine.getDetectedMidiBpm()} BPM`
              : "Follow external clock"}
          </button>
        </div>
      ) : null}

      {recap ? (
        /* The score recap reuses the first-visit lesson's card: a dark readout on top, one lamp per beat beside the score, and the console's buttons */
        <div
          className="lesson recap"
          role="dialog"
          aria-labelledby="recap-title"
          aria-describedby="recap-body"
        >
          <div className="lesson-head">
            <span>{RHYTHMS.find((r) => r.id === recap.rhythm)?.name ?? "Play along"}</span>
            <span>Best combo {recap.peakCombo}</span>
          </div>
          <div className="lesson-main">
            <div className="lesson-diagram recap-board">
              <div
                className="recap-lamps"
                role="img"
                aria-label={GRADE_KEY.map(
                  ([grade, , spoken]) => `${recap.grades.filter((g) => g === grade).length} ${spoken}`
                ).join(", ")}
              >
                {recap.grades.map((grade, index) => (
                  <span key={index} data-grade={grade ?? "none"} />
                ))}
              </div>
              <div className="recap-key" aria-hidden="true">
                {GRADE_KEY.map(([grade, name]) => (
                  <span key={grade} data-grade={grade}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h2 id="recap-title" className="lesson-title recap-score">
                {String(recap.score).padStart(6, "0")}
              </h2>
              <p id="recap-body" className="lesson-body">
                {recap.hits} {recap.hits === 1 ? "hit" : "hits"} and {recap.misses}{" "}
                {recap.misses === 1 ? "miss" : "misses"}.{" "}
                {recap.grades.includes("MISS")
                  ? "Replay misses plays it again and holds each beat you missed until you catch it."
                  : "You caught every beat."}
              </p>
            </div>
          </div>
          <div className="lesson-actions">
            {recap.grades.includes("MISS") ? (
              <>
                <button type="button" className="lesson-skip" onClick={() => setRecap(null)}>
                  CLOSE
                </button>
                <button
                  type="button"
                  className="ctrl-btn ctrl-btn--dark lesson-key"
                  onClick={() => {
                    const steps = recap.grades.flatMap((grade, index) =>
                      grade === "MISS" ? [index] : []
                    );
                    const spec = RHYTHMS.find((r) => r.id === recap.rhythm);
                    if (spec) {
                      setVoice(spec.defaultVoice);
                      const found = VOICES.find((v) => v.id === spec.defaultVoice);
                      if (found) setVoiceBank(found.bank);
                    }
                    applyRhythm(recap.rhythm);
                    audioEngine.armReplay(steps);
                    setQuantizeMode("guide");
                    setRecap(null);
                  }}
                >
                  REPLAY MISSES
                </button>
              </>
            ) : (
              <button
                type="button"
                className="ctrl-btn ctrl-btn--dark lesson-key recap-close"
                onClick={() => setRecap(null)}
              >
                CLOSE
              </button>
            )}
          </div>
        </div>
      ) : null}

      <footer className="footerbar">
        <div className="footer-note">
          <strong>PLAY ALONG</strong> is the song book: Field, Harbor, Night
          Step. Each riff keeps its own tempo. Theremin off takes height out of the sound.{" "}
          <span className="footer-timing">Heard {telemetry.audioMs} ms · seen {Math.round(telemetry.visionMs)} ms.</span>
        </div>
        {/* each key stays with its name, and the pairs wrap as whole units when the line runs out */}
        <div className="footer-keys">
          <span className="kbd-label">KEYS:</span>
          {FOOTER_KEYS.map(([key, name]) => (
            <span key={key} className="kbd-pair">
              <span className="kbd-tag">{key}</span> {name}
            </span>
          ))}
        </div>
      </footer>
    </main>
  );
}
