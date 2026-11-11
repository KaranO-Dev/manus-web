import { expect, test } from "@playwright/test";
import { FrameClock } from "../../lib/frame-clock";

// A 30-frame camera seen on a 60 Hz screen: the page's times fall on the screen's refreshes
const SCREEN = 1000 / 60;
const pageTimes = (frames: number, start = 5000) =>
  Array.from({ length: frames }, (_, i) => start + Math.ceil((i * (1000 / 30) + 3) / SCREEN) * SCREEN);

test("keeps the camera's even spacing between frames", () => {
  const clock = new FrameClock();
  const stamps = pageTimes(30).map((page, i) => clock.stamp(page, 12 + i / 30));
  for (let i = 1; i < stamps.length; i++) {
    expect(stamps[i] - stamps[i - 1]).toBeCloseTo(1000 / 30, 6);
  }
  expect(stamps[0]).toBe(pageTimes(1)[0]);
});

test("without the camera's stamps it gives the page's times", () => {
  const clock = new FrameClock();
  const pages = pageTimes(10);
  expect(pages.map((page) => clock.stamp(page))).toEqual(pages);
});

test("a camera stamp that stands still falls back to the page's time", () => {
  const clock = new FrameClock();
  const pages = pageTimes(6);
  expect(pages.map((page) => clock.stamp(page, 0))).toEqual(pages);
});

test("after a pause the camera's time is hung on the page's clock again", () => {
  const clock = new FrameClock();
  clock.stamp(1000, 1);
  clock.stamp(1033, 1 + 1 / 30);
  // the tab was hidden for two seconds; the camera's own clock counted only one frame
  expect(clock.stamp(3033, 1 + 2 / 30)).toBe(3033);
  expect(clock.stamp(3070, 1 + 3 / 30)).toBeCloseTo(3033 + 1000 / 30, 6);
});

test("times never go back or repeat", () => {
  const clock = new FrameClock();
  const a = clock.stamp(1000);
  const b = clock.stamp(1000);
  const c = clock.stamp(990);
  expect(b).toBeGreaterThan(a);
  expect(c).toBeGreaterThan(b);
});
