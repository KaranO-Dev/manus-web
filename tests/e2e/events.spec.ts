import { expect, test, type Page } from "@playwright/test";

/*
  The play steps counted for Web Analytics (lib/events.ts). Away from Vercel its script never loads, so every
  view waits in window.vaq, and the steps are read from there: each /events/<name> sent once per page load.
*/

async function open(page: Page, path = "/") {
  await page.addInitScript(() => localStorage.setItem("manus.lesson.seen", "1"));
  await page.goto(path);
}

/** The /events/<name> views sent so far, in order */
function sent(page: Page) {
  return page.evaluate(() => {
    const q = (window as unknown as { vaq?: [string, { path?: string }?][] }).vaq ?? [];
    return q.filter(([kind, p]) => kind === "pageview" && p?.path?.startsWith("/events/")).map(([, p]) => p!.path!);
  });
}

test("a note without the camera, a song and a caught gem are each counted once", async ({ page }) => {
  await open(page);
  await expect(page.locator(".oled-note-big")).toBeVisible();
  expect(await sent(page)).toEqual([]);

  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect.poll(() => sent(page)).toEqual(["/events/note-no-camera"]);

  await page.getByRole("button", { name: /PLAY ALONG/ }).click();
  const keys = ["a", "s", "d", "f", "j", "k", "l", ";"];
  for (let i = 0; i < 70 && !(await sent(page)).includes("/events/gem-caught"); i++) {
    await page.keyboard.press(keys[i % keys.length]);
    await page.waitForTimeout(110);
  }
  await page.getByRole("button", { name: /STOP SONG/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /PLAY ALONG/ }).click();
  await page.keyboard.press("j");

  expect(await sent(page)).toEqual(["/events/note-no-camera", "/events/song-start", "/events/gem-caught"]);
});

test("turning the camera on is counted, and a key played with it on is not a note without the camera", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /OPEN CAM/ }).click();
  // The fake camera can take a while to start when the machine is busy
  await expect.poll(() => sent(page), { timeout: 30_000 }).toEqual(["/events/camera-on"]);
  await page.keyboard.press("j");
  await page.waitForTimeout(300);
  expect(await sent(page)).toEqual(["/events/camera-on"]);
});

test("a blocked camera is counted", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await open(page);
  await page.getByRole("button", { name: /OPEN CAM/ }).click();
  await expect(page.getByText(/Camera blocked/)).toBeVisible();
  await expect.poll(() => sent(page)).toEqual(["/events/camera-blocked"]);
});

// A page the offline worker already controls on arrival is a return visit, so the first visit and a reload don't count
test("a return visit is counted once the offline worker serves the page, and a reload is not", async ({ page }) => {
  await open(page);
  expect(await sent(page)).toEqual([]);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await sent(page)).toEqual([]);

  await page.goto("/android/privacy");
  await page.goto("/");
  await expect.poll(() => sent(page)).toEqual(["/events/return-visit"]);
});
