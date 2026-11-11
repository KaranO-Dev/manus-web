import { expect, test, type Page } from "@playwright/test";

/*
  Browser checks of the play keys and the dialogs' focus: keys follow the physical key and not the letter it
  types, typing in a field plays nothing, and the lesson and the guide hold focus and give it back.
*/

/** Open the page with the first-visit lesson already seen and no saved settings */
async function open(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e.init")) {
      sessionStorage.setItem("e2e.init", "1");
      localStorage.clear();
      localStorage.setItem("manus.lesson.seen", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator(".oled-note-big")).toBeVisible();
  // The display is drawn on the server and shows before the page listens for keys
  await expect(page.locator("html[data-keys=on]")).toBeAttached();
}

const note = (page: Page) => page.locator(".oled-note-big");

// With WebGL in software the page can be busy for a few seconds after the first key starts the sound, and the
// display catches up only then: about 0.1 s on a GPU, up to 3.5 s here
const SLOW = 15_000;

/** A key as another layout sends it: the physical key is `code`, the letter it types is `key` */
const sendKey = (page: Page, code: string, key: string) =>
  page.evaluate(
    ([c, k]) => document.body.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: k, bubbles: true })),
    [code, key]
  );

const insideDialog = (page: Page, name: string | RegExp) =>
  page.getByRole("dialog", { name }).evaluate((d) => d.contains(document.activeElement));

test("a play key follows the physical key, whatever letter the layout types", async ({ page }) => {
  await open(page);
  // what the first beam plays, from an ordinary press of the A key
  const idle = (await note(page).textContent()) ?? "";
  await page.keyboard.press("a");
  await expect(note(page)).not.toHaveText(idle, { timeout: SLOW });
  const first = (await note(page).textContent()) ?? "";
  await page.keyboard.press("j");
  await expect(note(page)).not.toHaveText(first, { timeout: SLOW });

  // the same physical key on a layout where it types q
  await sendKey(page, "KeyA", "q");
  await expect(note(page)).toHaveText(first, { timeout: SLOW });

  // and the letter alone, from a key that is not A, plays nothing
  await page.keyboard.press("j");
  await expect(note(page)).not.toHaveText(first, { timeout: SLOW });
  const other = (await note(page).textContent()) ?? "";
  await sendKey(page, "KeyU", "a");
  await page.waitForTimeout(300);
  await expect(note(page)).toHaveText(other);
});

test("typing in a field on the page plays nothing and leaves the keys alone", async ({ page }) => {
  await open(page);
  await page.keyboard.press("e");
  const slider = page.locator(".bench-slider input");
  await expect(slider).toBeVisible();
  await slider.focus();

  const before = (await note(page).textContent()) ?? "";
  const drone = page.locator(".topbar-actions .ctrl-btn", { hasText: "DRONE" }).first();
  const droneBefore = await drone.getAttribute("data-active");
  for (const key of ["a", "s", "j", "k", "Space", "t"]) await page.keyboard.press(key);
  await page.waitForTimeout(300);

  await expect(note(page)).toHaveText(before);
  await expect(drone).toHaveAttribute("data-active", droneBefore ?? "");
  await expect(slider).toBeFocused();
});

test("the first-visit lesson is a modal that holds focus", async ({ page }) => {
  await page.goto("/");
  const lesson = page.getByRole("dialog", { name: "Aim, then pinch" });
  await expect(lesson).toBeVisible();
  await expect(lesson).toHaveAttribute("aria-modal", "true");
  await expect.poll(() => insideDialog(page, "Aim, then pinch")).toBe(true);

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await insideDialog(page, "Aim, then pinch"), `Tab ${i + 1} stays in the lesson`).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await insideDialog(page, "Aim, then pinch"), `Shift+Tab ${i + 1} stays in the lesson`).toBe(true);
  }
});

test("the lesson gives focus back to what had it, and so does the guide", async ({ page }) => {
  await open(page);
  const opener = page.locator(".topbar-actions .ctrl-btn", { hasText: "RECALL" }).first();

  await opener.focus();
  await page.keyboard.press("w");
  const lesson = page.getByRole("dialog", { name: "Aim, then pinch" });
  await expect(lesson).toBeVisible();
  await expect(lesson).toHaveAttribute("aria-modal", "true");
  await expect.poll(() => insideDialog(page, "Aim, then pinch")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(lesson).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.focus();
  await page.keyboard.press("?");
  const guide = page.getByRole("dialog", { name: "MANUS Gesture Guide" });
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute("aria-modal", "true");
  await expect.poll(() => insideDialog(page, "MANUS Gesture Guide")).toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await insideDialog(page, "MANUS Gesture Guide"), `Tab ${i + 1} stays in the guide`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(opener).toBeFocused();
});
