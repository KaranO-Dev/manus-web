import { expect, test } from "@playwright/test";
import { stretchLoop } from "../../lib/stretch";

// Runs in Node, with no browser: the backing stems stretched to another tempo, as the Android app's dsp_test "stem stretch"

const RATE = 44100;
const steady = (seconds: number) => new Float32Array(RATE * seconds).fill(0.5);

test("at the stem's own tempo the stem is left as it is", () => {
  const stem = [steady(1), steady(1)];
  expect(stretchLoop(stem, 1)).toBe(stem);
});

test("the take is the stem's length times the stretch", () => {
  expect(stretchLoop([steady(1)], 1.25)[0].length).toBe(55125); // 120 BPM played at 96
  expect(stretchLoop([steady(1)], 0.8)[0].length).toBe(35280); // 120 BPM played at 150
});

test("the windows go round the loop: no silent tail and no fade at the seam", () => {
  for (const stretch of [1.25, 0.8, 1.02]) {
    const [take] = stretchLoop([steady(1)], stretch);
    let min = Infinity;
    let max = -Infinity;
    for (const v of take) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min, `lowest sample at ${stretch}`).toBeGreaterThan(0.499);
    expect(max, `highest sample at ${stretch}`).toBeLessThan(0.501);
  }
});

test("a tone that loops cleanly still loops cleanly once stretched", () => {
  // 441 Hz fits the second exactly, so the stem's end runs straight into its start
  const tone = new Float32Array(RATE).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 441 * i) / RATE));
  const [take] = stretchLoop([tone], 1.25);
  let step = 0;
  for (let i = 1; i < take.length; i++) step = Math.max(step, Math.abs(take[i] - take[i - 1]));
  const seam = Math.abs(take[0] - take[take.length - 1]);
  expect(seam).toBeLessThanOrEqual(step * 1.5);
});

test("the beats stay where they were: a click lands at the same share of the take at any stretch", () => {
  // A click on every quarter of a 120 BPM stem, 4 s long
  const len = RATE * 4;
  const clicks = new Float32Array(len);
  for (let b = 0; b < 8; b++) {
    for (let i = 0; i < 240; i++) clicks[(b * len) / 8 + i] = Math.exp(-i / 40) * (i % 2 ? 1 : -1);
  }
  // The click's own energy sits about 20 samples in; anything past 1.5 ms off would be heard against the drums
  for (const stretch of [0.56, 0.79, 1.25, 1.5, 2.5]) {
    const [take] = stretchLoop([clicks], stretch);
    let off = 0;
    for (let b = 0; b < 8; b++) {
      const want = Math.round((b * take.length) / 8);
      let energy = 0;
      let moment = 0;
      for (let d = -4000; d < 4000; d++) {
        const v = take[(want + d + take.length) % take.length];
        energy += v * v;
        moment += v * v * d;
      }
      off += moment / energy / 8;
    }
    expect(Math.abs(off) / RATE, `click offset at ${stretch}`).toBeLessThan(0.0015);
  }
});
