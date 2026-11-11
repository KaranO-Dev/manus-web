/*
  The song clock's arithmetic, with no Web Audio in it, so Node can test it (tests/unit/beat-clock.spec.ts).

  The clock is an anchor, a step number at a time on the audio clock, and a step length. The backing is played a
  little ahead of the beat at the beat's exact time, so a late animation frame or a busy main thread (the hand
  tracker takes 20 to 50 ms a frame there) no longer moves it. The stem is placed by the same clock, so it stays on
  the drums through tempo and chord changes.
*/

export type BeatClock = {
  /** The step the clock was at, at `timeAt` */
  stepAt: number;
  /** Seconds on the audio clock */
  timeAt: number;
  /** Seconds per step */
  stepSec: number;
};

/** How far ahead of its time a step is played, in seconds. Longer than any frame the tracker holds up */
export const LOOKAHEAD_SEC = 0.1;

export function stepAtTime(clock: BeatClock, t: number): number {
  return clock.stepAt + (t - clock.timeAt) / clock.stepSec;
}

export function timeOfStep(clock: BeatClock, step: number): number {
  return clock.timeAt + (step - clock.stepAt) * clock.stepSec;
}

/**
 * The last step to play by now: every step that starts within `lookahead` seconds of `t`. With `songEvery`, a setlist's
 * song length in steps, the step that starts the next song waits for its own time, since the next song may take its place.
 */
export function lastStepDue(clock: BeatClock, t: number, lookahead = LOOKAHEAD_SEC, songEvery?: number): number {
  const now = Math.floor(stepAtTime(clock, t));
  let due = Math.floor(stepAtTime(clock, t + lookahead));
  if (songEvery && songEvery > 0) {
    // Step 0 starts a song but ends none, so a clock still before it (a song starting) waits for nothing
    const nextSong = (Math.floor(Math.max(0, now) / songEvery) + 1) * songEvery;
    if (due >= nextSong) due = nextSong - 1;
  }
  return Math.max(now, due);
}

/**
 * Where a looping stem should be at time `t`, in seconds of its buffer: the loop holds `loopSteps` steps of the clock and
 * starts on step 0. `bufferSec` is the buffer's length, which differs from the loop's time when it plays at a chord's rate.
 */
export function stemOffset(clock: BeatClock, t: number, loopSteps: number, bufferSec: number): number {
  const step = stepAtTime(clock, t);
  const inLoop = ((step % loopSteps) + loopSteps) % loopSteps;
  return Math.min(Math.max(0, bufferSec - 1e-4), (inLoop / loopSteps) * bufferSec);
}

/**
 * The stretch that keeps a stem of `nativeSec` on a clock of `stepSec` while it plays at `rate` (a chord's pitch): its
 * loop of `loopSteps` steps must last loopSteps × stepSec of real time, and playing at `rate` shortens it by `rate`.
 */
export function stemStretch(nativeSec: number, loopSteps: number, stepSec: number, rate: number): number {
  const stretch = (loopSteps * stepSec * rate) / nativeSec;
  return Math.abs(stretch - 1) < 1e-6 ? 1 : stretch;
}
