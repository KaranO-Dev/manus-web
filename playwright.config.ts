import { defineConfig } from "@playwright/test";

/*
  Browser smoke tests (tests/e2e), against a production build:
    npm run build && npm run start -- --port 3322
    npm run test:e2e
  They drive the installed Google Chrome (no browser download), with WebGL in software so the stage runs
  headless, and a fake camera so the hand-tracking path runs too. E2E_ORIGIN points them elsewhere, for
  example at https://manus.karano.me after a deploy.
*/
const origin = process.env.E2E_ORIGIN ?? "http://127.0.0.1:3322";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: origin,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
});
