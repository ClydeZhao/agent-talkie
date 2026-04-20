// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";

import type { CollaborationMetadataWire } from "../bridge/wire-schemas.js";
import { DashboardStore } from "./dashboard-store.js";

describe("DashboardStore collaboration metadata", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges collaboration.metadata profile patch for the active space", async () => {
    vi.useFakeTimers();
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const agentId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "dashboard",
        ownerSessionId: null,
        orchestratorSessionId: null,
        memberCount: 1,
        members: [
          {
            sessionId: agentId,
            displayName: "Agent",
            isHuman: false,
            role: "",
            focus: "",
            progress: "idle",
            blockedReason: null,
            runtime: "cli",
            workspaceLabel: "repo",
          },
        ],
      },
      uuidv7(),
    );

    const msg: CollaborationMetadataWire = {
      type: "collaboration.metadata",
      spaceId,
      sessionId: agentId,
      namespace: "profile",
      patch: { role: "worker", focus: "task-a" },
      updatedAt: Date.now(),
    };
    store.applyCollaborationMetadataWire(msg);
    vi.runAllTimers();
    const row = store.roster.get(agentId);
    expect(row?.role).toBe("worker");
    expect(row?.focus).toBe("task-a");
  });

  it("ignores collaboration.metadata for a different space", () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const otherSpace = uuidv7();
    const agentId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "dashboard",
        ownerSessionId: null,
        orchestratorSessionId: null,
        memberCount: 1,
        members: [
          {
            sessionId: agentId,
            displayName: "Agent",
            isHuman: false,
            role: "",
            focus: "",
            progress: "idle",
            blockedReason: null,
            runtime: "cli",
            workspaceLabel: "repo",
          },
        ],
      },
      uuidv7(),
    );

    store.applyCollaborationMetadataWire({
      type: "collaboration.metadata",
      spaceId: otherSpace,
      sessionId: agentId,
      namespace: "profile",
      patch: { role: "x" },
      updatedAt: Date.now(),
    });
    expect(store.roster.get(agentId)?.role).toBe("");
  });
});
