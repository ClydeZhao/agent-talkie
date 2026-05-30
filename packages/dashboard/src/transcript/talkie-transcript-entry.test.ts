// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import { DashboardStore, type TranscriptLine } from "../store/dashboard-store.js";
import "./talkie-transcript-entry.js";

describe("TalkieTranscriptEntry", () => {
  it("renders chat messages as readable conversation rows without raw routing fields", async () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const senderId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "room",
        label: "Room",
        status: "active",
        ownerSessionId: null,
        orchestratorSessionId: senderId,
        memberCount: 1,
        members: [
          {
            sessionId: senderId,
            displayName: "Lead",
            isHuman: false,
            role: "orchestrator",
            focus: "",
            progress: "working",
            blockedReason: null,
            runtime: "codex",
            workspaceLabel: "repo",
          },
        ],
      },
      uuidv7(),
    );
    const line: TranscriptLine = {
      dedupeKey: "x",
      receivedAtMs: 1_700_000_000_000,
      envelope: {
        version: 1,
        id: uuidv4(),
        sessionId: senderId,
        kind: "conversation",
        type: "chat.message",
        payload: { text: "Plan is ready" },
        spaceId,
      },
    };

    const el = document.createElement("talkie-transcript-entry");
    (el as any).line = line;
    (el as any).store = store;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const visibleText = [
      el.shadowRoot?.querySelector(".meta")?.textContent ?? "",
      el.shadowRoot?.querySelector(".body")?.textContent ?? "",
    ].join("\n");
    expect(visibleText).toContain("Lead");
    expect(visibleText).toContain("Plan is ready");
    expect(visibleText).not.toContain("conversation / chat.message");
    expect(visibleText).not.toContain(senderId);
    expect(el.shadowRoot?.querySelector("details")).toBeTruthy();

    document.body.removeChild(el);
  });

  it("renders control envelopes as lightweight system events", async () => {
    const store = new DashboardStore();
    const senderId = uuidv7();
    const line: TranscriptLine = {
      dedupeKey: "x",
      receivedAtMs: 1_700_000_000_000,
      envelope: {
        version: 1,
        id: uuidv4(),
        sessionId: senderId,
        kind: "control",
        type: "space.join",
        payload: { slug: "room" },
      },
    };

    const el = document.createElement("talkie-transcript-entry");
    (el as any).line = line;
    (el as any).store = store;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    expect(el.shadowRoot?.textContent).toContain("joined the space");
    expect(el.shadowRoot?.textContent).not.toContain("control / space.join");

    document.body.removeChild(el);
  });

  it("renders archive control envelopes as explicit system events", async () => {
    const store = new DashboardStore();
    const senderId = uuidv7();
    const line: TranscriptLine = {
      dedupeKey: "archive",
      receivedAtMs: 1_700_000_000_000,
      envelope: {
        version: 1,
        id: uuidv4(),
        sessionId: senderId,
        kind: "control",
        type: "space.archive",
        payload: { slug: "room" },
      },
    };

    const el = document.createElement("talkie-transcript-entry");
    (el as any).line = line;
    (el as any).store = store;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    expect(el.shadowRoot?.textContent).toContain("archived the space");

    document.body.removeChild(el);
  });

  it("renders blocked metadata as an explicit system event", async () => {
    const store = new DashboardStore();
    const senderId = uuidv7();
    store.roster.set(senderId, {
      sessionId: senderId,
      displayName: "Codex",
      isHuman: false,
      role: "",
      focus: "",
      progress: "blocked",
      blockedReason: "needs approval",
      runtime: "codex",
      workspaceLabel: "repo",
      owner: false,
      orchestrator: true,
      presenceState: "online",
      lastSeenAtMs: null,
    });
    const line: TranscriptLine = {
      dedupeKey: "blocked",
      receivedAtMs: 1_700_000_000_000,
      envelope: {
        version: 1,
        id: uuidv4(),
        sessionId: senderId,
        kind: "control",
        type: "metadata.patch",
        payload: {
          namespace: "status",
          patch: { progress: "blocked", blockedReason: "needs approval" },
        },
      },
    };

    const el = document.createElement("talkie-transcript-entry");
    (el as any).line = line;
    (el as any).store = store;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("Codex is blocked");
    expect(text).toContain("needs approval");

    document.body.removeChild(el);
  });
});
