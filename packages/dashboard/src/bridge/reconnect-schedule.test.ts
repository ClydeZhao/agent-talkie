import { afterEach, describe, expect, it, vi } from "vitest";
import { nextReconnectDelayMs } from "./reconnect-schedule.js";

describe("nextReconnectDelayMs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses base delay without jitter when random is 0, caps at 30000", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(nextReconnectDelayMs(0)).toBe(1000);
    expect(nextReconnectDelayMs(1)).toBe(2000);
    expect(nextReconnectDelayMs(5)).toBe(30000);
  });

  it("adds up to 300ms jitter when random is near 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(nextReconnectDelayMs(0)).toBe(1300);
  });
});
