// @vitest-environment happy-dom
import type { Envelope } from "@agent-talkie/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import type { CollaborationMetadataWire } from "../bridge/wire-schemas.js";
import { DashboardStore } from "./dashboard-store.js";

function makeEnvelope(
  spaceId: string,
  kind: "control" | "conversation",
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
): Envelope {
  return {
    version: 1,
    id: uuidv4(),
    sessionId,
    kind,
    type,
    payload,
    spaceId,
  };
}

describe("DashboardStore space destroy lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("noteSpaceDestroyed sets spaceDestroyedSlug and notifies", () => {
    const store = new DashboardStore();
    const spy = vi.fn();
    store.addListener(spy);
    store.noteSpaceDestroyed("my-space");
    expect(store.spaceDestroyedSlug).toBe("my-space");
    expect(spy).toHaveBeenCalled();
  });

  it("stopSnapshotRefresh clears the polling timer", () => {
    vi.useFakeTimers();
    const store = new DashboardStore();
    const fetcher = vi.fn(async () => {});
    store.scheduleSnapshotRefresh(fetcher, 5000);

    vi.advanceTimersByTime(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);

    store.stopSnapshotRefresh();
    vi.advanceTimersByTime(15000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

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

describe("DashboardStore transcript visibility (MiniSearch + filters)", () => {
  it('getVisibleTranscriptLines filters out control when kind is "conversation"', () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const sessionId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceId, "control", sessionId, "x", { t: "a" }),
    );
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceId, "conversation", sessionId, "x", { t: "b" }),
    );
    expect(store.getVisibleTranscriptLines().length).toBe(2);
    store.setTranscriptFilters({ kind: "conversation" });
    const vis = store.getVisibleTranscriptLines();
    expect(vis.length).toBe(1);
    expect(vis[0].envelope.kind).toBe("conversation");
  });

  it("MiniSearch: switching space clears the index (no hit for prior dedupeKey)", () => {
    const store = new DashboardStore();
    const spaceA = uuidv7();
    const spaceB = uuidv7();
    const sessionId = uuidv7();
    store.setActiveSpaceId(spaceA);
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceA, "conversation", sessionId, "user.msg", {
        zyxUniqueIndexToken: "q1",
      }),
    );
    store.setTranscriptSearchQuery("zyxUniqueIndexToken");
    expect(store.getVisibleTranscriptLines().length).toBe(1);
    store.setActiveSpaceId(spaceB);
    expect(store.transcriptLines.length).toBe(0);
    expect(store.getVisibleTranscriptLines().length).toBe(0);
  });

  it("MiniSearch: query AND kind filter; order matches transcript order", () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const s1 = uuidv7();
    const s2 = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceId, "conversation", s1, "m", { body: "alphaTokenZ" }),
    );
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceId, "control", s2, "m", { body: "alphaTokenZ" }),
    );
    store.appendTranscriptEnvelope(
      makeEnvelope(spaceId, "conversation", s1, "m", { body: "beta" }),
    );
    store.setTranscriptSearchQuery("alphaTokenZ");
    let vis = store.getVisibleTranscriptLines();
    expect(vis.length).toBe(2);
    expect(vis[0].envelope.sessionId).toBe(s1);
    expect(vis[1].envelope.sessionId).toBe(s2);
    store.setTranscriptFilters({ kind: "conversation" });
    vis = store.getVisibleTranscriptLines();
    expect(vis.length).toBe(1);
    expect(vis[0].envelope.sessionId).toBe(s1);
    expect(vis[0].envelope.kind).toBe("conversation");
  });
});
