import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { WHOLE } from "../../lib/camera-fit";
import { ChironomyGestureDetector, type MacroGestureKind, type PluckTrigger } from "../../lib/gestures";
import { HandPipeline, type Landmark } from "../../lib/hand-pipeline";

/*
  Runs in Node, with no browser: a recording of two hands playing (tests/fixtures/hands.json, 615 tracker
  results at 30 a second, as the tracker gave them) goes through the same code the stage uses, and the notes
  that come out are compared with the ones written down here. A change to the gesture rules or the filters
  that moves a note shows up as a failure, with the frame it moved to.

  Slot 1 is the hand on the right of the stage, slot 0 the one on the left. P is a pluck, S a strum, and the
  digit is the beam.
*/

const clip = JSON.parse(readFileSync("tests/fixtures/hands.json", "utf8")) as {
  fps: number;
  frames: number[][][];
};
const hands = (frame: number[][]): Landmark[][] =>
  frame.map((xy) => Array.from({ length: 21 }, (_, i) => ({ x: xy[i * 2] / 10000, y: xy[i * 2 + 1] / 10000, z: 0 })));

interface Note {
  frame: number;
  slot: number;
  pluck: PluckTrigger;
}

function play() {
  const pipeline = new HandPipeline();
  const detector = new ChironomyGestureDetector();
  const notes: Note[] = [];
  const macros: { frame: number; slot: number; kind: MacroGestureKind }[] = [];
  const slots: string[] = [];
  clip.frames.forEach((frame, i) => {
    const tMs = (i * 1000) / clip.fps;
    const tracked = pipeline.track(hands(frame), WHOLE, tMs);
    slots.push(tracked.map((h) => `${h.slot}${h.side[0]}${h.fresh ? "*" : ""}`).join(","));
    for (const h of tracked) {
      const { pluck, macroEvent } = detector.evaluateHand(h.landmarks, h.side, tMs, true, false, h);
      if (pluck) notes.push({ frame: i, slot: h.slot, pluck });
      if (macroEvent) macros.push({ frame: i, slot: h.slot, kind: macroEvent.kind });
    }
  });
  return { notes, macros, slots };
}

const label = (n: Note) => `${n.frame}:s${n.slot}${n.pluck.reason === "PINCH_PLUCK" ? "P" : "S"}${n.pluck.stringIndex}`;
const { notes, macros, slots } = play();
const between = (from: number, to: number, slot?: number) =>
  notes.filter((n) => n.frame >= from && n.frame <= to && (slot === undefined || n.slot === slot));

test("the recording plays the same 54 notes, on the same frames", () => {
  expect(notes.map(label).join(" ")).toBe(
    "141:s1P5 141:s0P2 170:s1S6 174:s0S3 177:s1S7 180:s0S4 187:s1S6 188:s0S3 191:s1S5 193:s0S2 196:s1S4 " +
      "198:s0S1 200:s1S3 210:s1S4 210:s0S2 215:s1S5 215:s0S3 227:s0S2 234:s1S4 238:s1S5 243:s0S1 271:s1S6 " +
      "304:s0S2 376:s0S3 384:s0S4 394:s1S7 415:s1S6 416:s0S3 430:s1P5 540:s1P5 540:s0P2 542:s0S3 545:s1S4 " +
      "551:s1S5 552:s0S2 553:s1S6 554:s1S7 554:s0S1 557:s0S0 562:s0S1 563:s1S6 565:s0S2 565:s1S5 567:s0S3 " +
      "569:s1S4 575:s1S5 576:s0S2 579:s1S6 580:s0S1 589:s0S2 589:s1S5 592:s1S4 593:s0S3 596:s1S5"
  );
});

test("each hand keeps its slot for as long as it is in view", () => {
  const runs: string[] = [];
  let last = "";
  slots.forEach((s, i) => {
    if (s !== last) runs.push(`${i}:${s}`);
    last = s;
  });
  // The right hand comes in on frame 9 and the left on 12; near the end the right one drops out for five frames
  // and gets its slot back, and nothing is new (*) after the two arrivals
  expect(runs.join(" | ")).toBe("9:1r* | 10:1r | 12:1r,0l* | 13:1r,0l | 558:0l | 563:0l,1r | 597:0l | 600:");
});

test("both hands' first pinch sounds on the frame the fingers close", () => {
  expect(between(0, 141).map(label)).toEqual(["141:s1P5", "141:s0P2"]);
});

test("the tracker throwing a finger open for one frame does not pluck again", () => {
  // The right hand's held pinch reads wide open on frames 179, 185 and 187 only. Everything here is the strum
  expect(between(171, 209).filter((n) => n.pluck.reason === "PINCH_PLUCK")).toEqual([]);
});

test("a strum plays each beam of a sweep, up and back down", () => {
  expect(between(170, 203, 1).map((n) => n.pluck.stringIndex)).toEqual([6, 7, 6, 5, 4, 3]);
  expect(between(170, 203, 0).map((n) => n.pluck.stringIndex)).toEqual([3, 4, 3, 2, 1]);
  // The fast one at the end: beams 4 to 7 inside ten frames, none skipped
  expect(between(545, 554, 1).map((n) => n.pluck.stringIndex)).toEqual([4, 5, 6, 7]);
});

test("the ribbon triggers its slot, and leaving it with the fingers closed plays no beam", () => {
  // The right hand dwells on M4 with the fingers open, reaches up to it again already pinched, then to M5
  expect(macros.map((m) => `${m.frame}:s${m.slot}:${m.kind}`)).toEqual([
    "34:s1:RIBBON_DRONE",
    "454:s1:RIBBON_DRONE",
    "502:s1:RIBBON_LOOP",
  ]);
  expect(between(431, 539, 1)).toEqual([]);
});

test("a strum that tops out on the ribbon's edge carries on and changes nothing", () => {
  // The left hand's held pinch is just inside the ribbon on frames 276 to 283: no slot fires for it, and the
  // same pinch strums three more beams afterwards
  expect(macros.filter((m) => m.slot === 0)).toEqual([]);
  expect(between(272, 390, 0).map(label)).toEqual(["304:s0S2", "376:s0S3", "384:s0S4"]);
});

test("lifting one of two fingers off the thumb plays nothing, and stops the strum", () => {
  // The left hand holds its pinch with the index and middle fingers together, and lifts the index on frames
  // 416 to 419. The middle finger then carries the pinch across a beam on 431, which is not a strum
  expect(between(417, 539, 0)).toEqual([]);
});

test("the thumb leaving one finger for another is a new pinch", () => {
  // On frames 536 to 540 the left thumb lets go of the middle finger and lands on the index
  expect(between(540, 543, 0).map(label)).toEqual(["540:s0P2", "542:s0S3"]);
});

test("a finger that opened part of the way plays when it touches again", () => {
  // The right hand comes down from the ribbon with the index finger never fully open, pinches on frame 540
  // and strums from there
  const run = between(540, 596, 1);
  expect(label(run[0])).toBe("540:s1P5");
  expect(run.slice(1).every((n) => n.pluck.reason === "PINCH_STRUM")).toBe(true);
  expect(run.length).toBe(13);
});

test("a hand leaving the picture plays nothing on its way out", () => {
  expect(between(597, clip.frames.length)).toEqual([]);
});
