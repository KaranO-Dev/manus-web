/*
  Hand gestures: landmark smoothing, which hand is which, pinch detection and the macro ribbon.

  Landmarks arrive in stage coordinates (0..1, x mirrored). HandSlots keeps each hand in its own slot from one
  frame to the next, HandLandmarkSmoother filters a slot's landmarks, and ChironomyGestureDetector reads one
  hand per call:
  - An open hand only aims. The index fingertip's x picks one of the 8 beams, and nothing sounds.
  - A pinch of the thumb and a fingertip plays. The thumb–index pinch plucks the beam under the fingertip;
    holding it while moving onto another beam strums that beam. Opening the fingers releases it. A sweep
    plays every beam it reaches as it reaches it; only going straight back to the beam just left waits 85 ms.
  - The pinch is read from the unsmoothed fingertips, so a note starts on the frame the fingers close. The
    smoothed landmarks give the rest: where the hand is, how big it is, which beam it is on.
  - A finger plays again once it has opened. Opened past the release distance, which sits above the trigger
    by more than the tracker's noise, it plays as early as the first time. Opened only part of the way, it
    plays when it touches the thumb again.
  - While a pinch is held, rolling the thumb onto another finger plays that finger's note, once the first
    finger has let go of the thumb. A finger that joins the pinch beside the first plays nothing; if the
    first one then lifts away, the pinch carries on with the finger that stayed, without a note. Only the
    index pinch strums.
  - The tracker's one-frame mistakes play nothing: a finger counts as open on two results in a row, a
    fingertip that jumps onto the thumb within one result waits for the next, and a pinch made outside the
    stage is never played.
  - A hand that has just come into view plays nothing for SETTLE_MS, and fingers it arrives with closed have
    to open first.
  - Fingertip height is the theremin: 0 at THEREMIN_MIN_Y (the bottom) to 1 at THEREMIN_MAX_Y. It sweeps the
    filter cutoff from 220 Hz to about 9.8 kHz, the formant vowel (U, O, A, E, I) and the reverb.
  - Above TOP_RIBBON_Y sit five ribbon slots (M1–M5): voice, optics, scale, sub drone and tape loop. A pinch
    or a 380 ms dwell on a slot triggers it. No beam sounds while the fingertip is in the ribbon, or on the
    way out of it with the fingers still closed. A hand holding a pinch has to go a little further up before
    the ribbon takes it, so a strum that tops out on the ribbon's edge carries on.
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

  public reset() {
    this.y = null;
    this.s = null;
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

  constructor(freq = 60, minCutoff = 1.0, beta = 20, dCutoff = 2.0) {
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

  /** Forget the signal so far: the next value passes through as it is */
  public reset() {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

/*
  Filter settings, measured on a recording of two hands playing (615 frames at 30 fps, replayed by
  tests/unit/replay.spec.ts). Positions are in stage units, so beta multiplies a speed in stage widths a second.
  With (1.0, 20, 2.0) a fingertip at rest moves 0.44 px on a 1280 px stage and a moving one trails the hand by
  about 20 ms. The settings before, (1.5, 0.05, 1.0), gave 0.49 px and 84 ms: that beta was too small for these
  units to ever open the filter up.
*/
const XY_FILTER = [1.0, 20, 2.0] as const;
const Z_FILTER = [1.0, 8, 2.0] as const;

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
          x: new OneEuroFilter(60, ...XY_FILTER),
          y: new OneEuroFilter(60, ...XY_FILTER),
          z: new OneEuroFilter(60, ...Z_FILTER),
        });
      }
    }
  }

  public smooth(
    slot: number,
    landmarks: { x: number; y: number; z: number }[],
    tSec: number
  ): { x: number; y: number; z: number }[] {
    const bank = this.filters[slot % 2];
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

  /** Start a slot's filters over, for a new hand or one that was out of view: it must not glide in from where the last one was */
  public reset(slot: number) {
    for (const f of this.filters[slot % 2]) {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    }
  }
}

export interface SlotAssignment {
  slot: 0 | 1;
  side: HandSide;
  /** Not the hand this slot held last: its filters and gesture state start over */
  fresh: boolean;
  /** Milliseconds since the slot last held a hand; Infinity when it never did */
  gapMs: number;
}

const SLOT_MEMORY_MS = 500; // a hand lost for less than this gets its slot back…
const SLOT_REACH = 0.3; // …if it returns within this distance of where it was, in stage units
const SIDE_MARGIN = 0.03; // a hand changes side only once its wrist is this far past the centre

/**
 * Which hand is which. The tracker returns hands in no fixed order, and the side of the stage a hand is on
 * changes as it moves, so neither can carry a hand's filters or its held pinch. Each hand keeps one of two
 * slots for as long as it stays in view, matched from frame to frame by where its wrist was.
 */
export class HandSlots {
  private seen: { x: number; y: number; ms: number; side: HandSide }[] = [
    { x: 0, y: 0, ms: -Infinity, side: "left" },
    { x: 0, y: 0, ms: -Infinity, side: "right" },
  ];

  public clear() {
    for (const s of this.seen) s.ms = -Infinity;
  }

  /** One assignment per wrist, in the order given. Two hands at most */
  public assign(
    wrists: { x: number; y: number }[],
    nowMs: number
  ): SlotAssignment[] {
    const n = Math.min(2, wrists.length);
    if (n === 0) return [];

    const far = (w: { x: number; y: number }, slot: number) => {
      const s = this.seen[slot];
      return nowMs - s.ms <= SLOT_MEMORY_MS
        ? Math.hypot(w.x - s.x, w.y - s.y)
        : Infinity;
    };

    let slots: (0 | 1)[];
    if (n === 1) {
      const d0 = far(wrists[0], 0);
      const d1 = far(wrists[0], 1);
      if (Math.min(d0, d1) <= SLOT_REACH) {
        slots = [d0 <= d1 ? 0 : 1];
      } else {
        // A new hand takes the slot of its side, unless that one's hand was here a moment ago and the other is free
        const want = wrists[0].x < 0.5 ? 0 : 1;
        const other = want === 0 ? 1 : 0;
        const wantBusy = far(wrists[0], want) !== Infinity;
        const otherBusy = far(wrists[0], other) !== Infinity;
        slots = [wantBusy && !otherBusy ? other : want];
      }
    } else {
      // Two hands: whichever pairing moves them less. A slot with no hand to remember costs the full reach
      const cost = (d: number) => Math.min(d, SLOT_REACH);
      const straight = cost(far(wrists[0], 0)) + cost(far(wrists[1], 1));
      const crossed = cost(far(wrists[0], 1)) + cost(far(wrists[1], 0));
      if (straight < crossed) slots = [0, 1];
      else if (crossed < straight) slots = [1, 0];
      else slots = wrists[0].x <= wrists[1].x ? [0, 1] : [1, 0];
    }

    const out: SlotAssignment[] = [];
    for (let i = 0; i < n; i++) {
      const slot = slots[i];
      const w = wrists[i];
      const s = this.seen[slot];
      const fresh = far(w, slot) > SLOT_REACH;
      let side = s.side;
      if (fresh) side = w.x < 0.5 ? "left" : "right";
      else if (side === "left" && w.x > 0.5 + SIDE_MARGIN) side = "right";
      else if (side === "right" && w.x < 0.5 - SIDE_MARGIN) side = "left";
      out.push({ slot, side, fresh, gapMs: nowMs - s.ms });
    }
    for (let i = 0; i < n; i++) {
      const s = this.seen[slots[i]];
      s.x = wrists[i].x;
      s.y = wrists[i].y;
      s.ms = nowMs;
      s.side = out[i].side;
    }
    return out;
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

/** A finger's readiness to play. SHUT: not until it opens. AJAR: when it touches the thumb. OPEN: at the trigger distance */
const SHUT = 0;
const AJAR = 1;
const OPEN = 2;

interface PerHandState {
  latchedFinger: FingerIndex | null;
  /** The held pinch has been on the index finger, so dragging it onto another beam strums */
  strum: boolean;
  /** Per finger: how far it has opened since it last played or joined a pinch (SHUT, AJAR or OPEN) */
  armed: [number, number, number, number];
  /** The thumb–fingertip distances of the result before this one; null for a hand's first */
  lastDists: number[] | null;
  lastPluckMs: number;
  lastHoveredString: number;
  /** The beam the fingertip is on, held until the fingertip is clearly on the next one; -1 before the first reading */
  hoverString: number;
  lastPinchStrumString: number;
  /** The beam the strum was on before that one: the only beam it cannot play straight away */
  strumCameFrom: number;
  ribbonSlot: number;
  ribbonEnterMs: number;
  fistEnterMs: number;
  lastMacroMs: number;
  appearedMs: number;
  lastSeenMs: number;
}

function newHandState(): PerHandState {
  return {
    latchedFinger: null,
    strum: false,
    armed: [OPEN, OPEN, OPEN, OPEN],
    lastDists: null,
    lastPluckMs: 0,
    lastHoveredString: -1,
    hoverString: -1,
    lastPinchStrumString: -1,
    strumCameFrom: -1,
    ribbonSlot: -1,
    ribbonEnterMs: 0,
    fistEnterMs: 0,
    lastMacroMs: 0,
    appearedMs: -Infinity,
    lastSeenMs: -Infinity,
  };
}

/** A hand that comes into view plays nothing for this long: the tracker's first frames of a hand are its worst */
export const SETTLE_MS = 120;
/** A slot not seen for this long holds a new hand, whatever its place: no pinch is carried over */
const STALE_MS = 400;
/**
 * How far above the trigger a finger has to open before it can play again, in palm units. The thumb–fingertip
 * distance of a still hand wobbles by 0.015 (one standard deviation) in the recording, so this is 5 of those.
 */
const RELEASE_MARGIN = 0.08;
/** A fingertip this close to the thumb is touching it; the trigger distances are wider, to play early */
const CONTACT = 0.24;
/**
 * A finger that has played and then opened this far past touching, without reaching the release distance, plays
 * again when it touches: quick repeats rarely open all the way. 11 times the still hand's wobble.
 */
const AJAR_MARGIN = 0.16;
/**
 * No finger closes this far onto the thumb between two results: the fastest pinch in the recording closes 0.16
 * at 30 results a second, and the tracker's jumps start at 0.42. Such a pinch waits for the next result.
 */
const JUMP = 0.35;
/**
 * How far into the ribbon a held pinch has to go before the ribbon takes it, in stage heights: six times a still
 * fingertip's wobble (0.0019). In the recording a strum tops out 0.003 inside the ribbon; a reach for a slot
 * goes 0.03 to 0.08 in.
 */
const RIBBON_DEPTH = 0.012;
/** The fingertip has to be this far onto the next beam, in stage widths, before it counts as there */
const HOVER_MARGIN = 0.004;

const FINGER_TIP_INDICES: [number, number, number, number] = [8, 12, 16, 20];

/** Inside the stage. The tracker guesses the landmarks it places outside the picture */
const onStage = (p: { x: number; y: number }) =>
  p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

export const TOP_RIBBON_SLOTS = [
  { index: 0, code: "M1", label: "VOICE NEXT", kind: "RIBBON_VOICE" as const },
  { index: 1, code: "M2", label: "OPTIC FX", kind: "RIBBON_SHADER" as const },
  { index: 2, code: "M3", label: "SCALE MODE", kind: "RIBBON_MODE" as const },
  { index: 3, code: "M4", label: "SUB DRONE", kind: "RIBBON_DRONE" as const },
  { index: 4, code: "M5", label: "TAPE LOOP", kind: "RIBBON_LOOP" as const },
];

export class ChironomyGestureDetector {
  private state: PerHandState[] = [newHandState(), newHandState()];

  /**
   * One hand, one frame. `opts.slot` is the hand's slot from HandSlots (a simulated hand has none, and gets the
   * slot of its side), `opts.fast` the same landmarks unsmoothed, and `opts.fresh` says the slot has a new hand.
   */
  public evaluateHand(
    lm: { x: number; y: number; z: number }[],
    side: HandSide,
    nowMs: number,
    isCameraLive: boolean,
    glideStrumEnabled = false,
    opts?: {
      slot?: number;
      fast?: { x: number; y: number; z: number }[];
      fresh?: boolean;
    }
  ): {
    metrics: HandPoseMetrics;
    pluck: PluckTrigger | null;
    macroEvent: MacroGestureEvent | null;
  } {
    const slot = (opts?.slot ?? (side === "left" ? 0 : 1)) % 2;
    let st = this.state[slot];
    if (isCameraLive && (opts?.fresh || nowMs - st.lastSeenMs > STALE_MS)) {
      // A new hand: nothing held, nothing hovered. The cooldowns stay, so a hand flickering in and out cannot machine-gun
      const { lastPluckMs, lastMacroMs } = st;
      st = this.state[slot] = { ...newHandState(), lastPluckMs, lastMacroMs, appearedMs: nowMs };
    }
    st.lastSeenMs = nowMs;
    const settling = isCameraLive && nowMs - st.appearedMs < SETTLE_MS;

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

    let hoveredStringIndex = Math.max(
      0,
      Math.min(7, Math.floor(indexTipX * 8))
    );
    if (isCameraLive && st.hoverString >= 0 && hoveredStringIndex !== st.hoverString) {
      // On the line between two beams the fingertip stays on the one it was on
      const lo = st.hoverString / 8 - HOVER_MARGIN;
      const hi = (st.hoverString + 1) / 8 + HOVER_MARGIN;
      if (indexTipX >= lo && indexTipX < hi) hoveredStringIndex = st.hoverString;
    }
    st.hoverString = hoveredStringIndex;

    // The pinch comes from the unsmoothed fingertips when the caller has them, over the smoothed hand's size
    const thumb = lm[4];
    const quick = opts?.fast ?? lm;
    const quickThumb = quick[4];
    const normDists = FINGER_TIP_INDICES.map(
      (idx) =>
        Math.hypot(quick[idx].x - quickThumb.x, quick[idx].y - quickThumb.y) /
        handScale
    );
    const enterOf = (f: number) =>
      isCameraLive
        ? f === 0
          ? pinchEnterThreshold
          : Math.min(0.48, pinchEnterThreshold - 0.08)
        : 0.18;
    const releaseOf = (f: number) =>
      isCameraLive ? Math.max(0.54, enterOf(f) + RELEASE_MARGIN) : 0.28;
    const contactOf = (f: number) => Math.min(CONTACT, enterOf(f) * 0.6);
    // The camera's distances count as open only on two results in a row: the tracker throws a hand wide open for
    // one frame now and then
    const before = isCameraLive ? st.lastDists : null;
    st.lastDists = normDists;
    const openDists = before
      ? normDists.map((d, f) => Math.min(d, before[f]))
      : normDists;
    // What is closed now has to open before it plays: used wherever a hand must stay silent
    const holdFire = () => {
      st.latchedFinger = null;
      st.strum = false;
      st.lastPinchStrumString = -1;
      st.strumCameFrom = -1;
      for (let f = 0; f < 4; f++) {
        st.armed[f] = normDists[f] >= enterOf(f) ? OPEN : SHUT;
      }
    };
    const pinchProximityNorm = Math.max(
      0,
      Math.min(1, 1.0 - (normDists[0] - 0.34) / 0.6)
    );

    // Macro ribbon: above `TOP_RIBBON_Y`, the index fingertip's x from 0.02 to 0.98 selects one of five slots (M1–M5)
    let ribbonSlotHover = -1;
    let ribbonHoldProgress = 0;
    let macroEvent: MacroGestureEvent | null = null;

    // A hand holding a pinch is playing the beams, and a strum that tops out on the ribbon's edge must not
    // change the voice: for that hand the ribbon starts RIBBON_DEPTH further up
    const ribbonEdge =
      st.latchedFinger !== null ? TOP_RIBBON_Y - RIBBON_DEPTH : TOP_RIBBON_Y;
    if (
      isCameraLive &&
      indexTipY < ribbonEdge &&
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
      const pinchedInRibbon = !settling && normDists[0] < 0.42;
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
      holdFire();
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
      holdFire();
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

    const clearlyIsolated =
      bestFinger === 0 || secondBestDist > bestDist * 1.15;

    if (settling) {
      holdFire();
    } else {
      // A finger that has opened can play again: at the trigger distance if it opened all the way, on touching
      // the thumb if it opened part of the way
      for (let f = 0; f < 4; f++) {
        if (openDists[f] > releaseOf(f)) st.armed[f] = OPEN;
        else if (
          isCameraLive &&
          st.armed[f] === SHUT &&
          openDists[f] > contactOf(f) + AJAR_MARGIN
        ) {
          st.armed[f] = AJAR;
        }
      }

      if (
        st.latchedFinger !== null &&
        openDists[st.latchedFinger] > releaseOf(st.latchedFinger)
      ) {
        if (
          isCameraLive &&
          clearlyIsolated &&
          bestDist < contactOf(bestFinger)
        ) {
          // The thumb slid onto another fingertip: the same pinch, held by that finger now, with no note
          st.latchedFinger = bestFinger;
          st.armed[bestFinger] = SHUT;
          // Only the index pinch strums: it starts from the beam it lands on, and stops when the thumb leaves it
          st.strum = bestFinger === 0;
          st.lastPinchStrumString = st.strum ? hoveredStringIndex : -1;
          st.strumCameFrom = -1;
        } else {
          // Fingers opened: release the latch, with no note
          st.latchedFinger = null;
          st.strum = false;
          st.lastPinchStrumString = -1;
          st.strumCameFrom = -1;
        }
      }

      // The nearest finger closes a pinch when it is free to play and the tracker can be believed: both tips
      // on the stage, and no jump onto the thumb since the last result
      const tipIndex = FINGER_TIP_INDICES[bestFinger];
      const wants =
        clearlyIsolated &&
        (st.armed[bestFinger] === OPEN
          ? bestDist < enterOf(bestFinger)
          : st.armed[bestFinger] === AJAR && bestDist < contactOf(bestFinger));
      const inView =
        !isCameraLive || (onStage(quick[tipIndex]) && onStage(quickThumb));
      // A pinch made off the stage is spent: it does not sound later, when the hand happens to come onto it
      if (wants && !inView) st.armed[bestFinger] = SHUT;
      const closes =
        wants &&
        inView &&
        nowMs - st.lastPluckMs > 110 &&
        !(isCameraLive && before && before[bestFinger] - bestDist > JUMP);

      // While a pinch is held, another finger takes it over, with its own note, only once the finger holding
      // it has let go of the thumb: rolling from finger to finger plays each one, adding a finger plays nothing
      const free =
        st.latchedFinger === null ||
        st.latchedFinger === bestFinger ||
        (isCameraLive &&
          normDists[st.latchedFinger] > contactOf(st.latchedFinger));

      if (closes && free) {
        // A new pinch plucks. So does the held one, when its finger opened part of the way and touched again
        st.latchedFinger = bestFinger;
        st.strum = bestFinger === 0;
        st.armed[bestFinger] = SHUT;
        st.lastPluckMs = nowMs;
        st.lastPinchStrumString = hoveredStringIndex;
        st.strumCameFrom = -1;

        const tip = lm[tipIndex];
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
      } else if (st.latchedFinger === null) {
        if (
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
        // A pinch is held. Another finger that touches the thumb beside it has joined it, and plays only after
        // it has opened; one that only comes near has to touch to play
        if (isCameraLive) {
          for (let f = 0; f < 4; f++) {
            if (f === st.latchedFinger) continue;
            if (normDists[f] < contactOf(f)) st.armed[f] = SHUT;
            else if (normDists[f] < enterOf(f) && st.armed[f] === OPEN) {
              st.armed[f] = AJAR;
            }
          }
        }
        if (
          st.strum &&
          hoveredStringIndex !== st.lastPinchStrumString &&
          (hoveredStringIndex !== st.strumCameFrom || nowMs - st.lastPluckMs > 85)
        ) {
          // An index pinch held while moving onto another beam: strum it. A sweep plays every beam it reaches
          // as it reaches it; only going straight back to the beam it just left has to wait
          st.strumCameFrom = st.lastPinchStrumString;
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
