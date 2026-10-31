/*
  Hand gestures: landmark smoothing, pinch detection and the macro ribbon.

  Landmarks arrive in stage coordinates (0..1, x mirrored). HandLandmarkSmoother filters them, and
  ChironomyGestureDetector reads one hand per call:
  - An open hand only aims. The index fingertip's x picks one of the 8 beams, and nothing sounds.
  - A pinch of the thumb and a fingertip plays. The thumb–index pinch plucks the beam under the fingertip;
    holding it while moving onto another beam strums that beam. Opening the fingers releases it.
  - Fingertip height is the theremin: 0 at THEREMIN_MIN_Y (the bottom) to 1 at THEREMIN_MAX_Y. It sweeps the
    filter cutoff from 220 Hz to about 9.8 kHz, the formant vowel (U, O, A, E, I) and the reverb.
  - Above TOP_RIBBON_Y sit five ribbon slots (M1–M5): voice, optics, scale, sub drone and tape loop. A pinch
    or a 380 ms dwell on a slot triggers it, and no beam sounds while the fingertip is in the ribbon.
  - A closed left fist holds the beat stutter while it is closed and, after 450 ms, toggles the drone.
*/

import type { FingerIndex, HandSide } from "./audio";

let pinchEnterThreshold = 0.52;

export function getPinchEnterThreshold(): number {
  return pinchEnterThreshold;
}

export function setPinchEnterThreshold(value: number) {
  pinchEnterThreshold = Math.max(0.22, Math.min(0.78, value));
  try {
    window.localStorage.setItem("manus.pinch", String(pinchEnterThreshold));
  } catch {
    /* private mode */
  }
}

export function loadPinchEnterThreshold() {
  try {
    const raw = window.localStorage.getItem("manus.pinch");
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n)) pinchEnterThreshold = Math.max(0.22, Math.min(0.78, n));
  } catch {
    /* private mode */
  }
}

export const TOP_RIBBON_Y = 0.172;
export const THEREMIN_MIN_Y = 0.94;
export const THEREMIN_MAX_Y = 0.186;

export class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.s = alpha * value + (1.0 - alpha) * this.s;
    this.y = value;
    return this.s;
  }

  public lastValue(): number {
    return this.y ?? 0;
  }

  public hasLast(): boolean {
    return this.y !== null;
  }
}

/** The 1€ filter: a low-pass whose cutoff rises with speed, so a still hand is steady and a fast one keeps up */
export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private x = new LowPassFilter();
  private dx = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(freq = 60, minCutoff = 1.4, beta = 0.045, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number): number {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  public filter(value: number, timestampSec: number): number {
    if (this.lastTime !== null && timestampSec > this.lastTime) {
      this.freq = 1.0 / Math.max(0.001, timestampSec - this.lastTime);
    }
    this.lastTime = timestampSec;

    const dValue = this.x.hasLast()
      ? (value - this.x.lastValue()) * this.freq
      : 0.0;
    const edValue = this.dx.filter(dValue, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.x.filter(value, this.alpha(cutoff));
  }
}

export class HandLandmarkSmoother {
  private filters: {
    x: OneEuroFilter;
    y: OneEuroFilter;
    z: OneEuroFilter;
  }[][] = [[], []];

  constructor() {
    for (let h = 0; h < 2; h++) {
      for (let i = 0; i < 21; i++) {
        this.filters[h].push({
          x: new OneEuroFilter(60, 1.5, 0.05, 1.0),
          y: new OneEuroFilter(60, 1.5, 0.05, 1.0),
          z: new OneEuroFilter(60, 1.2, 0.03, 1.0),
        });
      }
    }
  }

  public smooth(
    handIdx: number,
    landmarks: { x: number; y: number; z: number }[],
    tSec: number
  ): { x: number; y: number; z: number }[] {
    const bank = this.filters[handIdx % 2];
    return landmarks.map((lm, i) => {
      const f = bank[i];
      if (!f) return lm;
      return {
        x: f.x.filter(lm.x, tSec),
        y: f.y.filter(lm.y, tSec),
        z: f.z.filter(lm.z, tSec),
      };
    });
  }
}

export type MacroGestureKind =
  | "RIBBON_VOICE"
  | "RIBBON_SHADER"
  | "RIBBON_MODE"
  | "RIBBON_DRONE"
  | "RIBBON_LOOP"
  | "FIST_DRONE_LOCK";

export interface MacroGestureEvent {
  kind: MacroGestureKind;
  title: string;
  subtitle: string;
  slotIndex?: number;
  timestamp: number;
}

export interface PluckTrigger {
  hand: HandSide;
  finger: FingerIndex;
  stringIndex: number; // 0..7
  x: number;
  y: number;
  velocity: number;
  reason: "PINCH_PLUCK" | "PINCH_STRUM" | "GLIDE_STRUM";
}

export interface HandPoseMetrics {
  palmX: number;
  palmY: number;
  indexTipX: number;
  indexTipY: number;
  spreadNorm: number;
  elevationNorm: number;
  wristRollNorm: number;
  pinchProximityNorm: number; // 0..1, 1 when pinched
  pinchDistance: number; // thumb–index distance in palm units, smaller is tighter
  isIndexPinched: boolean;
  activeFingerPinch: FingerIndex | null;
  hoveredStringIndex: number; // 0..7
  ribbonSlotHover: number;    // -1 or 0..4
  ribbonHoldProgress: number; // 0..1
  fistProgress: number;       // 0..1
}

/**
 * The mean spread, height and wrist roll across the hands in view: what the warp, the theremin and the filter Q
 * follow. One hand gives its own values. Null when no hand is in view.
 */
export function averageHandPose(
  poses: Pick<HandPoseMetrics, "spreadNorm" | "elevationNorm" | "wristRollNorm">[]
): { spread: number; elevation: number; wristRoll: number } | null {
  if (!poses.length) return null;
  let spread = 0;
  let elevation = 0;
  let wristRoll = 0;
  for (const p of poses) {
    spread += p.spreadNorm;
    elevation += p.elevationNorm;
    wristRoll += p.wristRollNorm;
  }
  return {
    spread: spread / poses.length,
    elevation: elevation / poses.length,
    wristRoll: wristRoll / poses.length,
  };
}

interface PerHandState {
  latchedFinger: FingerIndex | null;
  lastPluckMs: number;
  lastHoveredString: number;
  lastPinchStrumString: number;
  ribbonSlot: number;
  ribbonEnterMs: number;
  fistEnterMs: number;
  lastMacroMs: number;
}

const FINGER_TIP_INDICES: [number, number, number, number] = [8, 12, 16, 20];

export const TOP_RIBBON_SLOTS = [
  { index: 0, code: "M1", label: "VOICE NEXT", kind: "RIBBON_VOICE" as const },
  { index: 1, code: "M2", label: "OPTIC FX", kind: "RIBBON_SHADER" as const },
  { index: 2, code: "M3", label: "SCALE MODE", kind: "RIBBON_MODE" as const },
  { index: 3, code: "M4", label: "SUB DRONE", kind: "RIBBON_DRONE" as const },
  { index: 4, code: "M5", label: "TAPE LOOP", kind: "RIBBON_LOOP" as const },
];

export class ChironomyGestureDetector {
  private state: Record<HandSide, PerHandState> = {
    left: {
      latchedFinger: null,
      lastPluckMs: 0,
      lastHoveredString: -1,
      lastPinchStrumString: -1,
      ribbonSlot: -1,
      ribbonEnterMs: 0,
      fistEnterMs: 0,
      lastMacroMs: 0,
    },
    right: {
      latchedFinger: null,
      lastPluckMs: 0,
      lastHoveredString: -1,
      lastPinchStrumString: -1,
      ribbonSlot: -1,
      ribbonEnterMs: 0,
      fistEnterMs: 0,
      lastMacroMs: 0,
    },
  };

  public evaluateHand(
    lm: { x: number; y: number; z: number }[],
    side: HandSide,
    nowMs: number,
    isCameraLive: boolean,
    glideStrumEnabled = false
  ): {
    metrics: HandPoseMetrics;
    pluck: PluckTrigger | null;
    macroEvent: MacroGestureEvent | null;
  } {
    const st = this.state[side];

    const palmX = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
    const palmY = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;

    const handScale = Math.max(
      0.065,
      Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y)
    );

    const knuckleDx = lm[17].x - lm[5].x;
    const knuckleDy = lm[17].y - lm[5].y;
    const rawAngle = Math.atan2(knuckleDy, Math.abs(knuckleDx) + 0.001);
    const wristRollNorm = Math.max(0, Math.min(1, 0.5 + rawAngle * 0.9));

    const tips = [lm[4], lm[8], lm[12], lm[16], lm[20]];
    const avgTipToPalm =
      tips.reduce((acc, t) => acc + Math.hypot(t.x - palmX, t.y - palmY), 0) /
      (5 * handScale);
    const spreadNorm = Math.max(0, Math.min(1, (avgTipToPalm - 0.55) / 1.15));

    const indexTipX = lm[8].x;
    const indexTipY = lm[8].y;

    const elevationNorm = Math.max(
      0,
      Math.min(
        1,
        (THEREMIN_MIN_Y - indexTipY) / (THEREMIN_MIN_Y - THEREMIN_MAX_Y)
      )
    );

    const hoveredStringIndex = Math.max(
      0,
      Math.min(7, Math.floor(indexTipX * 8))
    );

    const thumb = lm[4];
    const normDists = FINGER_TIP_INDICES.map(
      (idx) => Math.hypot(lm[idx].x - thumb.x, lm[idx].y - thumb.y) / handScale
    );
    const pinchProximityNorm = Math.max(
      0,
      Math.min(1, 1.0 - (normDists[0] - 0.34) / 0.6)
    );

    // Macro ribbon: above `TOP_RIBBON_Y`, the index fingertip's x from 0.02 to 0.98 selects one of five slots (M1–M5)
    let ribbonSlotHover = -1;
    let ribbonHoldProgress = 0;
    let macroEvent: MacroGestureEvent | null = null;

    if (
      isCameraLive &&
      indexTipY < TOP_RIBBON_Y &&
      indexTipX > 0.02 &&
      indexTipX < 0.98
    ) {
      const slot = Math.max(
        0,
        Math.min(4, Math.floor(((indexTipX - 0.02) / 0.96) * 5))
      );
      ribbonSlotHover = slot;
      if (st.ribbonSlot !== slot) {
        st.ribbonSlot = slot;
        st.ribbonEnterMs = nowMs;
      }
      // A pinch inside a slot triggers it at once; otherwise the fingertip has to stay in it for 380 ms
      const pinchedInRibbon = normDists[0] < 0.42;
      ribbonHoldProgress = pinchedInRibbon
        ? 1.0
        : Math.min(1, (nowMs - st.ribbonEnterMs) / 380);

      if (ribbonHoldProgress >= 1 && nowMs - st.lastMacroMs > 750) {
        st.lastMacroMs = nowMs;
        st.ribbonEnterMs = nowMs + 480;
        const spec = TOP_RIBBON_SLOTS[slot];
        macroEvent = {
          kind: spec.kind,
          title: `${spec.code} // ${spec.label}`,
          subtitle: "Triggered via Top Macro Bar",
          slotIndex: slot,
          timestamp: nowMs,
        };
      }

      st.lastHoveredString = -1;
      st.latchedFinger = null;
      return {
        metrics: {
          palmX,
          palmY,
          indexTipX,
          indexTipY,
          spreadNorm,
          elevationNorm: 1.0,
          wristRollNorm,
          pinchProximityNorm,
          pinchDistance: normDists[0] ?? 1,
          isIndexPinched: pinchedInRibbon,
          activeFingerPinch: null,
          hoveredStringIndex,
          ribbonSlotHover,
          ribbonHoldProgress,
          fistProgress: 0,
        },
        pluck: null,
        macroEvent,
      };
    } else {
      st.ribbonSlot = -1;
      st.ribbonEnterMs = 0;
    }

    // Closed left fist (every fingertip within 0.58 palm units of the palm centre). fistProgress fills over 450 ms,
    // when the drone event fires. The stage holds the stutter from 0.25 on
    const fingerTips4 = [lm[8], lm[12], lm[16], lm[20]];
    const maxFingerToPalm =
      Math.max(
        ...fingerTips4.map((t) => Math.hypot(t.x - palmX, t.y - palmY))
      ) / handScale;
    const isFist = isCameraLive && side === "left" && maxFingerToPalm < 0.58;
    let fistProgress = 0;
    if (isFist) {
      if (st.fistEnterMs === 0) st.fistEnterMs = nowMs;
      fistProgress = Math.min(1, (nowMs - st.fistEnterMs) / 450);
      if (fistProgress >= 1 && nowMs - st.lastMacroMs > 1000) {
        st.lastMacroMs = nowMs;
        st.fistEnterMs = nowMs + 700;
        macroEvent = {
          kind: "FIST_DRONE_LOCK",
          title: "LEFT FIST // BEAT STUTTER & DRONE",
          subtitle: "Engaged Stutter Repeat & Sub Drone",
          timestamp: nowMs,
        };
      }
      return {
        metrics: {
          palmX,
          palmY,
          indexTipX,
          indexTipY,
          spreadNorm,
          elevationNorm,
          wristRollNorm,
          pinchProximityNorm: 0,
          pinchDistance: 1,
          isIndexPinched: false,
          activeFingerPinch: null,
          hoveredStringIndex,
          ribbonSlotHover: -1,
          ribbonHoldProgress: 0,
          fistProgress,
        },
        pluck: null,
        macroEvent,
      };
    } else {
      st.fistEnterMs = 0;
    }

    let pluck: PluckTrigger | null = null;

    // Pinch: the fingertip closest to the thumb wins. An open hand moving across beams plays nothing unless
    // glideStrumEnabled is on
    let bestFinger: FingerIndex = 0;
    let bestDist = normDists[0];
    let secondBestDist = 999;

    for (let f = 1; f < 4; f++) {
      const d = normDists[f];
      if (d < bestDist) {
        secondBestDist = bestDist;
        bestDist = d;
        bestFinger = f as FingerIndex;
      } else if (d < secondBestDist) {
        secondBestDist = d;
      }
    }

    const pinchEnter = isCameraLive
      ? bestFinger === 0
        ? pinchEnterThreshold
        : Math.min(0.48, pinchEnterThreshold - 0.08)
      : 0.18;
    const pinchRelease = isCameraLive ? 0.54 : 0.28;
    const clearlyIsolated =
      bestFinger === 0 || secondBestDist > bestDist * 1.15;

    if (st.latchedFinger === null) {
      // No pinch held: a new pinch plucks
      if (
        bestDist < pinchEnter &&
        clearlyIsolated &&
        nowMs - st.lastPluckMs > 110
      ) {
        st.latchedFinger = bestFinger;
        st.lastPluckMs = nowMs;
        st.lastPinchStrumString = hoveredStringIndex;

        const tip = lm[FINGER_TIP_INDICES[bestFinger]];
        const resolvedHand: HandSide =
          bestFinger === 0
            ? hoveredStringIndex < 4
              ? "left"
              : "right"
            : side;
        const resolvedFinger: FingerIndex =
          bestFinger === 0
            ? ((hoveredStringIndex % 4) as FingerIndex)
            : bestFinger;
        const resolvedString =
          resolvedHand === "left" ? resolvedFinger : 4 + resolvedFinger;

        pluck = {
          hand: resolvedHand,
          finger: resolvedFinger,
          stringIndex: resolvedString,
          x: (tip.x + thumb.x) * 0.5,
          y: (tip.y + thumb.y) * 0.5,
          velocity: 0.96,
          reason: "PINCH_PLUCK",
        };
      } else if (
        isCameraLive &&
        glideStrumEnabled &&
        st.lastHoveredString !== -1 &&
        hoveredStringIndex !== st.lastHoveredString &&
        nowMs - st.lastPluckMs > 90
      ) {
        // Glide strum: moving onto another beam plucks it with no pinch
        st.lastHoveredString = hoveredStringIndex;
        st.lastPluckMs = nowMs;
        const resolvedHand: HandSide =
          hoveredStringIndex < 4 ? "left" : "right";
        const resolvedFinger = (hoveredStringIndex % 4) as FingerIndex;
        pluck = {
          hand: resolvedHand,
          finger: resolvedFinger,
          stringIndex: hoveredStringIndex,
          x: indexTipX,
          y: indexTipY,
          velocity: 0.86,
          reason: "GLIDE_STRUM",
        };
      }
    } else {
      // A pinch is held
      const currentDist = normDists[st.latchedFinger];
      if (currentDist > pinchRelease) {
        // Fingers opened: release the latch, with no note
        st.latchedFinger = null;
        st.lastPinchStrumString = -1;
      } else if (
        st.latchedFinger === 0 &&
        hoveredStringIndex !== st.lastPinchStrumString &&
        nowMs - st.lastPluckMs > 85
      ) {
        // Thumb–index pinch held while moving onto another beam: strum it
        st.lastPinchStrumString = hoveredStringIndex;
        st.lastPluckMs = nowMs;
        const resolvedHand: HandSide =
          hoveredStringIndex < 4 ? "left" : "right";
        const resolvedFinger = (hoveredStringIndex % 4) as FingerIndex;
        const tip = lm[8];
        pluck = {
          hand: resolvedHand,
          finger: resolvedFinger,
          stringIndex: hoveredStringIndex,
          x: (tip.x + thumb.x) * 0.5,
          y: (tip.y + thumb.y) * 0.5,
          velocity: 0.9,
          reason: "PINCH_STRUM",
        };
      }
    }

    st.lastHoveredString = hoveredStringIndex;

    return {
      metrics: {
        palmX,
        palmY,
        indexTipX,
        indexTipY,
        spreadNorm,
        elevationNorm,
        wristRollNorm,
        pinchProximityNorm,
        pinchDistance: normDists[0] ?? 1,
        isIndexPinched: st.latchedFinger !== null,
        activeFingerPinch: st.latchedFinger,
        hoveredStringIndex,
        ribbonSlotHover: -1,
        ribbonHoldProgress: 0,
        fistProgress: 0,
      },
      pluck,
      macroEvent,
    };
  }
}
