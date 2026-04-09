import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/protocol/src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
