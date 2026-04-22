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
