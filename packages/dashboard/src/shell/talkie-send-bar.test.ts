// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";

import type { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import { DashboardStore } from "../store/dashboard-store.js";
import "./talkie-send-bar.js";

function bridgeStub(): BrowserSessionBridge {
  return {
    getConnectionHealth: () => "connected",
    getNegotiatedEnvelopeVersion: () => 1,
    getRegisteredSessionId: () => uuidv7(),
    onConnectionHealthChange: () => () => {},
    sendConversationWithRetryTracking: vi.fn(),
  } as unknown as BrowserSessionBridge;
}

describe("TalkieSendBar", () => {
  it("labels the default composer as orchestrator discussion without exposing To routing", async () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const orchestratorId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "room",
        label: "Room",
        status: "active",
        ownerSessionId: null,
        orchestratorSessionId: orchestratorId,
        memberCount: 1,
        members: [
          {
            sessionId: orchestratorId,
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

    const el = document.createElement("talkie-send-bar");
    (el as any).store = store;
    (el as any).bridge = bridgeStub();
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("Orchestrator discussion");
    expect(text).not.toContain("To:");

    document.body.removeChild(el);
  });

  it("labels selected participant composer as a private chat", async () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const participantId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "room",
        label: "Room",
        status: "active",
        ownerSessionId: null,
        orchestratorSessionId: null,
        memberCount: 1,
        members: [
          {
            sessionId: participantId,
            displayName: "Worker",
            isHuman: false,
            role: "worker",
            focus: "",
            progress: "idle",
            blockedReason: null,
            runtime: "cursor",
            workspaceLabel: "repo",
          },
        ],
      },
      uuidv7(),
    );
    store.setSendTargetSession(participantId);

    const el = document.createElement("talkie-send-bar");
    (el as any).store = store;
    (el as any).bridge = bridgeStub();
    document.body.appendChild(el);
    await (el as any).updateComplete;

    expect(el.shadowRoot?.textContent).toContain("Private chat with Worker");

    document.body.removeChild(el);
  });

  it("warns when the orchestrator is offline and messages will be queued", async () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const orchestratorId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "room",
        label: "Room",
        status: "active",
        ownerSessionId: null,
        orchestratorSessionId: orchestratorId,
        memberCount: 1,
        members: [
          {
            sessionId: orchestratorId,
            displayName: "Codex CLI",
            isHuman: false,
            role: "orchestrator",
            focus: "",
            progress: "idle",
            blockedReason: null,
            runtime: "codex-cli",
            workspaceLabel: "repo",
            presenceState: "offline",
          },
        ],
      },
      uuidv7(),
    );

    const el = document.createElement("talkie-send-bar");
    (el as any).store = store;
    (el as any).bridge = bridgeStub();
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("orchestrator is offline");
    expect(text).toContain("messages are queued until that runtime checks Talkie");

    document.body.removeChild(el);
  });
});
