/*
  The screenshots an install sheet shows (public/pwa), made from a running production build:
    npm run build && npm run start -- --port 3322
    node scripts/pwa-screenshots.mjs [origin]
  The wide one is a laptop at 1440×900, the narrow one a phone at 390×844 at 2x (780×1688). The first-visit
  lesson is marked as seen, so the stage shows. Each carries the author's credit (scripts/credit.mjs).
*/
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { CREDITED, creditFile } from "./credit.mjs";

const origin = process.argv[2] ?? "http://127.0.0.1:3322";
const shots = [
  { file: "public/pwa/screen-wide.webp", viewport: { width: 1440, height: 900 }, scale: 1 },
  { file: "public/pwa/screen-narrow.webp", viewport: { width: 390, height: 844 }, scale: 2 },
];

await mkdir("public/pwa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const { file, viewport, scale } of shots) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await context.addInitScript(() => localStorage.setItem("manus.lesson.seen", "1"));
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 82 }).toFile(file);
  creditFile(file, CREDITED.find(([credited]) => credited === file)[1]);
  console.log(file);
  await context.close();
}
await browser.close();
