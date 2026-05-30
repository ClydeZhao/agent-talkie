import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/__agent-talkie": {
        target: "http://127.0.0.1:18765",
        changeOrigin: true,
      },
    },
  },
});
