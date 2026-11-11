import { expect, test } from "@playwright/test";
import type { HandSide } from "../../lib/audio";
import { WHOLE } from "../../lib/camera-fit";
import { ChironomyGestureDetector, HandSlots, SETTLE_MS, setPinchEnterThreshold } from "../../lib/gestures";
import { HandPipeline } from "../../lib/hand-pipeline";

/*
  Runs in Node, with no browser: made-up hands through the same gesture code the stage uses, one tracker result
  at a time. Distances are in palm lengths, as the detector measures them. At the default setting the index
  finger plucks under 0.52 and lets go over 0.60; a finger counts as touching the thumb under 0.24, and as
  part-open over 0.40. The recording in replay.spec.ts checks the same rules against real hands.
*/

const PALM = 0.15;
const OPEN_HAND = [1.0, 1.1, 1.2, 1.3];
const STEP_MS = 33; // the tracker at 30 results a second

/**
 * A hand with the index fingertip at (x, y) and each fingertip the given number of palm lengths from the thumb:
 * the index first, then the middle, ring and little fingers
 */
function hand(x: number, y: number, d = OPEN_HAND) {
  const lm = Array.from({ length: 21 }, () => ({ x, y: y + PALM, z: 0 }));
  lm[0] = { x, y: y + 2 * PALM, z: 0 }; // the wrist, one palm length under the knuckles
  const thumb = { x, y: y + d[0] * PALM, z: 0 };
  lm[4] = thumb;
  lm[8] = { x, y, z: 0 };
  [12, 16, 20].forEach((tip, i) => {
    const a = ((60 - i * 20) * Math.PI) / 180;
    lm[tip] = { x: thumb.x + d[i + 1] * PALM * Math.cos(a), y: thumb.y - d[i + 1] * PALM * Math.sin(a), z: 0 };
  });
  return lm;
}

/** One hand in front of one detector. It starts on beam 4, halfway up the stage */
class Player {
  private detector = new ChironomyGestureDetector();
  private t = 1000 - STEP_MS;
  public x = 0.56;
  public y = 0.5;

  constructor(
    private live = true,
    private side: HandSide = "right"
  ) {}

  /** One tracker result: the index finger's distance from the thumb, or [index, middle, …] */
  public result(d: number | number[] = OPEN_HAND) {
    this.t += STEP_MS;
    const given = typeof d === "number" ? [d] : d;
    const dists = [...given, ...OPEN_HAND.slice(given.length)];
    return this.detector.evaluateHand(hand(this.x, this.y, dists), this.side, this.t, this.live);
  }

  /** One result per entry. The note each one played: P or S (pluck, strum) and the beam, or "-" */
  public play(...steps: (number | number[])[]) {
    return steps.map((d) => {
      const { pluck } = this.result(d);
      return pluck ? `${pluck.reason === "PINCH_PLUCK" ? "P" : "S"}${pluck.stringIndex}` : "-";
    });
  }

  /** A hand has to be in view for SETTLE_MS before it plays */
  public settle(d: number | number[] = OPEN_HAND) {
    for (let i = 0; i <= Math.ceil(SETTLE_MS / STEP_MS); i++) this.result(d);
    return this;
  }

  /** Close the index finger onto the thumb and hold it there */
  public pinch() {
    return this.play(0.8, 0.6, 0.45, 0.2, 0.2, 0.2);
  }
}

test("a pinch plays once, and not again while it is held", () => {
  const p = new Player().settle();
  expect(p.play(0.8, 0.6, 0.45, 0.3, 0.2, 0.2, 0.2)).toEqual(["-", "-", "P4", "-", "-", "-", "-"]);
});

test("a finger that opens part of the way plays again when it touches, and not before", () => {
  const p = new Player().settle();
  p.pinch();
  // Open to 0.45 for two results, come back: nothing at 0.30, the note on touching
  expect(p.play(0.45, 0.45, 0.3, 0.2)).toEqual(["-", "-", "-", "P4"]);
  // Not open enough to count
  expect(p.play(0.2, 0.3, 0.3, 0.2, 0.3, 0.2)).toEqual(["-", "-", "-", "-", "-", "-"]);
});

test("one wide-open result in a held pinch is the tracker, two are the hand", () => {
  const glitch = new Player().settle();
  glitch.pinch();
  expect(glitch.play(0.7, 0.2, 0.2, 0.7, 0.45, 0.45)).toEqual(["-", "-", "-", "-", "-", "-"]);

  const opened = new Player().settle();
  opened.pinch();
  expect(opened.play(0.7, 0.7, 0.45)).toEqual(["-", "-", "P4"]);
});

test("a fingertip that jumps onto the thumb within one result waits for the next", () => {
  const p = new Player().settle();
  expect(p.play(0.9, 0.2, 0.2)).toEqual(["-", "-", "P4"]);

  // When the next result says the hand is open after all, there was no pinch
  const q = new Player().settle();
  expect(q.play(0.9, 0.2, 0.9, 0.9)).toEqual(["-", "-", "-", "-"]);
});

test("a pinch made off the stage is never played", () => {
  const p = new Player();
  p.x = -0.01;
  p.settle();
  expect(p.play(0.8, 0.6, 0.45, 0.3)).toEqual(["-", "-", "-", "-"]);
  // The hand comes onto the stage still pinched
  p.x = 0.05;
  expect(p.play(0.3, 0.2, 0.2)).toEqual(["-", "-", "-"]);
  // Open and pinch again, on the stage this time
  expect(p.play(0.8, 0.8, 0.6, 0.45)).toEqual(["-", "-", "-", "P0"]);
});

test("a hand that arrives pinched plays nothing until it has opened and closed", () => {
  const p = new Player().settle(0.2);
  expect(p.play(0.2, 0.2, 0.8, 0.8, 0.6, 0.45)).toEqual(["-", "-", "-", "-", "-", "P4"]);
});

test("at the loosest setting, a pinch held near the line plucks once", () => {
  setPinchEnterThreshold(0.78);
  try {
    const p = new Player().settle();
    expect(p.play(0.9, 0.75, 0.8, 0.7, 0.8, 0.72, 0.79, 0.7)).toEqual(["-", "P4", "-", "-", "-", "-", "-", "-"]);
  } finally {
    setPinchEnterThreshold(0.52);
  }
});

test("on the line between two beams the fingertip stays on the beam it was on", () => {
  const p = new Player();
  const beams = [0.37, 0.3745, 0.377, 0.38, 0.373, 0.37].map((x) => {
    p.x = x;
    return p.result().metrics.hoveredStringIndex;
  });
  expect(beams).toEqual([2, 2, 2, 3, 3, 2]);
});

test("a held index pinch strums every beam of a sweep, and waits only to go straight back", () => {
  const p = new Player().settle();
  p.x = 0.31;
  expect(p.pinch()).toContain("P2");
  const sweep = [0.44, 0.56, 0.69, 0.56, 0.56, 0.56].map((x) => {
    p.x = x;
    return p.play(0.2)[0];
  });
  // Three beams on three results in a row, then back to the one just left: 85 ms have to pass first
  expect(sweep).toEqual(["S3", "S4", "S5", "-", "-", "S4"]);
});

test("an open hand resting on a ribbon slot triggers it after 380 ms", () => {
  const p = new Player();
  p.x = 0.7;
  p.y = 0.1;
  const kinds = Array.from({ length: 16 }, () => p.result().macroEvent?.kind ?? "-");
  // Twelve results are 363 ms. The slot fires on the thirteenth, once
  expect(kinds.indexOf("RIBBON_DRONE")).toBe(12);
  expect(kinds.filter((k) => k !== "-")).toEqual(["RIBBON_DRONE"]);
});

test("a pinch inside a ribbon slot triggers it at once, and plays no beam on the way out", () => {
  const p = new Player();
  p.x = 0.7;
  p.y = 0.1;
  p.settle();
  const inside = p.result(0.3);
  expect(inside.macroEvent?.kind).toBe("RIBBON_DRONE");
  expect(inside.pluck).toBeNull();
  // Down onto the beams with the fingers still closed, then a new pinch
  p.y = 0.5;
  expect(p.play(0.2, 0.2, 0.2, 0.8, 0.8, 0.6, 0.45)).toEqual(["-", "-", "-", "-", "-", "-", "P5"]);
});

test("a held pinch has to go further up before the ribbon takes it", () => {
  const p = new Player().settle();
  p.pinch();
  // Just inside the ribbon's edge (0.172): still a strum, and no slot
  p.y = 0.165;
  p.x = 0.69;
  const edge = p.result(0.2);
  expect(edge.pluck?.reason).toBe("PINCH_STRUM");
  expect(edge.pluck?.stringIndex).toBe(5);
  expect(edge.metrics.ribbonSlotHover).toBe(-1);
  expect(edge.macroEvent).toBeNull();
  // Well inside it
  p.y = 0.15;
  const reach = p.result(0.2);
  expect(reach.macroEvent?.kind).toBe("RIBBON_DRONE");
  expect(reach.pluck).toBeNull();
  // An open hand at the first height is in the ribbon
  const open = new Player().settle();
  open.y = 0.165;
  expect(open.result().metrics.ribbonSlotHover).toBe(2);
});

test("lifting the index off a pinch the middle finger shares plays nothing, and ends the strum", () => {
  const p = new Player().settle();
  p.pinch();
  // The middle finger joins, then the index lifts
  expect(p.play([0.2, 0.2], [0.2, 0.2], [0.5, 0.2], [0.7, 0.2], [0.7, 0.2])).toEqual(["-", "-", "-", "-", "-"]);
  expect(p.result([0.7, 0.2]).metrics.activeFingerPinch).toBe(1);
  // Only the index pinch strums
  p.x = 0.69;
  expect(p.play([0.7, 0.2], [0.7, 0.2])).toEqual(["-", "-"]);
});

test("rolling the thumb from one finger to the next plays each of them", () => {
  const p = new Player().settle();
  p.pinch();
  // To the middle finger, whose own beam on the right hand is 5, and back to the index on beam 4
  expect(p.play([0.35, 0.6], [0.5, 0.38], [0.55, 0.2], [0.55, 0.2], [0.4, 0.35], [0.2, 0.5])).toEqual([
    "-",
    "P5",
    "-",
    "-",
    "-",
    "P4",
  ]);
});

test("with the camera off, a simulated hand plucks on its first result", () => {
  const p = new Player(false);
  // It lets go at 0.28, and there is no part-open replay
  expect(p.play(0.15, 0.25, 0.15, 0.3, 0.15)).toEqual(["P4", "-", "-", "-", "P4"]);
});

test("a hand keeps its slot across the centre, and changes side only once it is past it", () => {
  const slots = new HandSlots();
  const seen = [0.3, 0.45, 0.52, 0.54, 0.48, 0.46].map((x, i) => {
    const [a] = slots.assign([{ x, y: 0.5 }], i * STEP_MS);
    return `${a.slot}${a.side[0]}${a.fresh ? "*" : ""}`;
  });
  expect(seen).toEqual(["0l*", "0l", "0l", "0r", "0r", "0l"]);
});

test("the order the tracker lists two hands in does not matter", () => {
  const slots = new HandSlots();
  const left = { x: 0.3, y: 0.5 };
  const right = { x: 0.7, y: 0.5 };
  expect(slots.assign([left, right], 0).map((a) => a.slot)).toEqual([0, 1]);
  const swapped = slots.assign([right, left], STEP_MS);
  expect(swapped.map((a) => a.slot)).toEqual([1, 0]);
  expect(swapped.map((a) => a.fresh)).toEqual([false, false]);
});

test("a second hand on the first one's side takes the free slot", () => {
  const slots = new HandSlots();
  expect(slots.assign([{ x: 0.7, y: 0.5 }], 0)[0].slot).toBe(1);
  const both = slots.assign([{ x: 0.7, y: 0.5 }, { x: 0.9, y: 0.5 }], STEP_MS);
  expect(both.map((a) => `${a.slot}${a.side[0]}${a.fresh ? "*" : ""}`)).toEqual(["1r", "0r*"]);
});

test("a hand lost for a moment gets its slot back, and a later one is new", () => {
  const slots = new HandSlots();
  slots.assign([{ x: 0.7, y: 0.5 }], 0);
  const back = slots.assign([{ x: 0.72, y: 0.5 }], 300)[0];
  expect([back.slot, back.fresh, back.gapMs]).toEqual([1, false, 300]);
  expect(slots.assign([{ x: 0.72, y: 0.5 }], 900)[0].fresh).toBe(true);
});

test("a new hand's filters start where the tracker put it", () => {
  const pipeline = new HandPipeline();
  const first = pipeline.track([hand(0.3, 0.5)], WHOLE, 1000)[0];
  // The camera's picture is mirrored onto the stage
  expect(first.fast[8].x).toBeCloseTo(0.7, 6);
  expect(first.landmarks[8]).toEqual(first.fast[8]);

  // In view and moving, the smoothed hand trails the tracker's
  const moved = pipeline.track([hand(0.2, 0.5)], WHOLE, 1000 + STEP_MS)[0];
  expect(moved.fresh).toBe(false);
  expect(Math.abs(moved.landmarks[8].x - moved.fast[8].x)).toBeGreaterThan(0.001);

  // Back after a third of a second: the same slot, but nothing the filters remember is where the hand is now
  const back = pipeline.track([hand(0.35, 0.5)], WHOLE, 1000 + STEP_MS + 300)[0];
  expect(back.slot).toBe(first.slot);
  expect(back.landmarks[8].x).toBeCloseTo(back.fast[8].x, 9);
});
