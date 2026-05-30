import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  external: [
    "better-sqlite3",
    "@agent-talkie/persistence",
    "@agent-talkie/client",
    "@agent-talkie/supervisor",
  ],
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
