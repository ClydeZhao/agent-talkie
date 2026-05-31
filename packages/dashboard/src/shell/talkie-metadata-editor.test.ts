// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { RosterRow } from "../store/dashboard-store.js";
import "./talkie-metadata-editor.js";

function row(): RosterRow {
  return {
    sessionId: "019e7a06-0000-7000-8000-000000000001",
    displayName: "Worker",
    isHuman: false,
    role: "worker",
    focus: "api",
    progress: "idle",
    blockedReason: "",
    runtime: "codex-cli",
    workspaceLabel: "repo",
    owner: false,
    orchestrator: false,
    presenceState: "online",
    lastSeenAtMs: 1_780_000_000_000,
    inboxMode: "pull",
  };
}

it("sends profile and status metadata patches for the selected participant", async () => {
  const bridge = {
    getNegotiatedEnvelopeVersion: () => 1,
    getRegisteredSessionId: () => "019e7a06-0000-7000-8000-000000000002",
    sendEnvelope: vi.fn(),
  };
  const el = document.createElement("talkie-metadata-editor");
  (el as any).bridge = bridge;
  (el as any).spaceId = "019e7a06-0000-7000-8000-000000000003";
  (el as any).row = row();
  (el as any).open = true;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const root = el.shadowRoot!;
  (root.querySelector("input[name='role']") as HTMLInputElement).value =
    "reviewer";
  (root.querySelector("input[name='focus']") as HTMLInputElement).value =
    "review auth";
  (root.querySelector("select[name='progress']") as HTMLSelectElement).value =
    "blocked";
  (
    root.querySelector("textarea[name='blockedReason']") as HTMLTextAreaElement
  ).value = "needs human approval";
  root
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  expect(bridge.sendEnvelope).toHaveBeenCalledTimes(2);
  expect(bridge.sendEnvelope).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: "metadata.patch",
      payload: {
        namespace: "profile",
        targetSessionId: "019e7a06-0000-7000-8000-000000000001",
        patch: { role: "reviewer", focus: "review auth" },
      },
    }),
  );
  expect(bridge.sendEnvelope).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: "metadata.patch",
      payload: {
        namespace: "status",
        targetSessionId: "019e7a06-0000-7000-8000-000000000001",
        patch: {
          progress: "blocked",
          blockedReason: "needs human approval",
        },
      },
    }),
  );

  document.body.removeChild(el);
});
