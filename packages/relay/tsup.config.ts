import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/daemon.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Keep daemon entry self-contained so import.meta.url matches dist/daemon.js at runtime.
  splitting: false,
});
