import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: ".",
  base: "/dashboard/",
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
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
