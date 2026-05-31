// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { DashboardStore } from "../store/dashboard-store.js";
import "./talkie-console-status.js";

describe("TalkieConsoleStatus", () => {
  it("shows the selected private participant as the send target", async () => {
    const store = new DashboardStore();
    const spaceId = uuidv7();
    const leadId = uuidv7();
    const workerId = uuidv7();
    store.setActiveSpaceId(spaceId);
    store.hydrateFromSpaceSummary(
      {
        spaceId,
        slug: "room",
        label: "Room",
        status: "active",
        ownerSessionId: null,
        orchestratorSessionId: leadId,
        memberCount: 2,
        members: [
          {
            sessionId: leadId,
            displayName: "Lead Runtime",
            isHuman: false,
            role: "orchestrator",
            focus: "",
            progress: "working",
            blockedReason: null,
            runtime: "claude-code",
            workspaceLabel: "repo",
          },
          {
            sessionId: workerId,
            displayName: "Worker Runtime",
            isHuman: false,
            role: "worker",
            focus: "",
            progress: "idle",
            blockedReason: null,
            runtime: "codex-cli",
            workspaceLabel: "repo",
          },
        ],
      },
      uuidv7(),
    );
    store.setSendTargetSession(workerId);

    const el = document.createElement("talkie-console-status");
    (el as any).store = store;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const sendTarget = el.shadowRoot?.querySelectorAll(".item")[2];
    expect(sendTarget?.textContent).toContain("Send Target");
    expect(sendTarget?.textContent).toContain("Worker Runtime");
    expect(sendTarget?.textContent).not.toContain("Lead Runtime");

    document.body.removeChild(el);
  });
});
