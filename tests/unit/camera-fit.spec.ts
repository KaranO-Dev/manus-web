import { expect, test } from "@playwright/test";
import { coverFit, toStage, WHOLE } from "../../lib/camera-fit";

// Runs in Node, with no browser: the crop the stage takes from the camera's picture, as the Android app's CameraFitTest

const wide = 16 / 9;
const tall = 9 / 16;
const at = (x: number, y: number, z = 0) => ({ x, y, z });

test("a picture the stage's shape fills it whole", () => {
  expect(coverFit(wide, wide)).toBe(WHOLE);
  // The canvas rounds to whole pixels, e.g. 1968x1107
  expect(coverFit(wide, 1968 / 1107)).toBe(WHOLE);
});

test("an upright camera shows its full width and the middle of its height", () => {
  const fit = coverFit(tall, wide);
  expect(fit.scaleX).toBe(1);
  expect(fit.scaleY).toBeCloseTo(81 / 256, 9);
});

test("a camera wider than the stage shows the middle of its width", () => {
  // A 16:9 webcam on a desktop stage of 3:2
  const fit = coverFit(wide, 1.5);
  expect(fit.scaleX).toBeCloseTo(1.5 / wide, 9);
  expect(fit.scaleY).toBe(1);
});

test("no size yet shows the whole picture", () => {
  expect(coverFit(0, wide)).toBe(WHOLE);
  expect(coverFit(NaN, wide)).toBe(WHOLE);
  expect(coverFit(tall, 0)).toBe(WHOLE);
});

test("points keep their place in the picture", () => {
  const fit = coverFit(tall, wide);
  // The centre stays, the crop's edges become the stage's, and above it is off the stage
  expect(toStage(at(0.5, 0.5), fit)).toEqual(at(0.5, 0.5));
  expect(toStage(at(0.5, 0.5 - fit.scaleY / 2), fit).y).toBeCloseTo(0, 9);
  expect(toStage(at(0.5, 0.5 + fit.scaleY / 2), fit).y).toBeCloseTo(1, 9);
  expect(toStage(at(0.5, 0.1), fit).y).toBeLessThan(0);
  // Across, nothing is cut
  expect(toStage(at(0.2, 0.5), fit).x).toBeCloseTo(0.2, 9);
});

test("the crop keeps shapes square", () => {
  // A 100 px square in a 720x1280 upright picture, onto a 1600x900 stage
  const fit = coverFit(720 / 1280, 1600 / 900);
  const a = toStage(at(310 / 720, 590 / 1280), fit);
  const b = toStage(at(410 / 720, 690 / 1280), fit);
  expect((b.x - a.x) * 1600).toBeCloseTo((b.y - a.y) * 900, 6);
});

test("depth scales with width, and other fields ride along", () => {
  const fit = coverFit(21 / 9, wide);
  expect(toStage(at(0.5, 0.5, -0.1), fit).z).toBeCloseTo(-0.1 / fit.scaleX, 9);
  expect(toStage({ ...at(0.5, 0.5), visibility: 0.9 }, fit).visibility).toBe(0.9);
});
