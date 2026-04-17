import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist", emptyOutDir: true },
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
