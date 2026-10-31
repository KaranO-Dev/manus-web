/*
  The README banner as a PNG: public/manus-banner.svg drawn by Chromium at 2x (2400 x 680), with the
  app's own fonts from public/fonts, so the words fit the same way on every machine. GitHub shows the
  PNG; the SVG is the master. Run after editing the SVG, then credit the new PNG:

    node scripts/render-banner.mjs && node scripts/credit.mjs
*/
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(join(root, "public/manus-banner.svg"), "utf8").replace(/^<\?xml[^>]*>\s*/, "");
const font = (family, file) =>
  `@font-face { font-family: '${family}'; src: url(file://${join(root, "public/fonts", file)}); }`;

// A file page, so Chromium lets it load the fonts from disk
const dir = mkdtempSync(join(tmpdir(), "manus-banner-"));
const page = join(dir, "banner.html");
writeFileSync(
  page,
  `<style>${font("Mona Sans", "MonaSans-Variable.woff2")} ${font("Monaspace Xenon", "MonaspaceXenon-Variable.woff2")}
  body { margin: 0; } svg { display: block; }</style>${svg}`,
);

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 340 }, deviceScaleFactor: 2 });
  await tab.goto(`file://${page}`);
  const fonts = await tab.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family} ${f.status}`);
  });
  if (fonts.some((f) => !f.endsWith("loaded"))) throw new Error(`fonts did not load: ${fonts.join(", ")}`);
  await tab.locator("svg").first().screenshot({ path: join(root, "public/manus-banner.png"), omitBackground: true });
  console.log("public/manus-banner.png, 2400 x 680");
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
