import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ["src/mcp-server.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    banner: {
      js: "#!/usr/bin/env node\n",
    },
  },
]);
