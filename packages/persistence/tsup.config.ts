import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // ESM only: migrate() resolves migrations via import.meta.url; a CJS bundle
  // would leave import.meta empty and break path resolution.
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
