import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored as is: the MediaPipe runtime and model the stage loads from this origin
    "public/wasm/**",
    "public/models/**",
    // Local worktrees: other checkouts of this repo, with their own builds
  ]),
]);

export default eslintConfig;
