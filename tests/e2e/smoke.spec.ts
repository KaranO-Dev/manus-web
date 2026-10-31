import { expect, test, type Page } from "@playwright/test";

/*
  Browser checks of the first-visit lesson, the toolbar keys, the song score card, the theremin switch, the E4
  knob, text fit at common screen sizes, the bottom bar, installing and offline use, and what search engines and
  language models read.
*/

/** Open the page with the first-visit lesson already seen and no saved settings; a reload in the same tab keeps what the page saved */
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
}

const theremin = (page: Page) => page.locator('.ctrl-btn[aria-pressed]', { hasText: "THEREMIN" });
const e1 = (page: Page) => page.getByRole("slider", { name: /^E1 THEREMIN/ });

/** Every place text can be cut or run out of its box */
function findCutText() {
  const out: string[] = [];
  for (const n of document.querySelectorAll<HTMLElement>(".te-key-name")) {
    if (!n.offsetParent) continue;
    if (n.scrollHeight > n.clientHeight + 1) out.push(`tile name cut: ${n.textContent}`);
    if (n.scrollWidth > n.clientWidth + 1) out.push(`tile name cut sideways: ${n.textContent}`);
    // and no word split over two lines
    const text = n.firstChild;
    for (const m of text?.nodeType === Node.TEXT_NODE ? text.textContent!.matchAll(/\S+/g) : []) {
      const r = document.createRange();
      r.setStart(text!, m.index);
      r.setEnd(text!, m.index + m[0].length);
      if (new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size > 1) out.push(`word broken: ${m[0]}`);
    }
  }
  for (const t of document.querySelectorAll<HTMLElement>(".pad-top > span:first-child, .rail-name")) {
    if (t.offsetParent && t.scrollWidth > t.clientWidth + 1) out.push(`label cut: ${t.textContent}`);
  }
  for (const box of document.querySelectorAll<HTMLElement>(".tactile-pad, .te-key, .knob-socket, .ctrl-btn, .rail-key")) {
    const b = box.getBoundingClientRect();
    if (!b.width) continue;
    for (const c of box.querySelectorAll<HTMLElement>("span, strong, .te-key-name")) {
      const r = c.getBoundingClientRect();
      if (!r.width || getComputedStyle(c).visibility === "hidden") continue;
      if (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 1) out.push(`outside its key: ${c.textContent}`);
    }
  }
  for (const col of document.querySelectorAll<HTMLElement>(".rack-column, .stage-column, .topbar, .finger-matrix")) {
    const cr = col.getBoundingClientRect();
    for (const c of col.children) if (c.getBoundingClientRect().right > cr.right + 1) out.push(`wider than its column: ${c.className}`);
  }
  // the footer's note and every key with its name, inside the footer and each pair on one line
  const footer = document.querySelector<HTMLElement>(".footerbar");
  if (footer) {
    const fr = footer.getBoundingClientRect();
    for (const c of footer.querySelectorAll<HTMLElement>(":scope > *, .kbd-pair, .kbd-tag")) {
      const r = c.getBoundingClientRect();
      if (r.right > fr.right + 1 || r.bottom > fr.bottom + 1) out.push(`outside the footer: ${c.textContent}`);
      if (c.classList.contains("kbd-pair") && r.height > 22) out.push(`key split from its name: ${c.textContent}`);
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1) out.push("page scrolls sideways");
  return [...new Set(out)];
}

test("the first-visit lesson steps forward and back, closes with Start playing, and stays closed", async ({ page }) => {
  await page.goto("/");
  const lesson = page.getByRole("dialog", { name: "Aim, then pinch" });
  await expect(lesson).toBeVisible();
  await expect(page.locator(".lesson-head")).toContainText("Lesson 1 of 3");
  await expect(lesson.getByRole("button", { name: "BACK" })).toHaveCount(0);

  await lesson.getByRole("button", { name: "NEXT" }).click();
  await expect(page.getByRole("heading", { name: "Catch the gem on the white line" })).toBeVisible();
  await page.getByRole("button", { name: "BACK" }).click();
  await expect(page.getByRole("heading", { name: "Aim, then pinch" })).toBeVisible();

  await page.getByRole("button", { name: "NEXT" }).click();
  await page.getByRole("button", { name: "NEXT" }).click();
  // the main key reads Start playing on the last step and stays a dark key under the pointer
  const start = page.getByRole("button", { name: "START PLAYING" });
  await start.hover();
  expect(await start.evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  await start.click();
  await expect(page.locator(".lesson")).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".oled-note-big")).toBeVisible();
  await expect(page.locator(".lesson")).toHaveCount(0);
});

// Plays Field Song from the keys, so some gems are caught and some missed, then stops it
test("stopping a song opens its score card, and Replay misses plays that song again", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /PLAY ALONG/ }).click();
  const keys = ["a", "s", "d", "f", "j", "k", "l", ";"];
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press(keys[i % keys.length]);
    await page.waitForTimeout(110);
  }
  await page.getByRole("button", { name: /STOP SONG/ }).click();

  const card = page.getByRole("dialog", { name: /^\d{6}$/ });
  await expect(card).toBeVisible();
  await expect(card.locator(".lesson-head")).toContainText("Field Song");
  // all 32 beats of the song, not the first 16
  await expect(card.locator(".recap-lamps span")).toHaveCount(32);
  const replay = card.getByRole("button", { name: "REPLAY MISSES" });
  if (await replay.count()) {
    await replay.click();
    await expect(page.getByRole("button", { name: /STOP SONG/ })).toBeVisible();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(card).toHaveCount(0);
});

test("every toolbar button has a key, written on it, that does what the button does", async ({ page }) => {
  await open(page);
  const buttons = page.locator(".topbar-actions .ctrl-btn");
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = buttons.nth(i);
    const key = await b.getAttribute("aria-keyshortcuts");
    expect(key, await b.innerText()).toBeTruthy();
    await expect(b.locator(".key-hint")).toBeVisible();
  }

  for (const [key, label] of [
    ["p", "PLAY RIFF"],
    ["n", "PLAY ALONG"],
    ["i", "PINCH PLAY"],
    ["t", "THEREMIN"],
    ["e", "RECALL"],
    ["q", "QUANTIZE"],
    ["Space", "DRONE"],
  ]) {
    const b = buttons.filter({ hasText: label }).first();
    const before = await b.getAttribute("data-active");
    await page.keyboard.press(key);
    await expect(b, `${key} turns ${label} over`).not.toHaveAttribute("data-active", before ?? "");
    await page.keyboard.press(key);
    await expect(b, `${key} turns ${label} back`).toHaveAttribute("data-active", before ?? "");
  }

  await page.keyboard.press("x");
  await expect(page.getByRole("tab", { name: "EXPERT" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("x");
  await expect(page.getByRole("tab", { name: "SIMPLE" })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("w");
  await expect(page.getByRole("dialog", { name: "Aim, then pinch" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lesson")).toHaveCount(0);
});

test("the page loads with no errors", async ({ page, baseURL }) => {
  const local = !baseURL?.startsWith("https://");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // only Vercel serves /_vercel/insights, so on a local build Web Analytics' script 404s
    if (local && /\/_vercel\/insights\//.test(`${m.text()} ${m.location().url}`)) return;
    errors.push(m.text());
  });
  await open(page);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test("hand tracking downloads only when the camera is turned on", async ({ page }) => {
  const tracking: string[] = [];
  page.on("request", (r) => {
    if (/\/(wasm|models)\//.test(r.url())) tracking.push(r.url());
  });
  await open(page);
  await page.waitForTimeout(2000);
  expect(tracking).toEqual([]);
  await expect(page.getByText("1€ VISION // OFF")).toBeVisible();

  // the fake camera: pressing OPEN CAM loads the runtime and the model, and tracking gets ready
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  await page.getByRole("button", { name: /OPEN CAM/ }).click();
  await expect(page.getByText("1€ VISION // READY")).toBeVisible({ timeout: 45_000 });
  expect(tracking.some((u) => u.endsWith("/models/hand_landmarker.task"))).toBe(true);
  // and from then on the tracker is kept, so hand tracking works offline too
  await expect
    .poll(() =>
      page.evaluate(async () => {
        for (const name of await caches.keys())
          if (await (await caches.open(name)).match("/models/hand_landmarker.task")) return true;
        return false;
      })
    )
    .toBe(true);
});

test("the theremin switch turns height off, is remembered, and toggles with T", async ({ page }) => {
  await open(page);
  const button = theremin(page);
  const width = (await button.boundingBox())!.width;
  await expect(button).toHaveAttribute("aria-pressed", "true");

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".oled-param").first()).toContainText("OFF");
  await expect(e1(page)).toHaveAttribute("aria-disabled", "true");
  // the label swaps without the button changing width, so the toolbar does not jump
  expect((await button.boundingBox())!.width).toBeCloseTo(width, 0);

  await page.reload();
  await expect(theremin(page)).toHaveAttribute("aria-pressed", "false");

  await page.locator("body").press("t");
  await expect(theremin(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".oled-param").first()).toContainText("72");
});

test("the E4 knob sets the reverb from the keyboard", async ({ page }) => {
  await open(page);
  const e4 = page.getByRole("slider", { name: "E4 REVERB" });
  await expect(e4).toHaveAttribute("aria-valuenow", "50");
  const readout = page.locator(".oled-param", { hasText: "REVERB" }).locator("strong");
  const before = Number(await readout.textContent());
  await e4.focus();
  await page.keyboard.press("PageUp");
  await expect(e4).toHaveAttribute("aria-valuenow", "60");
  await expect.poll(async () => Number(await readout.textContent())).toBeGreaterThan(before);
});

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [412, 961],
  [375, 812],
  [320, 568],
] as const) {
  test(`no text is cut at ${width}×${height}, simple and expert`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    expect(await page.evaluate(findCutText)).toEqual([]);
    await page.getByRole("tab", { name: "EXPERT" }).click();
    expect(await page.evaluate(findCutText)).toEqual([]);
  });
}

// The bar at the bottom of the stage: the hint never cut, the controls one height on one line, and all of it
// clear of the white line's notes, upright and sideways
for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1100, 800],
  [1024, 768],
  [375, 667],
  [667, 375],
  [320, 568],
] as const) {
  test(`the stage's bottom bar stays whole and under the white line at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const bar = await page.evaluate(() => {
      const stage = document.querySelector(".stage-viewport")!.getBoundingClientRect();
      const hint = document.querySelector<HTMLElement>(".hud-hint")!;
      const controls = [...document.querySelectorAll<HTMLElement>(".hud-actions .hud-pill")];
      const row = document.querySelector(".stage-bottom-pills")!.getBoundingClientRect();
      const h = stage.height;
      // the white line, as the draw loop places it, and the note names under it (drawn 16px down, and the check allows 3px more)
      const strike = 0.172 * h + 14 + (h - 14 - (0.172 * h + 14)) * 0.78;
      return {
        hintCut: hint.offsetParent !== null && (hint.scrollWidth > hint.clientWidth + 1 || hint.scrollHeight > hint.clientHeight + 1),
        heights: [...new Set(controls.map((c) => Math.round(c.getBoundingClientRect().height)))],
        overflow: Math.max(...controls.map((c) => c.getBoundingClientRect().right)) - row.right,
        clearance: document.querySelector(".stage-bottom")!.getBoundingClientRect().top - (stage.top + strike + 19),
      };
    });
    expect(bar.hintCut).toBe(false);
    expect(bar.heights).toHaveLength(1);
    expect(bar.overflow).toBeLessThanOrEqual(1);
    expect(bar.clearance).toBeGreaterThanOrEqual(0);
  });
}

test("it installs as an app: every icon and screenshot an install needs, and the home-screen settings", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.id).toBe("/");
  expect(manifest.display).toBe("standalone");
  const icons = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes} ${i.purpose ?? "any"}`);
  expect(icons).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
  expect(manifest.screenshots.map((s: { form_factor: string }) => s.form_factor).sort()).toEqual(["narrow", "wide"]);
  for (const { src } of [...manifest.icons, ...manifest.screenshots]) expect((await request.get(src)).status(), src).toBe(200);

  await open(page);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "MANUS");
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
});

test("offline: once opened it opens again, and a mouse player's visit keeps no hand tracker", async ({ page, context }) => {
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const kept = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) paths.push(new URL(r.url).pathname);
    return paths;
  });
  expect(kept).toContain("/");
  expect(kept.some((p) => /^\/(wasm|models)\//.test(p))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".oled-note-big")).toBeVisible();
  await expect(page.locator(".hud-hint")).toBeVisible();
  await context.setOffline(false);
});

// Only Vercel serves the analytics script, so this runs against the live site (E2E_ORIGIN=https://manus.karano.me).
// Vercel serves it from a random path on the site, named in the tag. The script sends no page views from an
// automated browser (it checks navigator.webdriver), so the view itself is checked by hand in a normal browser.
test("visits are counted: the analytics script is added and loads", async ({ page, baseURL }) => {
  test.skip(!baseURL?.startsWith("https://"), "a local build has no analytics script to load");
  await open(page);
  const tag = page.locator('script[data-sdkn^="@vercel/analytics"]');
  await expect(tag).toHaveCount(1, { timeout: 30_000 });
  const src = await tag.getAttribute("src");
  expect(src).toMatch(/^\/.+\/script\.js$/);
  expect((await page.request.get(src!)).status()).toBe(200);
});

test("search engines and language models get what they need", async ({ page, request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toMatch(/^# MANUS/);

  await open(page);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld["@type"]).toBe("WebApplication");
  expect(ld.author["@id"]).toBe("https://karano.me/#person");
  expect(ld.offers.price).toBe("0");
});

test("the Android app's privacy policy has its own page, indexed and in the sitemap", async ({ page, request }) => {
  expect(await (await request.get("/sitemap.xml")).text()).toContain("https://manus.karano.me/android/privacy");

  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto("/android/privacy");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("MANUS for Android: privacy policy");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://manus.karano.me/android/privacy");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MANUS privacy policy");
  await expect(page.getByRole("link", { name: "privacy@karano.me" })).toHaveAttribute("href", "mailto:privacy@karano.me");

  // The console locks the page, so the policy scrolls in its own box, all the way down and never sideways
  const contact = page.getByRole("heading", { name: "Contact" });
  await contact.scrollIntoViewIfNeeded();
  await expect(contact).toBeInViewport();
  const box = await page.locator(".policy").evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(box[0]).toBeLessThanOrEqual(box[1]);
});
