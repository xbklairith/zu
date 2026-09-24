/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The export may load nothing (decision 0006): scripts and styles are inlined
// by viteSingleFile and this policy forbids every fetch. Build only, so dev
// keeps HMR. public/.gitkeep is still copied through, so dist/ is never empty.
const csp: Plugin = {
  name: "zu-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; worker-src blob:; base-uri 'none'; form-action 'none'",
      },
      injectTo: "head-prepend",
    },
  ],
};

export default defineConfig({
  plugins: [react(), viteSingleFile(), csp],
  build: { outDir: "dist", emptyOutDir: true },
  // ELK's worker is built as a classic script and inlined as a blob: URL.
  worker: { format: "iife" },
  // Dev mode reads the Go golden View from internal/export/testdata.
  server: { fs: { allow: [".."] } },
  // css: styles.test.ts reads styles.css?raw (08); vitest empties CSS otherwise.
  test: { environment: "node", include: ["src/**/*.test.ts"], css: true },
});
