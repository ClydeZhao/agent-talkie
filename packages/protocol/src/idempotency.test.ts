import { describe, expect, it } from "vitest";
import { createIdempotencyGuard } from "./idempotency.js";

describe("createIdempotencyGuard", () => {
  it("does not invoke fn twice for the same key", () => {
    let count = 0;
    const guard = createIdempotencyGuard();
    const fn = () => {
      count += 1;
      return 42;
    };
    expect(guard.run("k1", fn)).toBe(42);
    expect(guard.run("k1", fn)).toBe(42);
    expect(count).toBe(1);
  });
});
