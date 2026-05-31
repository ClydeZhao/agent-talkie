// @vitest-environment happy-dom
import { expect, it } from "vitest";
import type { RosterRow } from "../store/dashboard-store.js";
import "./talkie-roster-entry.js";

function blockedRow(reason: string): RosterRow {
  return {
    sessionId: "s-blocked",
    displayName: "TestAgent",
    isHuman: false,
    role: "",
    focus: "",
    progress: "blocked",
    blockedReason: reason,
    runtime: "cli",
    workspaceLabel: "repo",
    owner: false,
    orchestrator: false,
    presenceState: "online",
    lastSeenAtMs: 1_700_000_000_000,
  };
}

it("renders blockedReason as visible DOM text when progress=blocked", async () => {
  const el = document.createElement("talkie-roster-entry");
  (el as any).row = blockedRow("waiting for human approval");
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const reasonEl = el.shadowRoot?.querySelector(".blocked-reason");
  expect(reasonEl).toBeTruthy();
  expect(reasonEl?.textContent).toContain("waiting for human approval");

  document.body.removeChild(el);
});

it("hides blockedReason element when blockedReason is empty", async () => {
  const el = document.createElement("talkie-roster-entry");
  (el as any).row = blockedRow("");
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const reasonEl = el.shadowRoot?.querySelector(".blocked-reason");
  expect(reasonEl).toBeNull();

  document.body.removeChild(el);
});

it("hides blockedReason element when progress is not blocked", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("some reason");
  row.progress = "working";
  (el as any).row = row;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const reasonEl = el.shadowRoot?.querySelector(".blocked-reason");
  expect(reasonEl).toBeNull();

  document.body.removeChild(el);
});

it("renders presence state separately from progress", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.progress = "idle";
  row.presenceState = "stale";
  (el as any).row = row;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const presenceEl = el.shadowRoot?.querySelector(".presence-label");
  expect(presenceEl?.textContent).toContain("stale");

  document.body.removeChild(el);
});

it("renders last activity time for roster rows", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.lastSeenAtMs = Date.UTC(2026, 4, 2, 9, 8, 7);
  (el as any).row = row;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const lastSeenEl = el.shadowRoot?.querySelector(".last-seen");
  expect(lastSeenEl?.textContent).toContain("Last seen 09:08:07Z");

  document.body.removeChild(el);
});

it("selects a participant for private intervention when the row is clicked", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.sessionId = "worker-session";
  row.displayName = "Worker";
  (el as any).row = row;
  const selected = new Promise<string>((resolve) => {
    el.addEventListener("talkie-select-send-target", (ev) => {
      resolve((ev as CustomEvent<{ sessionId: string }>).detail.sessionId);
    });
  });
  document.body.appendChild(el);
  await (el as any).updateComplete;

  el.shadowRoot
    ?.querySelector<HTMLElement>(".row-main")
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

  await expect(selected).resolves.toBe("worker-session");
  document.body.removeChild(el);
});

it("uses a native button for the participant private intervention target", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.sessionId = "worker-session";
  row.displayName = "Worker";
  (el as any).row = row;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const target = el.shadowRoot?.querySelector(".row-main");
  expect(target?.tagName).toBe("BUTTON");
  expect(target?.getAttribute("type")).toBe("button");

  document.body.removeChild(el);
});

it("labels stale owner cleanup action explicitly", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.presenceState = "stale";
  row.sessionId = "stale-agent";
  (el as any).row = row;
  (el as any).selfIsOwner = true;
  (el as any).selfSessionId = "owner";
  document.body.appendChild(el);
  await (el as any).updateComplete;

  expect(el.shadowRoot?.textContent).toContain("Clear stale participant");

  document.body.removeChild(el);
});

it("dispatches metadata edit from the owner menu", async () => {
  const el = document.createElement("talkie-roster-entry");
  const row = blockedRow("");
  row.sessionId = "worker-session";
  (el as any).row = row;
  (el as any).selfIsOwner = true;
  (el as any).selfSessionId = "owner";
  const edited = new Promise<string>((resolve) => {
    el.addEventListener("talkie-metadata-edit", (ev) => {
      resolve((ev as CustomEvent<{ sessionId: string }>).detail.sessionId);
    });
  });
  document.body.appendChild(el);
  await (el as any).updateComplete;

  el.shadowRoot
    ?.querySelector<HTMLButtonElement>("button.metadata-edit")
    ?.click();

  await expect(edited).resolves.toBe("worker-session");
  document.body.removeChild(el);
});
