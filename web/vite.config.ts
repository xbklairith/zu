import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Output lands in dist/, which Go embeds (see embed.go). public/.gitkeep is
// copied through so dist/ is never empty and `go build` works before a UI build.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
