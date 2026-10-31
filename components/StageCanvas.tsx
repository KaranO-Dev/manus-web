"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  audioEngine,
  CHORD_ROOTS,
  MODES,
  THEREMIN_REST,
  VOICES,
  type FingerIndex,
  type HandSide,
  type HitGrade,
  type ModeId,
  type PlayQuantizeMode,
  type RhythmId,
  type VoiceId,
} from "@/lib/audio";
import {
  averageHandPose,
  ChironomyGestureDetector,
  HandLandmarkSmoother,
  THEREMIN_MAX_Y,
  THEREMIN_MIN_Y,
  TOP_RIBBON_SLOTS,
  TOP_RIBBON_Y,
  type HandPoseMetrics,
  type MacroGestureEvent,
} from "@/lib/gestures";
import {
  FRAGMENT_SHADER_SRC,
  SHADER_LOOKS,
  VERTEX_SHADER_SRC,
  type ShaderLookId,
} from "@/lib/shader";
import { pickSelfieCamera } from "@/lib/camera";
import { coverFit, toStage, WHOLE } from "@/lib/camera-fit";
import { count } from "@/lib/events";

export interface TelemetryState {
  cameraActive: boolean;
  demoMode: boolean;
  handsDetected: number;
  lastNote: string;
  lastSolmization: string;
  lastFreqHz: number;
  lastFinger: string;
  currentVowel: string;
  spaceWarp: number;
  blurAmount: number;
  filterCutoffNorm: number;
  wristTwistNorm: number;
  handBridgeNorm: number;
  reverbAmount: number;
  activeFingersLeft: [boolean, boolean, boolean, boolean];
  activeFingersRight: [boolean, boolean, boolean, boolean];
  hoveredStringIndex: number;
  ribbonSlotHover: number;
  ribbonHoldProgress: number;
  waveform: number[];
  activeStepIndex: number;
  songStepFloat: number;
  chordRootIdx: 0 | 1 | 2 | 3;
  stutterActive: boolean;
  guideTargetBeam: number | null;
  arcadeScore: number;
  arcadeCombo: number;
  arcadeMultiplier: number;
  arcadeGrade: HitGrade | null;
  arcadeHands: boolean;
  pinchDistance: number;
  visionMs: number;
  audioMs: number;
}

interface StageCanvasProps {
  voice: VoiceId;
  mode: ModeId;
  look: ShaderLookId;
  rhythm: RhythmId;
  bourdonDrone: boolean;
  loopPlaying: boolean;
  quantizeMode: PlayQuantizeMode;
  cameraRequested: boolean;
  laserStrumEnabled: boolean;
  thereminEnabled: boolean;
  onTelemetry: (t: TelemetryState) => void;
  onMacroGesture: (ev: MacroGestureEvent) => void;
  onOpenGestureGuide: () => void;
  externalTriggerRef: React.MutableRefObject<
    ((hand: HandSide, finger: FingerIndex, silentAudio?: boolean) => void) | null
  >;
  externalPortalSurgeRef: React.MutableRefObject<(() => void) | null>;
  externalSetKnobRef: React.MutableRefObject<
    ((knob: "cutoff" | "warp" | "rotatio" | "reverb", val: number) => void) | null
  >;
}

interface RippleItem {
  x: number;
  y: number;
  born: number;
  finger: FingerIndex;
}

interface FloatingGlyph {
  id: number;
  x: number;
  y: number;
  solm: string;
  note: string;
  finger: FingerIndex;
  born: number;
}

interface LaneBurst {
  beam: number;
  born: number;
  grade: HitGrade;
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const FINGER_CHAINS: number[][] = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];

const FINGER_TIPS: [number, number, number, number] = [8, 12, 16, 20];
const FINGER_COLORS = ["#2D7FF9", "#F5A623", "#E2E0DA", "#FF3B2F"];
const MACRO_PIPS = ["#2D7FF9", "#F5A623", "#19C37D", "#E2E0DA", "#FF3B2F"];
const RAIL_NAMES = ["Voice", "Optics", "Scale", "Drone", "Tape"];
const LESSON_STEPS = [
  {
    title: "Aim, then pinch",
    body: "An open hand only aims. Bring thumb and index together to play the beam under your fingertip. Hold the pinch and drag to strum.",
  },
  {
    title: "Catch the gem on the white line",
    body: "Songs drop one gem per beat, with about two seconds to see it coming. Move to that beam and hold the pinch as the gem meets the line.",
  },
  {
    title: "Height and the metal rail",
    body: "Up and down sweeps the filter. The five keys on the aluminum rail change the voice, the picture, the scale, the drone, and the tape.",
  },
];

/** One small picture per lesson step, drawn the way the gesture guide draws its cards */
function LessonDiagram({ step }: { step: number }) {
  const beam = "rgba(255,255,255,0.18)";
  if (step === 0) {
    // an open hand aims at a beam, the pinch plays it
    return (
      <svg viewBox="0 0 160 72">
        <line x1="40" y1="6" x2="40" y2="66" stroke={beam} strokeWidth="1.5" />
        <line x1="80" y1="6" x2="80" y2="66" stroke="#2D7FF9" strokeWidth="2.5" />
        <line x1="120" y1="6" x2="120" y2="66" stroke={beam} strokeWidth="1.5" />
        <circle cx="80" cy="36" r="14" fill="rgba(255,59,47,0.2)" stroke="#FF3B2F" strokeWidth="2" />
        <path d="M68 56 L76 38 M92 56 L84 38" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="80" cy="36" r="4" fill="#FFFFFF" />
      </svg>
    );
  }
  if (step === 1) {
    // gems fall down their beams to the white line, and the pinch catches the one arriving
    return (
      <svg viewBox="0 0 160 72">
        <line x1="40" y1="6" x2="40" y2="66" stroke={beam} strokeWidth="1.5" />
        <line x1="80" y1="6" x2="80" y2="66" stroke={beam} strokeWidth="1.5" />
        <line x1="120" y1="6" x2="120" y2="66" stroke={beam} strokeWidth="1.5" />
        <rect x="33" y="12" width="14" height="8" rx="2" fill="#2D7FF9" />
        <rect x="113" y="26" width="14" height="8" rx="2" fill="#F5A623" />
        <line x1="14" y1="54" x2="146" y2="54" stroke="#FFFFFF" strokeWidth="2" />
        <rect x="73" y="50" width="14" height="8" rx="2" fill="#FF3B2F" />
        <circle cx="80" cy="54" r="11" fill="none" stroke="#FF3B2F" strokeWidth="2" />
      </svg>
    );
  }
  // up and down sweeps the filter, and the rail of five keys sits above the hand's reach
  return (
    <svg viewBox="0 0 160 72">
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={18 + k * 26} y="6" width="20" height="12" rx="2" fill="#181822" stroke="#2D7FF9" strokeWidth="1.2" />
      ))}
      <line x1="16" y1="44" x2="144" y2="44" stroke="#F5A623" strokeWidth="2" />
      <path d="M80 28 L80 66 M74 34 L80 28 L86 34 M74 60 L80 66 L86 60" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="80" cy="44" r="4" fill="#F5A623" />
    </svg>
  );
}

function cameraErrorMessage(err: unknown): string {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Camera blocked. Allow it in your browser’s site settings. Mouse play still works.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No camera found. Mouse play still works.";
    case "NotReadableError":
    case "TrackStartError":
      return "Another app is using the camera. Mouse play still works.";
    default:
      return "The camera didn’t start. Mouse play still works.";
  }
}

/** Catches the gem on this beam if one is in reach; the first catch of a visit is counted (lib/events.ts) */
function catchGem(beamIdx: number) {
  const hit = audioEngine.tryArcadeCatch(beamIdx);
  if (hit) count("gem-caught");
  return hit;
}

function stringIndexToNormX(strIdx: number): number {
  return (strIdx + 0.5) / 8;
}

function elevationNormToStageY(elevNorm: number): number {
  const clamped = Math.max(0, Math.min(1, elevNorm));
  return THEREMIN_MIN_Y - clamped * (THEREMIN_MIN_Y - THEREMIN_MAX_Y);
}

export function StageCanvas({
  voice,
  mode,
  look,
  rhythm,
  bourdonDrone,
  loopPlaying,
  quantizeMode,
  cameraRequested,
  laserStrumEnabled,
  thereminEnabled,
  onTelemetry,
  onMacroGesture,
  onOpenGestureGuide,
  externalTriggerRef,
  externalPortalSurgeRef,
  externalSetKnobRef,
}: StageCanvasProps) {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [visionFailed, setVisionFailed] = useState(false);
  const [glUnavailable, setGlUnavailable] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonStep, setLessonStep] = useState(0);
  // What the rail and the hint need from the draw loop, copied at the telemetry rate so render reads state, not the ref
  const [hud, setHud] = useState({ slotHover: -1, holdProgress: 0, cameraActive: false });

  useEffect(() => {
    // Read after hydration on purpose: the server cannot see localStorage, so opening the lesson in the
    // initial state would not match the prerendered page
    try {
      if (!window.localStorage.getItem("manus.lesson.seen")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage after hydration
        setLessonOpen(true);
      }
    } catch {
      setLessonOpen(true);
    }
  }, []);

  const closeLesson = useCallback(() => {
    try {
      window.localStorage.setItem("manus.lesson.seen", "1");
    } catch {
      /* private mode */
    }
    setLessonOpen(false);
    setLessonStep(0);
  }, []);

  // W opens or closes the lesson, and Escape closes it
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && lessonOpen) {
        closeLesson();
      } else if (e.key.toUpperCase() === "W") {
        e.preventDefault();
        if (lessonOpen) {
          closeLesson();
        } else {
          setLessonStep(0);
          setLessonOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lessonOpen, closeLesson]);

  const stateRef = useRef({
    voice,
    mode,
    look,
    rhythm,
    quantizeMode,
    cameraActive: false,
    laserStrumEnabled,
    thereminEnabled,
    visionMs: 16,
    pointerX: 0.56,
    pointerY: 0.38,
    pointerDown: false,
    lastStrumString: -1,
    spaceWarp: 0.36,
    blurAmount: 0.28,
    filterCutoffNorm: THEREMIN_REST,
    wristTwistNorm: 0.5,
    handBridgeNorm: 0.4,
    reverbAmount: 0.5, // the E4 knob: 0.5 leaves the reverb as the hand and height set it
    portalSurge: 0.0,
    lastNote: "Oct I",
    lastSolmization: "D4",
    lastFreqHz: 293.66,
    lastFinger: "BEAM 6 · D4",
    hoveredStringIndex: 5,
    ribbonSlotHover: -1,
    ribbonHoldProgress: 0,
    activeStepIndex: 0,
    lastStepTimestampMs: 0,
    strikeNormY: 0.82, // the white strike line as a share of the stage height, kept current by the draw loop
  });

  useEffect(() => {
    stateRef.current.voice = voice;
    stateRef.current.mode = mode;
    stateRef.current.look = look;
    stateRef.current.rhythm = rhythm;
    stateRef.current.quantizeMode = quantizeMode;
    stateRef.current.laserStrumEnabled = laserStrumEnabled;
    audioEngine.setActiveVoiceAndMode(voice, mode);
    audioEngine.setPlayQuantizeMode(quantizeMode);
  }, [voice, mode, look, rhythm, quantizeMode, laserStrumEnabled]);

  // The theremin's switch: on or off, the height goes back to rest, never staying where the hand last was. Off,
  // the engine opens the filter and drops the vowel and the bend, and the stage draws no beam
  useEffect(() => {
    const s = stateRef.current;
    s.thereminEnabled = thereminEnabled;
    s.filterCutoffNorm = THEREMIN_REST;
    s.pointerY = elevationNormToStageY(THEREMIN_REST); // the mouse-mode hand goes back to rest too
    audioEngine.setThereminActive(thereminEnabled);
  }, [thereminEnabled]);

  const ripplesRef = useRef<RippleItem[]>([]);
  const glyphsRef = useRef<FloatingGlyph[]>([]);
  const burstsRef = useRef<LaneBurst[]>([]);
  const harpStringsVibRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const activePadsRef = useRef<{
    left: [boolean, boolean, boolean, boolean];
    right: [boolean, boolean, boolean, boolean];
  }>({
    left: [false, false, false, false],
    right: [false, false, false, false],
  });

  const callbacksRef = useRef({ onMacroGesture });
  useEffect(() => {
    callbacksRef.current = { onMacroGesture };
  }, [onMacroGesture]);

  useEffect(() => {
    externalPortalSurgeRef.current = () => {
      stateRef.current.portalSurge = 1.0;
    };
  }, [externalPortalSurgeRef]);

  useEffect(() => {
    externalSetKnobRef.current = (knob, val) => {
      const clamped = Math.max(0.01, Math.min(0.99, val));
      const s = stateRef.current;
      if (knob === "cutoff") {
        if (!s.thereminEnabled) return; // the theremin's own knob does nothing while it is off
        s.filterCutoffNorm = clamped;
        s.pointerY = elevationNormToStageY(clamped);
      } else if (knob === "warp") {
        s.spaceWarp = clamped;
      } else if (knob === "rotatio") {
        s.wristTwistNorm = clamped;
      } else if (knob === "reverb") {
        // The E4 knob sets the reverb amount and the picture's blur together
        s.reverbAmount = clamped;
        s.blurAmount = clamped;
        audioEngine.setReverbAmount(clamped);
        return;
      }
      audioEngine.setSpatialParameters(
        s.filterCutoffNorm,
        s.spaceWarp,
        s.wristTwistNorm,
        s.handBridgeNorm
      );
    };
  }, [externalSetKnobRef]);

  useEffect(() => {
    const fireNoteAndRipple = (
      hand: HandSide,
      finger: FingerIndex,
      normX?: number,
      normY?: number,
      fromLooper = false,
      silentAudio = false,
      stepIndex?: number,
      freqHz?: number,
      grade?: HitGrade,
      chartAuto = false
    ) => {
      const s = stateRef.current;
      const strIdx = hand === "left" ? finger : 4 + finger;
      const stringCenterX = stringIndexToNormX(strIdx);
      const x = normX ?? stringCenterX;
      // Off, there is no beam to land on, so a note lights up on the strike line, a recorded one included
      const y = !s.thereminEnabled
        ? s.strikeNormY
        : normY ?? elevationNormToStageY(s.filterCutoffNorm);

      if (stepIndex !== undefined) {
        s.activeStepIndex = stepIndex;
        s.lastStepTimestampMs = performance.now();
      }

      if (!fromLooper && s.quantizeMode === "guide") {
        const seqId = s.rhythm === "off" ? "saltarello" : s.rhythm;
        const steps = audioEngine.getSequenceSteps(seqId);
        const curStep = audioEngine.getCurrentSequenceStep();
        const targetBeam = steps[curStep];
        if (strIdx === targetBeam || !s.cameraActive) {
          audioEngine.stepSequenceByHand();
          return;
        }
      }

      if (
        !fromLooper &&
        s.rhythm !== "off" &&
        s.quantizeMode !== "guide" &&
        audioEngine.isChartNear(strIdx)
      ) {
        audioEngine.setArcadeHandsPresent(true);
        catchGem(strIdx);
        return;
      }

      const res = !fromLooper
        ? audioEngine.triggerNote({
            hand,
            finger,
            voice: s.voice,
            mode: s.mode,
            yBend: s.filterCutoffNorm,
            velocity: silentAudio ? 0.0 : 0.92,
            fromLooper,
          })
        : {
            noteName:
              hand === "left"
                ? String(
                    (MODES.find((m) => m.id === s.mode) ?? MODES[0])
                      .noteNamesLeft[finger]
                  )
                : String(
                    (MODES.find((m) => m.id === s.mode) ?? MODES[0])
                      .noteNamesRight[finger]
                  ),
            solmization:
              hand === "left"
                ? (MODES.find((m) => m.id === s.mode) ?? MODES[0])
                    .solmizationLeft[finger]
                : (MODES.find((m) => m.id === s.mode) ?? MODES[0])
                    .solmizationRight[finger],
            freqHz: freqHz ?? s.lastFreqHz,
          };

      harpStringsVibRef.current[strIdx] = 1.0;

      ripplesRef.current.push({
        x,
        y,
        born: performance.now(),
        finger,
      });
      if (ripplesRef.current.length > 8) ripplesRef.current.shift();

      if (!chartAuto) {
        glyphsRef.current.push({
          id: Math.random(),
          x: stringCenterX,
          y,
          solm: res.solmization,
          note: res.noteName,
          finger,
          born: performance.now(),
        });
        if (glyphsRef.current.length > 16) glyphsRef.current.shift();
      }
      if (grade && grade !== "MISS") {
        burstsRef.current.push({
          beam: strIdx,
          born: performance.now(),
          grade,
        });
        if (burstsRef.current.length > 12) burstsRef.current.shift();
      }

      s.lastNote = res.noteName;
      s.lastSolmization = res.solmization;
      if (freqHz) s.lastFreqHz = freqHz;
      else if (res.freqHz) s.lastFreqHz = res.freqHz;
      s.lastFinger = `BEAM ${strIdx + 1} · ${res.solmization}`;
      s.hoveredStringIndex = strIdx;

      if (hand === "left") {
        activePadsRef.current.left[finger] = true;
        setTimeout(() => {
          activePadsRef.current.left[finger] = false;
        }, 140);
      } else {
        activePadsRef.current.right[finger] = true;
        setTimeout(() => {
          activePadsRef.current.right[finger] = false;
        }, 140);
      }
    };

    externalTriggerRef.current = (
      hand: HandSide,
      finger: FingerIndex,
      silentAudio = false
    ) => {
      // Every note played comes through here. With the camera off, it came from a pointer, a touch, a key or a pad
      if (!stateRef.current.cameraActive) count("note-no-camera");
      fireNoteAndRipple(hand, finger, undefined, undefined, false, silentAudio);
    };

    audioEngine.setOnLoopTrigger((ev) => {
      fireNoteAndRipple(
        ev.hand,
        ev.finger,
        undefined,
        elevationNormToStageY(ev.yBend),
        true,
        ev.velocity <= 0.01,
        ev.stepIndex,
        ev.freqHz,
        ev.grade,
        ev.chartAuto
      );
    });

    return () => {
      audioEngine.setOnLoopTrigger(null);
    };
  }, [externalTriggerRef]);

  // Each bump of the epoch opens the camera again; see the restart effect below
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Camera stream lifecycle
  useEffect(() => {
    const s = stateRef.current; // the same object for the component's life
    let stream: MediaStream | null = null;
    let cancelled = false;

    // The selfie camera for the screen in use (lib/camera.ts), or null for the browser's own front camera
    async function selfieForScreen(): Promise<string | null> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return pickSelfieCamera(devices, window.screen.width, window.screen.height);
      } catch {
        return null;
      }
    }

    async function startCamera() {
      if (!cameraRequested) {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        stateRef.current.cameraActive = false;
        setCameraError(null);
        return;
      }
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        stateRef.current.cameraActive = false;
        setCameraError(
          "The camera needs a secure connection (https). Mouse play still works."
        );
        return;
      }
      try {
        setCameraError(null);
        const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
        const deviceId = await selfieForScreen();
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { ...size, deviceId: { exact: deviceId } } : { ...size, facingMode: "user" },
            audio: false,
          });
        } catch (err) {
          if (!deviceId) throw err;
          // That camera won't open: the browser's own front camera instead
          stream = await navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: "user" }, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // The camera can end on its own: the phone gives it to another app, or turns it off with the
        // screen. Open it again rather than leave a frozen picture (stopping it here never fires this)
        track?.addEventListener("ended", () => {
          if (!cancelled) setCameraEpoch((n) => n + 1);
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          stateRef.current.cameraActive = true;
          count("camera-on");
        }
        // On a first visit the cameras' names are only readable once the permission is given, so the
        // choice is made again now. On a foldable that can mean opening the other selfie camera, once
        if (!deviceId) {
          const wanted = await selfieForScreen();
          if (!cancelled && wanted && wanted !== track?.getSettings().deviceId) setCameraEpoch((n) => n + 1);
        }
      } catch (err) {
        stateRef.current.cameraActive = false;
        if (cancelled) return;
        setCameraError(cameraErrorMessage(err));
        count("camera-blocked");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      cameraStreamRef.current = null;
      s.cameraActive = false;
    };
  }, [cameraRequested, cameraEpoch]);

  // A foldable has a selfie camera for each screen (lib/camera.ts). Opening or closing it moves the player
  // to the other screen, which changes the screen's size, while turning the phone only swaps the sides. So a
  // size change on a touch screen opens the camera again, the one for that screen. (On a computer the same
  // change is the window moving to another monitor, which needs nothing.) A camera that ended while the tab
  // was hidden opens again when the tab comes back.
  useEffect(() => {
    if (!cameraRequested) return;
    let timer: number | undefined;
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCameraEpoch((n) => n + 1), 400);
    };

    let area = window.screen.width * window.screen.height;
    const onResize = () => {
      const next = window.screen.width * window.screen.height;
      if (next === area) return;
      area = next;
      if (navigator.maxTouchPoints > 0) restart();
    };
    window.addEventListener("resize", onResize);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (cameraStreamRef.current?.getVideoTracks()[0]?.readyState !== "live") restart();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cameraRequested]);

  // Hand tracking loads the first time the camera is asked for, not with the page: its runtime and model are
  // about 10 MB over the network, and mouse and touch players never need them. Once loaded it stays for the visit
  const landmarkerRef = useRef<import("@mediapipe/tasks-vision").HandLandmarker | null>(null);
  const visionStartedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      try {
        landmarkerRef.current?.close();
      } catch {}
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraRequested || visionStartedRef.current) return;
    visionStartedRef.current = true;

    const load = async (gpu: boolean) => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("/wasm");
      return vision.HandLandmarker.createFromOptions(
        fileset,
        gpu
          ? {
              baseOptions: {
                modelAssetPath: "/models/hand_landmarker.task",
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.55,
              minHandPresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            }
          : {
              baseOptions: {
                modelAssetPath: "/models/hand_landmarker.task",
              },
              runningMode: "VIDEO",
              numHands: 2,
            }
      );
    };

    (async () => {
      // the GPU first, then the CPU if this browser's GPU path fails
      let landmarker: import("@mediapipe/tasks-vision").HandLandmarker | null = null;
      try {
        landmarker = await load(true);
      } catch {
        try {
          landmarker = await load(false);
        } catch {
          landmarker = null;
        }
      }
      if (!landmarker) {
        if (!unmountedRef.current) setVisionFailed(true);
        return;
      }
      if (unmountedRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      setLandmarkerReady(true);
    })();
  }, [cameraRequested]);

  // The render loop, once per animation frame: camera texture and hand tracking, gestures, the shader pass,
  // then the HUD canvas
  useEffect(() => {
    let rafId = 0;
    let closed = false;
    const gestureDetector = new ChironomyGestureDetector();
    const landmarkSmoother = new HandLandmarkSmoother();

    const glCanvas = glCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!glCanvas || !hudCanvas) return;

    const gl = glCanvas.getContext("webgl2", {
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    const ctx2d = hudCanvas.getContext("2d");
    if (!gl || !ctx2d) {
      setGlUnavailable(true);
      return () => {
        closed = true;
      };
    }

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = 480;
    maskCanvas.height = 270;
    const maskCtx = maskCanvas.getContext("2d")!;

    function compileShader(type: number, source: string) {
      const sh = gl!.createShader(type)!;
      gl!.shaderSource(sh, source);
      gl!.compileShader(sh);
      return sh;
    }

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texCam = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texCam);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const texMask = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uTex = gl.getUniformLocation(prog, "u_tex");
    const uHandMask = gl.getUniformLocation(prog, "u_handMask");
    gl.uniform1i(uTex, 0);
    gl.uniform1i(uHandMask, 1);

    const uCamScale = gl.getUniformLocation(prog, "u_camScale");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uHasCam = gl.getUniformLocation(prog, "u_hasCamera");
    const uLook = gl.getUniformLocation(prog, "u_look");
    const uAudioRms = gl.getUniformLocation(prog, "u_audioRms");
    const uAudioLow = gl.getUniformLocation(prog, "u_audioLow");
    const uAudioHigh = gl.getUniformLocation(prog, "u_audioHigh");
    const uSpaceWarp = gl.getUniformLocation(prog, "u_spaceWarp");
    const uBlurAmount = gl.getUniformLocation(prog, "u_blurAmount");
    const uWristTwist = gl.getUniformLocation(prog, "u_wristTwist");
    const uPortalSurge = gl.getUniformLocation(prog, "u_portalSurge");
    const uPalmLeft = gl.getUniformLocation(prog, "u_palmLeft");
    const uPalmRight = gl.getUniformLocation(prog, "u_palmRight");
    const uRipples = Array.from({ length: 8 }, (_, i) =>
      gl.getUniformLocation(prog, `u_ripples[${i}]`)
    );

    let lastVideoTime = -1;
    let lastDetectionResult: {
      landmarks: { x: number; y: number; z: number }[][];
      handedness: HandSide[];
    } = { landmarks: [], handedness: [] };
    let lastTelemetryPush = 0;

    function buildSimulatedHands(tSec: number): {
      landmarks: { x: number; y: number; z: number }[][];
      handedness: HandSide[];
    } {
      const s = stateRef.current;
      const hands: { x: number; y: number; z: number }[][] = [];
      const sides: HandSide[] = ["left", "right"];

      const activeBeamX =
        s.rhythm !== "off"
          ? stringIndexToNormX(
              audioEngine.getSequenceSteps(s.rhythm)[s.activeStepIndex % 16] ?? 5
            )
          : s.pointerX;

      for (let h = 0; h < 2; h++) {
        const isRight = h === 1;
        const sign = isRight ? 1 : -1;
        const cx = isRight
          ? activeBeamX
          : stringIndexToNormX(audioEngine.getChordRootIndex());
        const cy = isRight
          ? Math.max(
              THEREMIN_MAX_Y + 0.04,
              Math.min(THEREMIN_MIN_Y, s.pointerY)
            )
          : 0.56 + Math.cos(tSec * 0.6) * 0.025;

        const pts: { x: number; y: number; z: number }[] = [];
        const wristX = cx;
        const wristY = cy + 0.16;
        pts.push({ x: wristX, y: wristY, z: 0 });

        const tDir = isRight ? -1 : 1;
        pts.push({ x: wristX + tDir * 0.03, y: wristY - 0.042, z: 0 });
        pts.push({ x: wristX + tDir * 0.054, y: wristY - 0.09, z: 0 });
        pts.push({ x: wristX + tDir * 0.068, y: wristY - 0.138, z: 0 });
        const thumbTipX = wristX + tDir * 0.062;
        const thumbTipY = wristY - 0.178;
        pts.push({ x: thumbTipX, y: thumbTipY, z: 0 });

        const knuckleOffsets = [
          { dx: -0.042 * sign, dy: -0.14 },
          { dx: -0.014 * sign, dy: -0.15 },
          { dx: 0.015 * sign, dy: -0.142 },
          { dx: 0.042 * sign, dy: -0.128 },
        ];
        const fanAngles = [
          -0.15 * sign,
          -0.03 * sign,
          0.06 * sign,
          0.19 * sign,
        ];
        const totalLengths = [0.16, 0.178, 0.165, 0.134];

        for (let f = 0; f < 4; f++) {
          const mcpX = wristX + knuckleOffsets[f].dx;
          const mcpY = wristY + knuckleOffsets[f].dy;
          const angle =
            fanAngles[f] + (s.wristTwistNorm - 0.5) * 0.22 * (isRight ? 1 : -1);
          const sinA = Math.sin(angle);
          const cosA = Math.cos(angle);
          const L = totalLengths[f];

          const pipX = mcpX + sinA * (L * 0.42);
          const pipY = mcpY - cosA * (L * 0.42);
          const dipX = mcpX + sinA * (L * 0.74);
          const dipY = mcpY - cosA * (L * 0.74);
          let tipX = mcpX + sinA * L;
          let tipY = mcpY - cosA * L;

          if ((s.pointerDown || s.rhythm !== "off") && isRight && f === 0) {
            tipX = thumbTipX;
            tipY = thumbTipY;
          }

          pts.push({ x: mcpX, y: mcpY, z: 0 });
          pts.push({ x: pipX, y: pipY, z: 0 });
          pts.push({ x: dipX, y: dipY, z: 0 });
          pts.push({ x: tipX, y: tipY, z: 0 });
        }
        hands.push(pts);
      }

      return { landmarks: hands, handedness: sides };
    }

    function uploadHandMask() {
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, texMask);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        maskCanvas
      );
    }

    // The hand mask keeps 0.78 of its brightness every 1/60 s, so its trail is as long on a 120 Hz screen as on a
    // 60 Hz one. After `MASK_FADE_MS` with no hand it is cleared once, then neither drawn nor uploaded again
    // until a hand comes back
    const MASK_FADE_MS = 600;
    let maskIdleMs = 0;
    let maskClear = false;

    function updateHandMaskTexture(
      hands: { x: number; y: number; z: number }[][],
      dtMs: number
    ) {
      const mw = maskCanvas.width;
      const mh = maskCanvas.height;

      maskCtx.filter = "none";
      maskCtx.globalCompositeOperation = "source-over";
      if (hands.length > 0) {
        maskIdleMs = 0;
        maskClear = false;
      } else if (maskClear) {
        return;
      } else if ((maskIdleMs += dtMs) > MASK_FADE_MS) {
        maskCtx.clearRect(0, 0, mw, mh);
        uploadHandMask();
        maskClear = true;
        return;
      }
      maskCtx.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(0.78, dtMs / (1000 / 60))})`;
      maskCtx.fillRect(0, 0, mw, mh);

      maskCtx.filter = "blur(9px)";
      maskCtx.lineCap = "round";
      maskCtx.lineJoin = "round";

      for (const lm of hands) {
        const handScale = Math.max(
          0.07,
          Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y)
        );
        const fingerW = handScale * mw * 0.21;
        const rimW = fingerW * 1.95;

        const wristX = lm[0].x * mw;
        const wristY = lm[0].y * mh;
        const midX = lm[9].x * mw;
        const midY = lm[9].y * mh;
        const armDx = wristX - midX;
        const armDy = Math.max(25, wristY - midY);
        const armEndX = wristX + armDx * 1.4;
        const armEndY = wristY + armDy * 1.8;

        maskCtx.strokeStyle = "rgb(0, 240, 180)";
        maskCtx.fillStyle = "rgb(0, 240, 180)";
        maskCtx.lineWidth = rimW;

        maskCtx.beginPath();
        maskCtx.moveTo(wristX, wristY);
        maskCtx.lineTo(armEndX, armEndY);
        maskCtx.stroke();

        maskCtx.beginPath();
        maskCtx.moveTo(lm[0].x * mw, lm[0].y * mh);
        maskCtx.lineTo(lm[1].x * mw, lm[1].y * mh);
        maskCtx.lineTo(lm[5].x * mw, lm[5].y * mh);
        maskCtx.lineTo(lm[9].x * mw, lm[9].y * mh);
        maskCtx.lineTo(lm[13].x * mw, lm[13].y * mh);
        maskCtx.lineTo(lm[17].x * mw, lm[17].y * mh);
        maskCtx.closePath();
        maskCtx.fill();
        maskCtx.stroke();

        for (const chain of FINGER_CHAINS) {
          maskCtx.beginPath();
          maskCtx.moveTo(lm[chain[0]].x * mw, lm[chain[0]].y * mh);
          for (let i = 1; i < chain.length; i++) {
            maskCtx.lineTo(lm[chain[i]].x * mw, lm[chain[i]].y * mh);
          }
          maskCtx.stroke();
        }

        maskCtx.strokeStyle = "rgb(255, 110, 30)";
        maskCtx.fillStyle = "rgb(255, 110, 30)";
        maskCtx.lineWidth = fingerW;

        maskCtx.beginPath();
        maskCtx.moveTo(wristX, wristY);
        maskCtx.lineTo(armEndX, armEndY);
        maskCtx.stroke();

        maskCtx.beginPath();
        maskCtx.moveTo(lm[0].x * mw, lm[0].y * mh);
        maskCtx.lineTo(lm[1].x * mw, lm[1].y * mh);
        maskCtx.lineTo(lm[5].x * mw, lm[5].y * mh);
        maskCtx.lineTo(lm[9].x * mw, lm[9].y * mh);
        maskCtx.lineTo(lm[13].x * mw, lm[13].y * mh);
        maskCtx.lineTo(lm[17].x * mw, lm[17].y * mh);
        maskCtx.closePath();
        maskCtx.fill();
        maskCtx.stroke();

        for (const chain of FINGER_CHAINS) {
          maskCtx.beginPath();
          maskCtx.moveTo(lm[chain[0]].x * mw, lm[chain[0]].y * mh);
          for (let i = 1; i < chain.length; i++) {
            maskCtx.lineTo(lm[chain[i]].x * mw, lm[chain[i]].y * mh);
          }
          maskCtx.stroke();
        }
      }

      uploadHandMask();
    }

    let lastVisionMs = performance.now();
    function renderLoop(nowMs: number) {
      const s0 = stateRef.current;
      const frame = Math.max(0, nowMs - lastVisionMs);
      lastVisionMs = nowMs;
      s0.visionMs = s0.visionMs * 0.85 + frame * 0.15;
      if (closed) return;
      rafId = requestAnimationFrame(renderLoop);

      const tSec = nowMs * 0.001;
      const s = stateRef.current;

      s.portalSurge = Math.max(0, s.portalSurge * 0.94 - 0.002);

      for (let i = 0; i < 8; i++) {
        harpStringsVibRef.current[i] *= 0.91;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.floor(glCanvas!.clientWidth * dpr);
      const ch = Math.floor(glCanvas!.clientHeight * dpr);
      if (glCanvas!.width !== cw || glCanvas!.height !== ch) {
        glCanvas!.width = cw;
        glCanvas!.height = ch;
        hudCanvas!.width = cw;
        hudCanvas!.height = ch;
        gl!.viewport(0, 0, cw, ch);
      }

      const video = videoRef.current;
      const camLive = Boolean(
        s.cameraActive &&
          video &&
          video.readyState >= 2 &&
          video.videoWidth > 0
      );

      // The part of the camera picture the stage shows, at its true shape (lib/camera-fit.ts). The stage follows
      // the page layout, so the crop changes with the window; nothing asks the player to turn the phone
      const fit = camLive && video ? coverFit(video.videoWidth / video.videoHeight, cw / ch) : WHOLE;

      if (camLive && video) {
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, texCam);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          gl!.RGBA,
          gl!.RGBA,
          gl!.UNSIGNED_BYTE,
          video
        );

        const handLandmarker = landmarkerRef.current;
        if (handLandmarker && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          try {
            const res = handLandmarker.detectForVideo(video, nowMs);
            const mirrored = (res.landmarks ?? []).map((hand, hIdx) =>
              landmarkSmoother.smooth(
                hIdx,
                hand.map((lm) => toStage({ x: 1.0 - lm.x, y: lm.y, z: lm.z }, fit)),
                tSec
              )
            );
            const sides: HandSide[] = (res.handednesses ?? []).map(
              (_, idx) => {
                const wristX = mirrored[idx]?.[0]?.x ?? 0.5;
                return wristX < 0.5 ? "left" : "right";
              }
            );
            lastDetectionResult = { landmarks: mirrored, handedness: sides };
          } catch {}
        }
        updateHandMaskTexture(lastDetectionResult.landmarks, frame);
      } else {
        lastDetectionResult = buildSimulatedHands(tSec);
      }

      let palmLeft: [number, number] = [-1, -1];
      let palmRight: [number, number] = [-1, -1];
      const poses: HandPoseMetrics[] = [];
      let activeRibbonSlot = -1;
      let activeRibbonProgress = 0;
      let leftHandFistHold = false;
      const handsCount = lastDetectionResult.landmarks.length;
      let livePinch = 0;

      const handPinchMeters: {
        midX: number;
        midY: number;
        prox: number;
        pinched: boolean;
      }[] = [];

      for (let h = 0; h < handsCount; h++) {
        const lm = lastDetectionResult.landmarks[h];
        const side =
          lastDetectionResult.handedness[h] ??
          (lm[0].x < 0.5 ? "left" : "right");

        const evalRes = gestureDetector.evaluateHand(
          lm,
          side,
          nowMs,
          camLive,
          s.laserStrumEnabled
        );
        const m = evalRes.metrics;

        if (camLive && m.pinchDistance > 0) {
          livePinch =
            livePinch === 0
              ? m.pinchDistance
              : Math.min(livePinch, m.pinchDistance);
        }

        handPinchMeters.push({
          midX: (lm[4].x + lm[8].x) * 0.5,
          midY: (lm[4].y + lm[8].y) * 0.5,
          prox: m.pinchProximityNorm,
          pinched: m.isIndexPinched,
        });

        if (side === "left") {
          palmLeft = [m.palmX, m.palmY];
          if (camLive) {
            const leftChordIdx = Math.max(
              0,
              Math.min(3, Math.floor(m.palmX * 8))
            ) as 0 | 1 | 2 | 3;
            audioEngine.setChordRootIndex(leftChordIdx);
            if (m.fistProgress > 0.25) {
              leftHandFistHold = true;
            }
          }
        } else {
          palmRight = [m.palmX, m.palmY];
        }

        if (side === "right" || handsCount === 1) {
          s.hoveredStringIndex = m.hoveredStringIndex;
        }

        if (m.ribbonSlotHover >= 0) {
          activeRibbonSlot = m.ribbonSlotHover;
          activeRibbonProgress = m.ribbonHoldProgress;
        }

        poses.push(m);

        if (evalRes.macroEvent) {
          s.portalSurge = 0.85;
          callbacksRef.current.onMacroGesture(evalRes.macroEvent);
        }

        if (evalRes.pluck && camLive) {
          const p = evalRes.pluck;
          if (s.rhythm !== "off" && side === "left") {
            // With a song or riff running, the left hand only sets the chord root (above): its pinch plays nothing
          } else {
            count("note-pinch");
            externalTriggerRef.current?.(p.hand, p.finger);
          }
        }
      }

      if (camLive) {
        audioEngine.setStutterFreeze(leftHandFistHold);
      }

      s.ribbonSlotHover = activeRibbonSlot;
      s.ribbonHoldProgress = activeRibbonProgress;

      if (palmLeft[0] >= 0 && palmRight[0] >= 0) {
        const bridgeDist = Math.hypot(
          palmRight[0] - palmLeft[0],
          palmRight[1] - palmLeft[1]
        );
        const normBridge = Math.max(
          0,
          Math.min(1, (bridgeDist - 0.15) / 0.65)
        );
        s.handBridgeNorm = s.handBridgeNorm * 0.82 + normBridge * 0.18;
      }

      const avg = averageHandPose(poses);
      if (avg && camLive) {
        s.spaceWarp = s.spaceWarp * 0.82 + avg.spread * 0.18;
        s.blurAmount = s.blurAmount * 0.82 + (1.0 - avg.spread) * 0.48 * 0.18;
        if (s.thereminEnabled) {
          s.filterCutoffNorm = s.filterCutoffNorm * 0.78 + avg.elevation * 0.22;
        }
        s.wristTwistNorm = s.wristTwistNorm * 0.82 + avg.wristRoll * 0.18;

        audioEngine.setSpatialParameters(
          s.filterCutoffNorm,
          s.spaceWarp,
          s.wristTwistNorm,
          s.handBridgeNorm
        );
      }

      const chartLive = s.rhythm !== "off" && s.quantizeMode !== "guide";
      if (chartLive && camLive) {
        for (let h = 0; h < handsCount; h++) {
          const pm = handPinchMeters[h];
          const lm = lastDetectionResult.landmarks[h];
          if (!lm) continue;
          const beam = Math.max(0, Math.min(7, Math.floor(lm[8].x * 8)));
          if (pm?.pinched || s.laserStrumEnabled) {
            audioEngine.setArcadeHandsPresent(true);
            catchGem(beam);
          }
        }
      } else if (chartLive && s.pointerDown) {
        audioEngine.setArcadeHandsPresent(true);
        catchGem(s.hoveredStringIndex);
      }
      audioEngine.serviceArcade();

      // Shader pass: set the uniforms, then draw one full-screen quad
      const energy = audioEngine.getAudioEnergy();
      const lookSpec =
        SHADER_LOOKS.find((l) => l.id === s.look) ?? SHADER_LOOKS[0];

      gl!.useProgram(prog);
      gl!.uniform2f(uRes, cw, ch);
      gl!.uniform2f(uCamScale, fit.scaleX, fit.scaleY);
      gl!.uniform1f(uTime, tSec);
      gl!.uniform1i(uHasCam, camLive ? 1 : 0);
      gl!.uniform1i(uLook, lookSpec.index);
      gl!.uniform1f(uAudioRms, energy.rms);
      gl!.uniform1f(uAudioLow, energy.low);
      gl!.uniform1f(uAudioHigh, energy.high);
      gl!.uniform1f(uSpaceWarp, s.spaceWarp);
      gl!.uniform1f(uBlurAmount, s.blurAmount);
      gl!.uniform1f(uWristTwist, s.wristTwistNorm);
      gl!.uniform1f(uPortalSurge, s.portalSurge);
      gl!.uniform2f(uPalmLeft, palmLeft[0], palmLeft[1]);
      gl!.uniform2f(uPalmRight, palmRight[0], palmRight[1]);

      const activeRipples = ripplesRef.current.filter(
        (r) => nowMs - r.born < 1150
      );
      ripplesRef.current = activeRipples;

      for (let i = 0; i < 8; i++) {
        const rp = activeRipples[i];
        if (rp) {
          const age = Math.min(1, Math.max(0.001, (nowMs - rp.born) / 1150));
          gl!.uniform4f(uRipples[i], rp.x, rp.y, age, rp.finger);
        } else {
          gl!.uniform4f(uRipples[i], -1, -1, 0, 0);
        }
      }

      gl!.drawArrays(gl!.TRIANGLES, 0, 6);

      // HUD on the 2D canvas over the shader
      ctx2d!.clearRect(0, 0, cw, ch);
      const modeSpec = MODES.find((m) => m.id === s.mode) ?? MODES[0];
      const allSolm = [
        ...modeSpec.solmizationLeft,
        ...modeSpec.solmizationRight,
      ];

      const ribbonH = ch * TOP_RIBBON_Y;

      // Theremin height line and its readout, only while the theremin is on. The readout sits at the left edge,
      // clear of the right hand
      const thereminY = elevationNormToStageY(s.filterCutoffNorm) * ch;
      if (s.thereminEnabled) {
        ctx2d!.strokeStyle = "rgba(245, 166, 35, 0.5)";
        ctx2d!.lineWidth = 1.2 * dpr;
        ctx2d!.beginPath();
        ctx2d!.moveTo(0, thereminY);
        ctx2d!.lineTo(cw, thereminY);
        ctx2d!.stroke();

        const curVowel = audioEngine.getCurrentVowel();
        const chordSpec = CHORD_ROOTS[audioEngine.getChordRootIndex()];
        const pillY = Math.max(ribbonH + 4 * dpr, thereminY - 19 * dpr);
        ctx2d!.fillStyle = "rgba(5, 5, 7, 0.88)";
        ctx2d!.strokeStyle = "rgba(245, 166, 35, 0.45)";
        ctx2d!.lineWidth = 1 * dpr;
        ctx2d!.fillRect(12 * dpr, pillY, 248 * dpr, 16 * dpr);
        ctx2d!.strokeRect(12 * dpr, pillY, 248 * dpr, 16 * dpr);
        ctx2d!.fillStyle = "#F5A623";
        ctx2d!.font = `700 ${8.8 * dpr}px "Monaspace Xenon", monospace`;
        ctx2d!.textAlign = "left";
        ctx2d!.fillText(
          `THEREMIN Y ${Math.round(s.filterCutoffNorm * 100)}% · VOWEL [${curVowel}] · CHORD [${chordSpec.roman}]`,
          18 * dpr,
          pillY + 11 * dpr
        );
      } else {
        // Off: no beam and no height, only the chord, in a fixed place under the ribbon
        const pillY = ribbonH + 4 * dpr;
        ctx2d!.fillStyle = "rgba(5, 5, 7, 0.88)";
        ctx2d!.strokeStyle = "rgba(244, 239, 230, 0.18)";
        ctx2d!.lineWidth = 1 * dpr;
        ctx2d!.fillRect(12 * dpr, pillY, 168 * dpr, 16 * dpr);
        ctx2d!.strokeRect(12 * dpr, pillY, 168 * dpr, 16 * dpr);
        ctx2d!.fillStyle = "rgba(244, 239, 230, 0.72)";
        ctx2d!.font = `700 ${8.8 * dpr}px "Monaspace Xenon", monospace`;
        ctx2d!.textAlign = "left";
        ctx2d!.fillText(
          `THEREMIN OFF · CHORD [${CHORD_ROOTS[audioEngine.getChordRootIndex()].roman}]`,
          18 * dpr,
          pillY + 11 * dpr
        );
      }

      // The 8 beams, the strike line (78% of the way down the beams) and their receptors
      const stringTopY = ribbonH + 14 * dpr;
      const stringBotY = ch - 14 * dpr;
      const strikeY = stringTopY + (stringBotY - stringTopY) * 0.78;
      s.strikeNormY = strikeY / ch;
      ctx2d!.strokeStyle = "rgba(244, 239, 230, 0.72)";
      ctx2d!.lineWidth = 1.6 * dpr;
      ctx2d!.beginPath();
      ctx2d!.moveTo(10 * dpr, strikeY);
      ctx2d!.lineTo(cw - 10 * dpr, strikeY);
      ctx2d!.stroke();
      const activeSeqId =
        s.rhythm !== "off"
          ? s.rhythm
          : s.quantizeMode === "guide"
            ? "saltarello"
            : null;
      const seqSteps = activeSeqId
        ? audioEngine.getSequenceSteps(activeSeqId)
        : null;
      const curStepIdx = audioEngine.getCurrentSequenceStep();
      const guideTargetBeam =
        s.quantizeMode === "guide" && seqSteps ? seqSteps[curStepIdx] : null;

      for (let i = 0; i < 8; i++) {
        const sx = ((i + 0.5) / 8) * cw;
        const vib = harpStringsVibRef.current[i];
        const isHovered = s.hoveredStringIndex === i;
        const isGuideTarget = guideTargetBeam === i;
        const chColor = FINGER_COLORS[i % 4];

        if (isHovered || isGuideTarget) {
          ctx2d!.fillStyle = isGuideTarget
            ? "rgba(245, 166, 35, 0.08)"
            : "rgba(45, 127, 249, 0.035)";
          ctx2d!.fillRect(
            (i / 8) * cw,
            stringTopY,
            cw / 8,
            stringBotY - stringTopY
          );
        }

        // Beam header: the chord roots over the first four beams, the beam number over the rest
        if (i < 4) {
          const isChordActive = audioEngine.getChordRootIndex() === i;
          const cSpec = CHORD_ROOTS[i];
          ctx2d!.fillStyle = isChordActive
            ? "#F5A623"
            : "rgba(244, 239, 230, 0.35)";
          ctx2d!.font = `700 ${8.5 * dpr}px "Monaspace Xenon", monospace`;
          ctx2d!.textAlign = "center";
          // a lane narrower than the full label (a phone) gets the short one, so neighbours never touch
          ctx2d!.fillText(
            cw / 8 < 56 * dpr ? cSpec.roman : `CHORD ${cSpec.roman}`,
            sx,
            stringTopY + 14 * dpr
          );
        } else {
          ctx2d!.fillStyle = isHovered
            ? "#2D7FF9"
            : "rgba(244, 239, 230, 0.38)";
          ctx2d!.font = `700 ${8.5 * dpr}px "Monaspace Xenon", monospace`;
          ctx2d!.textAlign = "center";
          ctx2d!.fillText(cw / 8 < 56 * dpr ? `#${i + 1}` : `BEAM #${i + 1}`, sx, stringTopY + 14 * dpr);
        }

        ctx2d!.strokeStyle =
          vib > 0.08
            ? chColor
            : isGuideTarget
              ? "#F5A623"
              : isHovered
                ? "rgba(244, 239, 230, 0.62)"
                : "rgba(244, 239, 230, 0.13)";
        ctx2d!.lineWidth =
          (vib > 0.08 || isGuideTarget ? 2.5 : isHovered ? 1.5 : 1.0) * dpr;

        ctx2d!.beginPath();
        if (vib > 0.02) {
          const segs = 28;
          for (let k = 0; k <= segs; k++) {
            const u = k / segs;
            const py = stringTopY + (stringBotY - stringTopY) * u;
            const wave =
              Math.sin(u * Math.PI) *
              Math.sin(tSec * 58 + i) *
              vib *
              14 *
              dpr;
            if (k === 0) ctx2d!.moveTo(sx + wave, py);
            else ctx2d!.lineTo(sx + wave, py);
          }
        } else {
          ctx2d!.moveTo(sx, stringTopY + 20 * dpr);
          ctx2d!.lineTo(sx, stringBotY);
        }
        ctx2d!.stroke();

        if (isGuideTarget) {
          const pulseR = (12 + Math.sin(tSec * 10) * 3) * dpr;
          ctx2d!.strokeStyle = "#F5A623";
          ctx2d!.lineWidth = 2.2 * dpr;
          ctx2d!.beginPath();
          ctx2d!.arc(sx, strikeY, pulseR, 0, Math.PI * 2);
          ctx2d!.stroke();
          ctx2d!.fillStyle = "#F5A623";
          ctx2d!.font = `800 ${9 * dpr}px "Monaspace Xenon", monospace`;
          ctx2d!.fillText("PINCH HERE", sx, strikeY - pulseR - 6 * dpr);
        } else if (isHovered || vib > 0.1) {
          ctx2d!.fillStyle = chColor;
          ctx2d!.beginPath();
          ctx2d!.arc(
            sx,
            s.thereminEnabled ? thereminY : strikeY,
            (vib > 0.1 ? 6.5 : 4.5) * dpr,
            0,
            Math.PI * 2
          );
          ctx2d!.fill();
        }

        const receptorHot = isHovered || isGuideTarget || vib > 0.2;
        ctx2d!.strokeStyle = receptorHot ? chColor : "rgba(244, 239, 230, 0.55)";
        ctx2d!.lineWidth = (receptorHot ? 2.2 : 1.3) * dpr;
        ctx2d!.beginPath();
        ctx2d!.moveTo(sx - 16 * dpr, strikeY - 7 * dpr);
        ctx2d!.lineTo(sx - 16 * dpr, strikeY);
        ctx2d!.lineTo(sx + 16 * dpr, strikeY);
        ctx2d!.lineTo(sx + 16 * dpr, strikeY - 7 * dpr);
        ctx2d!.stroke();
        ctx2d!.fillStyle = receptorHot ? chColor : "rgba(244, 239, 230, 0.85)";
        ctx2d!.beginPath();
        ctx2d!.arc(sx, strikeY, (receptorHot ? 3.4 : 2.2) * dpr, 0, Math.PI * 2);
        ctx2d!.fill();

        ctx2d!.fillStyle =
          vib > 0.1
            ? chColor
            : isHovered
              ? "#FFFFFF"
              : "rgba(244, 239, 230, 0.52)";
        ctx2d!.font = `700 ${9.5 * dpr}px "Monaspace Xenon", monospace`;
        ctx2d!.textAlign = "center";
        ctx2d!.fillText(
          `${allSolm[i]}`,
          sx,
          strikeY + 16 * dpr
        );
      }

      // Falling note gems: each reaches its receptor on the strike line when the song clock hits its step
      if (seqSteps) {
        const clock = audioEngine.getSongClock();
        const stepFloat = clock.guideHold
          ? clock.stepFloat
          : clock.running
            ? clock.stepFloat
            : curStepIdx;
        const stride = clock.guideHold ? 1 : audioEngine.getCatchStride();
        const anthem = s.rhythm === "anthem" || s.rhythm === "harbor" || s.rhythm === "night";
        const horizon = anthem ? 3.4 : Math.max(8, stride * 4);
        const travel = Math.max(80 * dpr, strikeY - (stringTopY + 36 * dpr));
        const spawn = Math.floor(stepFloat);
        for (let n = spawn - stride; n <= spawn + horizon; n++) {
          if (n < 0) continue;
          if (stride > 1 && n % stride !== 0) continue;
          const dist = n - stepFloat;
          if (dist < -0.7 || dist > horizon + 0.2) continue;
          const beamIdx = seqSteps[((n % seqSteps.length) + seqSteps.length) % seqSteps.length];
          const bx = ((beamIdx + 0.5) / 8) * cw;
          const ny = strikeY - (dist / horizon) * travel;
          if (ny < stringTopY + 16 * dpr || ny > strikeY + 18 * dpr) continue;
          const col = FINGER_COLORS[beamIdx % 4];
          const imminent = Math.abs(dist) < 0.18;
          const gemW = (imminent ? 52 : 44) * dpr;
          const gemH = 20 * dpr;
          ctx2d!.save();
          ctx2d!.globalAlpha = dist < 0 ? Math.max(0, 1 + dist * 1.4) : 1;
          ctx2d!.fillStyle = imminent ? "#FFFFFF" : col;
          ctx2d!.strokeStyle = "#08080A";
          ctx2d!.lineWidth = 2 * dpr;
          ctx2d!.beginPath();
          ctx2d!.roundRect(
            bx - gemW * 0.5,
            ny - gemH * 0.5,
            gemW,
            gemH,
            4 * dpr
          );
          ctx2d!.fill();
          ctx2d!.stroke();
          ctx2d!.strokeStyle = col;
          ctx2d!.lineWidth = 3 * dpr;
          ctx2d!.globalAlpha *= 0.9;
          ctx2d!.beginPath();
          ctx2d!.moveTo(bx, ny - gemH * 0.5);
          ctx2d!.lineTo(
            bx,
            ny - gemH * 0.5 - Math.min(54, Math.max(0, dist) * 28) * dpr
          );
          ctx2d!.stroke();
          ctx2d!.globalAlpha = dist < 0 ? Math.max(0, 1 + dist * 2.2) : 1;
          ctx2d!.fillStyle = imminent ? "#111113" : "#08080A";
          ctx2d!.font = `800 ${11 * dpr}px "Anybody", sans-serif`;
          ctx2d!.textAlign = "center";
          ctx2d!.fillText(`${allSolm[beamIdx]}`, bx, ny + 4 * dpr);
          ctx2d!.restore();
        }
      }
      ctx2d!.textAlign = "left";

      // Hand skeletons, palm rings and fingertips
      for (let h = 0; h < handsCount; h++) {
        const lm = lastDetectionResult.landmarks[h];
        const side =
          lastDetectionResult.handedness[h] ??
          (lm[0].x < 0.5 ? "left" : "right");

        ctx2d!.strokeStyle = "rgba(244, 239, 230, 0.72)";
        ctx2d!.lineWidth = 1.4 * dpr;
        ctx2d!.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx2d!.moveTo(lm[a].x * cw, lm[a].y * ch);
          ctx2d!.lineTo(lm[b].x * cw, lm[b].y * ch);
        }
        ctx2d!.stroke();

        ctx2d!.fillStyle = "rgba(244, 239, 230, 0.85)";
        for (let j = 0; j < 21; j++) {
          if (FINGER_TIPS.includes(j) || j === 4) continue;
          ctx2d!.beginPath();
          ctx2d!.arc(lm[j].x * cw, lm[j].y * ch, 2 * dpr, 0, Math.PI * 2);
          ctx2d!.fill();
        }

        const px =
          ((lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5) * cw;
        const py =
          ((lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5) * ch;
        const palmR = (26 + s.spaceWarp * 18 + energy.rms * 16) * dpr;

        ctx2d!.save();
        ctx2d!.translate(px, py);
        ctx2d!.rotate((s.wristTwistNorm - 0.5) * Math.PI);
        ctx2d!.strokeStyle =
          side === "left"
            ? "rgba(245, 166, 35, 0.65)"
            : "rgba(45, 127, 249, 0.65)";
        ctx2d!.lineWidth = 1.2 * dpr;
        ctx2d!.beginPath();
        ctx2d!.arc(0, 0, palmR, 0, Math.PI * 2);
        ctx2d!.stroke();
        ctx2d!.restore();

        const tx = lm[4].x * cw;
        const ty = lm[4].y * ch;
        ctx2d!.fillStyle = "#08080A";
        ctx2d!.strokeStyle = "#FFFFFF";
        ctx2d!.lineWidth = 1.6 * dpr;
        ctx2d!.beginPath();
        ctx2d!.arc(tx, ty, 5 * dpr, 0, Math.PI * 2);
        ctx2d!.fill();
        ctx2d!.stroke();

        // Pinch ring between the thumb tip (4) and the index tip (8): it shrinks as they close, red once pinched
        const pm = handPinchMeters[h];
        if (pm) {
          const mx = pm.midX * cw;
          const my = pm.midY * ch;
          const ringR = Math.max(6, (1.0 - pm.prox * 0.72) * 18) * dpr;
          ctx2d!.strokeStyle = pm.pinched
            ? "#FF3B2F"
            : pm.prox > 0.55
              ? "#F5A623"
              : "rgba(45, 127, 249, 0.65)";
          ctx2d!.lineWidth = (pm.pinched ? 2.6 : 1.4) * dpr;
          ctx2d!.beginPath();
          ctx2d!.arc(mx, my, ringR, 0, Math.PI * 2);
          ctx2d!.stroke();
        }

        for (let f = 0; f < 4; f++) {
          const tip = lm[FINGER_TIPS[f]];
          const fx = tip.x * cw;
          const fy = tip.y * ch;
          const color = FINGER_COLORS[f];
          const isPrimaryIndex = f === 0;

          if (isPrimaryIndex) {
            ctx2d!.strokeStyle = pm?.pinched
              ? "#FF3B2F"
              : "rgba(45, 127, 249, 0.65)";
            ctx2d!.lineWidth = (pm?.pinched ? 2.4 : 1.4) * dpr;
            ctx2d!.beginPath();
            ctx2d!.moveTo(tx, ty);
            ctx2d!.lineTo(fx, fy);
            ctx2d!.stroke();
          }

          ctx2d!.fillStyle = isPrimaryIndex ? color : "#08080A";
          ctx2d!.strokeStyle = color;
          ctx2d!.lineWidth = 1.6 * dpr;
          ctx2d!.beginPath();
          ctx2d!.arc(
            fx,
            fy,
            (isPrimaryIndex ? 6.5 : 4.5) * dpr,
            0,
            Math.PI * 2
          );
          ctx2d!.fill();
          ctx2d!.stroke();
        }
      }

      // Note labels that rise and fade over 1 s
      const activeGlyphs = glyphsRef.current.filter(
        (g) => nowMs - g.born < 1000
      );
      glyphsRef.current = activeGlyphs;

      for (const g of activeGlyphs) {
        const age = (nowMs - g.born) / 1000;
        const alpha = Math.max(0, 1 - age);
        const gx = g.x * cw;
        const gy = g.y * ch - age * 46 * dpr;
        ctx2d!.save();
        ctx2d!.font = `800 ${16 * dpr}px "Anybody", sans-serif`;
        ctx2d!.fillStyle = FINGER_COLORS[g.finger];
        ctx2d!.globalAlpha = alpha;
        ctx2d!.textAlign = "center";
        ctx2d!.fillText(`${g.solm} · ${g.note}`, gx, gy);
        ctx2d!.restore();
      }

      // Hit sparks on the strike line, then the score, combo and the last grade
      const liveBursts = burstsRef.current.filter((b) => nowMs - b.born < 420);
      burstsRef.current = liveBursts;
      for (const b of liveBursts) {
        const age = (nowMs - b.born) / 420;
        const bx = ((b.beam + 0.5) / 8) * cw;
        const col =
          b.grade === "PERFECT"
            ? "#FFFFFF"
            : b.grade === "GREAT"
              ? "#F5A623"
              : "#2D7FF9";
        ctx2d!.strokeStyle = col;
        ctx2d!.globalAlpha = 1 - age;
        ctx2d!.lineWidth = 1.4 * dpr;
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + age;
          const inner = 6 * dpr;
          const outer = (10 + age * 28) * dpr;
          ctx2d!.beginPath();
          ctx2d!.moveTo(bx + Math.cos(ang) * inner, strikeY + Math.sin(ang) * inner);
          ctx2d!.lineTo(bx + Math.cos(ang) * outer, strikeY + Math.sin(ang) * outer);
          ctx2d!.stroke();
        }
        ctx2d!.globalAlpha = 1;
      }

      const arcade = audioEngine.getArcadeState();
      const clockNow = audioEngine.getSongClock();
      if (clockNow.running && !clockNow.guideHold) {
        ctx2d!.textAlign = "right";
        ctx2d!.font = `800 ${18 * dpr}px "Anybody", sans-serif`;
        ctx2d!.fillStyle = "#FFFFFF";
        ctx2d!.fillText(
          String(arcade.score).padStart(6, "0"),
          cw - 16 * dpr,
          ribbonH + 36 * dpr
        );
        ctx2d!.font = `700 ${10 * dpr}px "Monaspace Xenon", monospace`;
        ctx2d!.fillStyle = arcade.combo > 0 ? "#F5A623" : "rgba(244,239,230,0.7)";
        ctx2d!.fillText(
          `${arcade.multiplier}×  COMBO ${arcade.combo}`,
          cw - 16 * dpr,
          ribbonH + 52 * dpr
        );
        ctx2d!.textAlign = "left";
      }
      if (arcade.lastGrade && nowMs - arcade.lastGradeAt < 640) {
        const age = (nowMs - arcade.lastGradeAt) / 640;
        const pop = 1 + Math.sin(Math.min(1, age * 4) * Math.PI) * 0.08;
        ctx2d!.save();
        ctx2d!.translate(cw * 0.5, strikeY - 36 * dpr);
        ctx2d!.scale(pop, pop);
        ctx2d!.globalAlpha = 1 - age;
        ctx2d!.textAlign = "center";
        ctx2d!.font = `800 ${22 * dpr}px "Anybody", sans-serif`;
        ctx2d!.fillStyle =
          arcade.lastGrade === "MISS"
            ? "#FF3B2F"
            : arcade.lastGrade === "PERFECT"
              ? "#FFFFFF"
              : "#F5A623";
        ctx2d!.fillText(arcade.lastGrade, 0, 0);
        ctx2d!.restore();
      }

      // Telemetry for the page, at most every 90 ms
      if (nowMs - lastTelemetryPush > 90) {
        lastTelemetryPush = nowMs;
        setHud((prev) =>
          prev.slotHover === s.ribbonSlotHover &&
          prev.holdProgress === s.ribbonHoldProgress &&
          prev.cameraActive === s.cameraActive
            ? prev
            : { slotHover: s.ribbonSlotHover, holdProgress: s.ribbonHoldProgress, cameraActive: s.cameraActive }
        );
        onTelemetry({
          cameraActive: camLive,
          demoMode: !camLive,
          handsDetected: handsCount,
          lastNote: s.lastNote,
          lastSolmization: s.lastSolmization,
          lastFreqHz: s.lastFreqHz,
          lastFinger: s.lastFinger,
          currentVowel: audioEngine.getCurrentVowel(),
          spaceWarp: s.spaceWarp,
          blurAmount: s.blurAmount,
          filterCutoffNorm: s.filterCutoffNorm,
          wristTwistNorm: s.wristTwistNorm,
          handBridgeNorm: s.handBridgeNorm,
          reverbAmount: s.reverbAmount,
          activeFingersLeft: [...activePadsRef.current.left] as [
            boolean,
            boolean,
            boolean,
            boolean,
          ],
          activeFingersRight: [...activePadsRef.current.right] as [
            boolean,
            boolean,
            boolean,
            boolean,
          ],
          hoveredStringIndex: s.hoveredStringIndex,
          ribbonSlotHover: s.ribbonSlotHover,
          ribbonHoldProgress: s.ribbonHoldProgress,
          waveform: audioEngine.getWaveformSnapshot(),
          activeStepIndex: clockNow.running
            ? clockNow.stepIndex
            : s.activeStepIndex,
          songStepFloat: clockNow.stepFloat,
          chordRootIdx: audioEngine.getChordRootIndex(),
          stutterActive: audioEngine.isStutterActive(),
          guideTargetBeam,
          arcadeScore: arcade.score,
          arcadeCombo: arcade.combo,
          arcadeMultiplier: arcade.multiplier,
          arcadeGrade: arcade.lastGrade,
          arcadeHands: arcade.handsPresent,
          pinchDistance: livePinch,
          visionMs: s.visionMs,
          audioMs: audioEngine.getOutputLatencyMs(),
        });
      }
    }

    rafId = requestAnimationFrame(renderLoop);

    return () => {
      closed = true;
      cancelAnimationFrame(rafId);
    };
  }, [onTelemetry, externalTriggerRef]);

  const currentVoiceSpec = VOICES.find((v) => v.id === voice) ?? VOICES[0];
  const currentLookSpec =
    SHADER_LOOKS.find((l) => l.id === look) ?? SHADER_LOOKS[0];
  const currentModeSpec = MODES.find((m) => m.id === mode) ?? MODES[0];

  // The stage's hint, in full and in a short form for a narrow stage (a phone)
  const hint =
    rhythm === "anthem" || rhythm === "harbor" || rhythm === "night"
      ? { long: "SONG BOOK · PINCH EACH NOTE AS IT MEETS THE WHITE LINE", short: "PINCH EACH NOTE ON THE WHITE LINE" }
      : rhythm !== "off"
        ? { long: "ONE GEM PER BEAT · HOLD THE PINCH ON ITS BEAM AS IT MEETS THE WHITE LINE", short: "PINCH EACH GEM ON THE WHITE LINE" }
        : hud.cameraActive
          ? { long: "OPEN HAND AIMS · PINCH THUMB AND INDEX TO PLAY · UP AND DOWN SWEEPS THE FILTER", short: "OPEN HAND AIMS · PINCH TO PLAY" }
          : { long: "CLICK A BEAM TO PLAY · DRAG TO STRUM · UP AND DOWN SWEEPS THE FILTER", short: "TAP A BEAM · DRAG TO STRUM" };

  const macroValues = [
    `${currentVoiceSpec.roman} ${currentVoiceSpec.name}`,
    `${currentLookSpec.code} ${currentLookSpec.name}`,
    `${currentModeSpec.rootNote} ${currentModeSpec.name.split(" ")[0]}`,
    bourdonDrone ? `ON (${currentModeSpec.rootNote}1)` : "OFF",
    loopPlaying ? "LOOPING" : "8.0S TAPE",
  ];

  return (
    <div
      className="stage-viewport"
      onWheel={(e) => {
        const s = stateRef.current;
        s.wristTwistNorm = Math.max(
          0,
          Math.min(1, s.wristTwistNorm + e.deltaX * 0.0015 + e.deltaY * 0.001)
        );
        audioEngine.setSpatialParameters(
          s.filterCutoffNorm,
          s.spaceWarp,
          s.wristTwistNorm,
          s.handBridgeNorm
        );
      }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const s = stateRef.current;
        s.pointerX = nx;
        s.pointerY = ny;

        const strIdx = Math.max(0, Math.min(7, Math.floor(nx * 8)));
        s.hoveredStringIndex = strIdx;

        if (!s.cameraActive) {
          // Up and down moves the theremin only while it is on. Left and right always move the warp
          if (s.thereminEnabled) {
            s.filterCutoffNorm = Math.max(
              0,
              Math.min(
                1,
                (THEREMIN_MIN_Y - ny) / (THEREMIN_MIN_Y - THEREMIN_MAX_Y)
              )
            );
          }
          s.spaceWarp = Math.max(
            0.1,
            Math.min(0.95, 0.25 + Math.abs(nx - 0.5) * 1.3)
          );
          audioEngine.setSpatialParameters(
            s.filterCutoffNorm,
            s.spaceWarp,
            s.wristTwistNorm,
            s.handBridgeNorm
          );
        }

        if (s.pointerDown && ny >= TOP_RIBBON_Y) {
          if (s.lastStrumString !== strIdx) {
            s.lastStrumString = strIdx;
            const hand: HandSide = strIdx < 4 ? "left" : "right";
            const finger = (strIdx % 4) as FingerIndex;
            if (s.rhythm !== "off" && s.quantizeMode !== "guide") {
              audioEngine.setArcadeHandsPresent(true);
              if (!catchGem(strIdx)) {
                externalTriggerRef.current?.(hand, finger);
              }
            } else {
              externalTriggerRef.current?.(hand, finger);
            }
          }
        }
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const s = stateRef.current;
        s.pointerX = nx;
        s.pointerY = ny;
        s.pointerDown = true;

        if (ny < TOP_RIBBON_Y) return;

        const strIdx = Math.max(0, Math.min(7, Math.floor(nx * 8)));
        s.lastStrumString = strIdx;
        const hand: HandSide = strIdx < 4 ? "left" : "right";
        const finger = (strIdx % 4) as FingerIndex;
        if (s.rhythm !== "off" && s.quantizeMode !== "guide") {
          audioEngine.setArcadeHandsPresent(true);
          if (catchGem(strIdx)) return;
        }
        externalTriggerRef.current?.(hand, finger);
      }}
      onPointerUp={() => {
        stateRef.current.pointerDown = false;
        stateRef.current.lastStrumString = -1;
      }}
    >
      <video ref={videoRef} playsInline muted style={{ display: "none" }} />
      <canvas ref={glCanvasRef} className="stage-canvas-gl" />
      <canvas ref={hudCanvasRef} className="stage-canvas-hud" />

      {/* The aluminum rail: keys M1–M5, which a hand also reaches through the ribbon at the top of the stage */}
      <div className="rail" onPointerDown={(e) => e.stopPropagation()}>
        {TOP_RIBBON_SLOTS.map((slot, idx) => {
          const isHovered = hud.slotHover === idx;
          const fillPct = isHovered ? Math.round(hud.holdProgress * 100) : 0;
          return (
            <button
              key={slot.code}
              type="button"
              className="rail-key"
              data-hovered={isHovered}
              style={{ ["--pip" as string]: MACRO_PIPS[idx] }}
              onClick={() =>
                onMacroGesture({
                  kind: slot.kind,
                  title: `${slot.code} // ${slot.label}`,
                  subtitle: "Switched via the aluminum rail",
                  slotIndex: idx,
                  timestamp: performance.now(),
                })
              }
            >
              <span className="rail-cap">
                <span className="rail-index">{slot.code}</span>
                <span className="rail-lamp" />
              </span>
              <span className="rail-face">
                <span className="rail-name">{RAIL_NAMES[idx]}</span>
                <span className="rail-readout">{macroValues[idx]}</span>
              </span>
              <span className="rail-dwell" aria-hidden="true">
                <i style={{ width: `${fillPct}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {lessonOpen ? (
        <div
          className="lesson"
          role="dialog"
          aria-labelledby="lesson-title"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="lesson-head">
            <span className="lesson-steps" aria-hidden="true">
              {LESSON_STEPS.map((step, i) => (
                <span
                  key={step.title}
                  className="lesson-step"
                  data-state={i < lessonStep ? "done" : i === lessonStep ? "now" : "next"}
                />
              ))}
            </span>
            <span>
              Lesson {lessonStep + 1} of {LESSON_STEPS.length}
            </span>
          </div>
          <div className="lesson-main">
            <div className="lesson-diagram" aria-hidden="true">
              <LessonDiagram step={lessonStep} />
            </div>
            <div>
              <h2 id="lesson-title" className="lesson-title">
                {LESSON_STEPS[lessonStep].title}
              </h2>
              <p className="lesson-body">{LESSON_STEPS[lessonStep].body}</p>
            </div>
          </div>
          <div className="lesson-actions">
            <button type="button" className="lesson-skip" onClick={closeLesson}>
              SKIP
            </button>
            <span className="lesson-nav">
              {lessonStep > 0 ? (
                <button
                  type="button"
                  className="ctrl-btn lesson-key"
                  onClick={() => setLessonStep((step) => step - 1)}
                >
                  BACK
                </button>
              ) : null}
              <button
                type="button"
                className="ctrl-btn ctrl-btn--dark lesson-key"
                onClick={() =>
                  lessonStep < LESSON_STEPS.length - 1
                    ? setLessonStep((step) => step + 1)
                    : closeLesson()
                }
              >
                {lessonStep < LESSON_STEPS.length - 1 ? "NEXT" : "START PLAYING"}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {/* Alerts above the bar, then the hint and the buttons: one column, so nothing overlaps when a row wraps */}
      <div className="stage-bottom">
        {cameraError || visionFailed ? (
          <div className="stage-alerts">
            {cameraError ? (
              <span className="hud-pill hud-pill--alert" role="alert">
                {cameraError}
              </span>
            ) : null}
            {visionFailed ? (
              <span className="hud-pill hud-pill--alert" role="alert">
                Hand tracking didn’t load. Mouse play still works.
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="stage-bottom-pills">
          <span className="hud-pill hud-hint">
            <span
              className="lamp"
              data-lit={hud.cameraActive ? "true" : "warn"}
            />
            {/* the short form on a narrow stage, so the bar stays under the white line */}
            <span className="hint-long">{hint.long}</span>
            <span className="hint-short">{hint.short}</span>
          </span>
          <div className="hud-actions">
            <button
              type="button"
              className="hud-pill hud-pill--btn"
              aria-keyshortcuts="?"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGestureGuide();
              }}
            >
              <span className="hint-long">GESTURE </span>GUIDE [?]
            </button>
            <button
              type="button"
              className="hud-pill hud-pill--quiet"
              onClick={(e) => {
                e.stopPropagation();
                setLessonStep(0);
                setLessonOpen(true);
              }}
              aria-keyshortcuts="W"
            >
              LESSON<span className="hint-long"> [W]</span>
            </button>
            {visionFailed ? null : (
              <span className="hud-pill">
                <span className="hint-long">
                  {landmarkerReady ? "1€ VISION // READY" : cameraRequested ? "INIT VISION…" : "1€ VISION // OFF"}
                </span>
                <span className="hint-short">
                  {landmarkerReady ? "VISION READY" : cameraRequested ? "VISION…" : "VISION OFF"}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {glUnavailable ? (
        <div className="stage-fallback" role="alert">
          This needs WebGL 2, which this browser doesn’t offer.
        </div>
      ) : null}
    </div>
  );
}
