import { expect, test } from "@playwright/test";
import { averageHandPose, ChironomyGestureDetector, THEREMIN_MAX_Y, THEREMIN_MIN_Y } from "../../lib/gestures";

// Runs in Node, with no browser: made-up hands through the same gesture code the stage uses

/** An open hand, fingers up, with the index fingertip at the given height (image y, 0 at the top) */
function openHand(cx: number, indexTipY: number) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: indexTipY + 0.1, z: 0 }));
  lm[0] = { x: cx, y: indexTipY + 0.3, z: 0 }; // wrist
  const fingers = [
    [1, 2, 3, 4, -0.12],
    [5, 6, 7, 8, -0.04],
    [9, 10, 11, 12, 0],
    [13, 14, 15, 16, 0.04],
    [17, 18, 19, 20, 0.08],
  ];
  for (const [a, b, c, tip, dx] of fingers) {
    lm[a] = { x: cx + dx, y: indexTipY + 0.15, z: 0 };
    lm[b] = { x: cx + dx, y: indexTipY + 0.1, z: 0 };
    lm[c] = { x: cx + dx, y: indexTipY + 0.05, z: 0 };
    lm[tip] = { x: cx + dx * (tip === 4 ? 2 : 1), y: indexTipY + (tip === 4 ? 0.1 : 0.01), z: 0 };
  }
  lm[8] = { x: cx - 0.04, y: indexTipY, z: 0 };
  return lm;
}

/** The image y where the theremin reads the given height */
const yAt = (height: number) => THEREMIN_MIN_Y - height * (THEREMIN_MIN_Y - THEREMIN_MAX_Y);

function pose(cx: number, height: number) {
  const m = new ChironomyGestureDetector().evaluateHand(openHand(cx, yAt(height)), cx < 0.5 ? "left" : "right", 1000, true).metrics;
  expect(m.isIndexPinched).toBe(false);
  return m;
}

test("one hand halfway up puts the theremin halfway, not fully open", () => {
  const avg = averageHandPose([pose(0.7, 0.5)]);
  expect(avg?.elevation).toBeCloseTo(0.5, 2);
});

test("the theremin follows the mean height of both hands", () => {
  expect(averageHandPose([pose(0.3, 0.2), pose(0.7, 0.8)])?.elevation).toBeCloseTo(0.5, 2);
  expect(averageHandPose([pose(0.3, 0), pose(0.7, 0)])?.elevation).toBeCloseTo(0, 2);
  expect(averageHandPose([pose(0.3, 1), pose(0.7, 1)])?.elevation).toBeCloseTo(1, 2);
});

test("no hands in view gives no average", () => {
  expect(averageHandPose([])).toBeNull();
});
