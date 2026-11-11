import { defineConfig } from "@playwright/test";

/*
  Tests that run in Node, with no browser and no build (tests/unit): the gesture rules, the camera fit, the
  stem stretch, the image credits. `npm run test:unit`.
*/
export default defineConfig({
  testDir: "tests/unit",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
});
