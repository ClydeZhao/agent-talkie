import { describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_SESSION_PROFILE,
  connectJoinDashboardSession,
  type DashboardSessionStartupBridge,
} from "./dashboard-session-startup.js";

function makeBridge(
  overrides: Partial<DashboardSessionStartupBridge>,
): DashboardSessionStartupBridge {
  return {
    connect: vi.fn(async () => {}),
    resumeFromStorage: vi.fn(async () => null),
    registerNewSession: vi.fn(async () => ({
      sessionId: "fresh-session",
      reconnectSecret: "fresh-secret",
      displayName: "Dashboard",
    })),
    joinSpace: vi.fn(async () => ({
      spaceId: "space-fresh",
      slug: "room-a",
    })),
    clearStoredSessionCredentials: vi.fn(() => {}),
    close: vi.fn(() => {}),
    ...overrides,
  };
}

describe("connectJoinDashboardSession", () => {
  it("uses a dashboard product label for fresh browser sessions", async () => {
    const bridge = makeBridge({});

    await connectJoinDashboardSession(bridge, "room-a");

    expect(bridge.registerNewSession).toHaveBeenCalledWith(
      DASHBOARD_SESSION_PROFILE,
    );
  });

  it("recovers from a stale stored dashboard session by clearing credentials and retrying with a fresh session", async () => {
    const joinSpace = vi
      .fn()
      .mockRejectedValueOnce(new Error('{"error":"already_in_space"}'))
      .mockResolvedValueOnce({ spaceId: "space-fresh", slug: "room-a" });
    const bridge = makeBridge({
      resumeFromStorage: vi.fn(async () => ({
        sessionId: "stale-session",
        reconnectSecret: "rotated-stale-secret",
      })),
      registerNewSession: vi.fn(async () => ({
        sessionId: "fresh-session",
        reconnectSecret: "fresh-secret",
        displayName: "Dashboard",
      })),
      joinSpace,
    });

    const result = await connectJoinDashboardSession(bridge, "room-a");

    expect(result).toEqual({
      selfSessionId: "fresh-session",
      spaceId: "space-fresh",
      slug: "room-a",
      recoveredFromStaleStoredSession: true,
    });
    expect(bridge.clearStoredSessionCredentials).toHaveBeenCalledTimes(1);
    expect(bridge.close).toHaveBeenCalledTimes(1);
    expect(bridge.connect).toHaveBeenCalledTimes(2);
    expect(bridge.registerNewSession).toHaveBeenCalledTimes(1);
    expect(joinSpace).toHaveBeenCalledTimes(2);
    expect(joinSpace).toHaveBeenNthCalledWith(1, {
      slug: "room-a",
      idempotencyKey: expect.any(String),
    });
    expect(joinSpace).toHaveBeenNthCalledWith(2, {
      slug: "room-a",
      idempotencyKey: expect.any(String),
    });
  });

  it("reconnects once when fresh registration follows a failed stored-session resume on a bad socket", async () => {
    const registerNewSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("WebSocket is not open"))
      .mockResolvedValueOnce({
        sessionId: "fresh-session",
        reconnectSecret: "fresh-secret",
        displayName: "Dashboard",
      });
    const bridge = makeBridge({
      resumeFromStorage: vi.fn(async () => null),
      registerNewSession,
    });

    const result = await connectJoinDashboardSession(bridge, "room-a");

    expect(result.selfSessionId).toBe("fresh-session");
    expect(bridge.clearStoredSessionCredentials).toHaveBeenCalledTimes(1);
    expect(bridge.close).toHaveBeenCalledTimes(1);
    expect(bridge.connect).toHaveBeenCalledTimes(2);
    expect(registerNewSession).toHaveBeenCalledTimes(2);
  });

  it("does not replace a resumed session for non-recoverable join errors", async () => {
    const joinError = new Error('{"error":"space_archived"}');
    const bridge = makeBridge({
      resumeFromStorage: vi.fn(async () => ({
        sessionId: "resumed-session",
        reconnectSecret: "rotated-secret",
      })),
      joinSpace: vi.fn(async () => {
        throw joinError;
      }),
    });

    await expect(
      connectJoinDashboardSession(bridge, "room-a"),
    ).rejects.toThrow(joinError);

    expect(bridge.clearStoredSessionCredentials).not.toHaveBeenCalled();
    expect(bridge.registerNewSession).not.toHaveBeenCalled();
    expect(bridge.connect).toHaveBeenCalledTimes(1);
    expect(bridge.close).toHaveBeenCalledTimes(1);
  });
});
