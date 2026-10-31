import { expect, test, type Page } from "@playwright/test";

/*
  A foldable in a desktop browser. The fake camera is listed as the outer screen's selfie camera
  ("camera2 1"), next to an inner one ("camera2 3") that refuses to open here, as a Galaxy Z Fold lists
  them, and the screen is sized like either of the Fold's. Every camera the page asks for is recorded:
  "user" for the browser's own front camera, otherwise the device id.
*/
type Screen = { width: number; height: number };

async function openAsFold(page: Page, screen: Screen) {
  await page.addInitScript((initial: Screen) => {
    localStorage.setItem("manus.lesson.seen", "1");
    const size = { ...initial };
    const w = window as unknown as { __asked: string[]; __screen: Screen };
    w.__asked = [];
    w.__screen = size;
    Object.defineProperty(window.screen, "width", { get: () => size.width });
    Object.defineProperty(window.screen, "height", { get: () => size.height });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });

    const md = navigator.mediaDevices;
    const realEnumerate = md.enumerateDevices.bind(md);
    const realOpen = md.getUserMedia.bind(md);
    let granted = false;
    md.enumerateDevices = async () => {
      const fake = (await realEnumerate()).find((d) => d.kind === "videoinput");
      const device = (deviceId: string, label: string) =>
        ({ deviceId, groupId: "", kind: "videoinput", label: granted ? label : "", toJSON: () => ({}) }) as MediaDeviceInfo;
      return [
        device("back-0", "camera2 0, facing back"),
        device(fake?.deviceId ?? "outer-1", "camera2 1, facing front"),
        device("inner-3", "camera2 3, facing front"),
      ];
    };
    md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const video = (constraints?.video ?? {}) as MediaTrackConstraints;
      const exact = (video.deviceId as ConstrainDOMStringParameters | undefined)?.exact as string | undefined;
      w.__asked.push(exact ?? "user");
      granted = true;
      if (exact === "inner-3") throw new DOMException("no such camera here", "OverconstrainedError");
      return realOpen(constraints);
    };
  }, screen);
  await page.goto("/");
  await expect(page.locator(".oled-note-big")).toBeVisible();
  await page.getByRole("button", { name: /OPEN CAM/ }).click();
  await expect(page.getByText("1€ VISION // READY")).toBeVisible({ timeout: 45_000 });
}

const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: string[] }).__asked.slice());

const outer = { width: 412, height: 961 };
const inner = { width: 884, height: 981 };

test("a closed Fold keeps the outer screen's camera, the one the browser gives", async ({ page }) => {
  await openAsFold(page, outer);
  await page.waitForTimeout(1500);
  expect(await asked(page)).toEqual(["user"]);
});

test("an open Fold asks for the inner screen's camera, and keeps a working one if that fails, without looping", async ({ page }) => {
  await openAsFold(page, inner);
  await expect.poll(() => asked(page), { timeout: 15_000 }).toEqual(["user", "inner-3", "user"]);
  await page.waitForTimeout(2000);
  expect(await asked(page)).toEqual(["user", "inner-3", "user"]);
  await expect(page.getByText(/camera.*(denied|blocked|failed|could not)/i)).toHaveCount(0);
});

test("opening the Fold while playing switches to the inner screen's camera", async ({ page }) => {
  await openAsFold(page, outer);
  await page.waitForTimeout(1000);
  expect(await asked(page)).toEqual(["user"]);
  await page.evaluate((s) => {
    Object.assign((window as unknown as { __screen: Screen }).__screen, s);
    window.dispatchEvent(new Event("resize"));
  }, inner);
  await expect.poll(() => asked(page), { timeout: 15_000 }).toEqual(["user", "inner-3", "user"]);
});

test("turning the phone, which keeps the screen's size, leaves the camera alone", async ({ page }) => {
  await openAsFold(page, outer);
  await page.waitForTimeout(1000);
  await page.evaluate((s) => {
    Object.assign((window as unknown as { __screen: Screen }).__screen, { width: s.height, height: s.width });
    window.dispatchEvent(new Event("resize"));
  }, outer);
  await page.waitForTimeout(1500);
  expect(await asked(page)).toEqual(["user"]);
});
