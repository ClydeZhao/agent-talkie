import { describe, expect, it, vi } from "vitest";

import { scheduleRelayStopStatusRefreshes } from "./relay-status-refresh.js";

describe("scheduleRelayStopStatusRefreshes", () => {
  it("refreshes once immediately and once after the stop can settle", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();

    scheduleRelayStopStatusRefreshes(refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1499);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
