import { expect, test } from "@playwright/test";
import { pickSelfieCamera, type CameraDevice } from "../../lib/camera";

// Runs in Node, with no browser: the camera lists phones report, through the choice the stage makes

const cam = (n: number, facing: "front" | "back"): CameraDevice => ({
  deviceId: `id-${n}`,
  kind: "videoinput",
  label: `camera2 ${n}, facing ${facing}`,
});

// A Galaxy Z Fold7 shows apps four cameras: 0 and 2 on the back, 1 for the outer screen, 3 for the inner one
const fold = [cam(0, "back"), cam(1, "front"), cam(2, "back"), cam(3, "front")];
// Its screens in CSS pixels: the outer one tall and narrow, the inner one close to square
const outer = [412, 961] as const;
const inner = [884, 981] as const;

test("a Fold unfolded uses the inner screen's camera, either way up", () => {
  expect(pickSelfieCamera(fold, ...inner)).toBe("id-3");
  expect(pickSelfieCamera(fold, inner[1], inner[0])).toBe("id-3");
});

test("a Fold closed uses the outer screen's camera, either way up", () => {
  expect(pickSelfieCamera(fold, ...outer)).toBe("id-1");
  expect(pickSelfieCamera(fold, outer[1], outer[0])).toBe("id-1");
});

test("the cameras are ordered by their number, not by the order they are listed in", () => {
  const shuffled = [fold[3], fold[0], fold[1], fold[2]];
  expect(pickSelfieCamera(shuffled, ...inner)).toBe("id-3");
  expect(pickSelfieCamera(shuffled, ...outer)).toBe("id-1");
});

test("a phone with one selfie camera leaves the choice to the browser", () => {
  expect(pickSelfieCamera([cam(0, "back"), cam(1, "front")], ...outer)).toBeNull();
  // an iPhone
  const iphone: CameraDevice[] = [
    { deviceId: "a", kind: "videoinput", label: "Front Camera" },
    { deviceId: "b", kind: "videoinput", label: "Back Camera" },
  ];
  expect(pickSelfieCamera(iphone, 393, 852)).toBeNull();
});

test("before the camera permission, with no labels, the browser picks", () => {
  const unlabelled = fold.map((d) => ({ ...d, label: "" }));
  expect(pickSelfieCamera(unlabelled, ...inner)).toBeNull();
});

test("a computer's webcam leaves the choice to the browser", () => {
  const mac: CameraDevice[] = [{ deviceId: "f", kind: "videoinput", label: "FaceTime HD Camera" }];
  expect(pickSelfieCamera(mac, 1512, 982)).toBeNull();
});

test("an older Chrome's labels work the same", () => {
  const old = [cam(0, "back"), cam(1, "front"), cam(3, "front")].map((d) => ({ ...d, label: d.label.replace("camera2", "camera") }));
  expect(pickSelfieCamera(old, ...inner)).toBe("id-3");
});

test("a 16:10 tablet with two front cameras keeps the first", () => {
  expect(pickSelfieCamera(fold, 800, 1280)).toBe("id-1");
});
