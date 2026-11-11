import { expect, test } from "@playwright/test";
import { type BeatClock, lastStepDue, stemOffset, stemStretch, stepAtTime, timeOfStep } from "../../lib/beat-clock";

// Runs in Node, with no browser: the song clock that places the backing and the stem on the audio clock

// A riff at 120 BPM: a sixteenth is 0.125 s, and the clock was at step 0 at 10 s
const clock: BeatClock = { stepAt: 0, timeAt: 10, stepSec: 0.125 };

test("a step's time and the step at a time undo each other", () => {
  for (const step of [0, 1, 7.5, 31, 400]) {
    expect(stepAtTime(clock, timeOfStep(clock, step))).toBeCloseTo(step, 9);
  }
  expect(timeOfStep(clock, 8)).toBeCloseTo(11, 9);
});

test("every step that starts within the next 100 ms is due, and none later", () => {
  // At 10.4 s the clock is at step 3.2; step 4 starts at 10.5 s, exactly 100 ms on
  expect(lastStepDue(clock, 10.4, 0.1)).toBe(4);
  // At 10.37 s step 4 is 130 ms away, so only step 3 is due
  expect(lastStepDue(clock, 10.37, 0.1)).toBe(3);
  // With no lookahead it is the step the clock is in, as the backing was played before
  expect(lastStepDue(clock, 10.4, 0)).toBe(3);
});

test("in a setlist the step that starts the next song waits for its time", () => {
  // 50 ms before step 16, the first step of the next song of 16
  expect(lastStepDue(clock, 11.95, 0.1, 16)).toBe(15);
  // Once it is there, it is due, and the lookahead runs on into the new song
  expect(lastStepDue(clock, 12, 0.1, 16)).toBe(16);
  expect(lastStepDue(clock, 12.03, 0.1, 16)).toBe(17);
  // A song whose clock starts 15 ms from now has its step 0 due at once, to start with its stem
  expect(lastStepDue({ ...clock, timeAt: 10.015 }, 10, 0.1, 16)).toBe(0);
});

test("the stem's place follows the clock, at any chord's rate", () => {
  // 32 steps a loop: 4 s at 120 BPM. Under the V chord the stem plays 1.5 times as fast, from a take 1.5 times as long
  const rate = 1.5;
  const take = 4 * stemStretch(4, 32, 0.125, rate);
  expect(take).toBeCloseTo(6, 9);
  // A quarter of the way round the loop is a quarter of the take
  expect(stemOffset(clock, timeOfStep(clock, 8), 32, take)).toBeCloseTo(1.5, 9);
  // Started at any moment and left to play, the stem is where the clock says it is a minute later: no drift
  for (const startAt of [10, 10.07, 13.3]) {
    const from = stemOffset(clock, startAt, 32, take);
    const later = startAt + 60;
    const played = (from + (later - startAt) * rate) % take;
    expect(Math.abs(played - stemOffset(clock, later, 32, take))).toBeLessThan(1e-6);
  }
});

test("the stem is stretched by the tempo and by the chord's rate", () => {
  expect(stemStretch(4, 32, 0.125, 1)).toBe(1);
  // 120 BPM played at 96: a sixteenth is 15 / 96 s, the loop 5 s
  expect(stemStretch(4, 32, 15 / 96, 1)).toBeCloseTo(1.25, 9);
  // The IV chord raises the pitch by five semitones, so the take is that much longer
  expect(stemStretch(4, 32, 0.125, Math.pow(2, 5 / 12))).toBeCloseTo(Math.pow(2, 5 / 12), 9);
  // Solar Pulse: 4.8 s at 100 BPM, 32 sixteenths
  expect(stemStretch(4.8, 32, 15 / 100, 1)).toBe(1);
});
