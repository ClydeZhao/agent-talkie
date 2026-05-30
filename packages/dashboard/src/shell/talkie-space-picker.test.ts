// @vitest-environment happy-dom
import { expect, it } from "vitest";
import "./talkie-space-picker.js";

it("shows human labels before implementation slugs in the space list", async () => {
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: {
      spacesList: Array<{
        slug: string;
        label: string;
        status: "active" | "idle";
        memberCount: number;
        ownerSessionId: string | null;
        orchestratorSessionId: string | null;
      }>;
      activeSpaceId: string | null;
      setSpacesList: (rows: unknown[]) => void;
    };
    currentSlug: string;
    open: boolean;
    updateComplete: Promise<unknown>;
  };
  el.currentSlug = "talkie-random-1234";
  el.store = {
    activeSpaceId: "space-id",
    spacesList: [
      {
        slug: "talkie-random-1234",
        label: "Talkie Space 2026-05-01 12:00:00",
        status: "active",
        memberCount: 2,
        ownerSessionId: null,
        orchestratorSessionId: null,
      },
    ],
    setSpacesList: () => {},
  };
  el.open = true;

  document.body.appendChild(el);
  await el.updateComplete;

  const triggerText =
    el.shadowRoot?.querySelector(".trigger")?.textContent ?? "";
  const label = el.shadowRoot?.querySelector(".space-label")?.textContent ?? "";
  const meta = el.shadowRoot?.querySelector(".space-meta")?.textContent ?? "";
  expect(triggerText).toContain("Talkie Space 2026-05-01 12:00:00");
  expect(triggerText).not.toContain("talkie-random-1234");
  expect(label).toContain("Talkie Space 2026-05-01 12:00:00");
  expect(label).not.toContain("talkie-random-1234");
  expect(meta).toContain("talkie-random-1234");

  document.body.removeChild(el);
});

it("does not expose the join prompt or destructive controls for a destroyed active space", async () => {
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: {
      spacesList: unknown[];
      activeSpaceId: string | null;
      setSpacesList: (rows: unknown[]) => void;
    };
    bridge: unknown;
    currentSlug: string;
    destroyedSlug: string | null;
    selfIsOwner: boolean;
    open: boolean;
    updateComplete: Promise<unknown>;
  };
  el.currentSlug = "dead-space";
  el.destroyedSlug = "dead-space";
  el.selfIsOwner = true;
  el.bridge = {};
  el.store = {
    activeSpaceId: null,
    spacesList: [],
    setSpacesList: () => {},
  };
  el.open = true;

  document.body.appendChild(el);
  await el.updateComplete;

  expect(el.shadowRoot?.querySelector(".copy-btn")).toBeNull();
  expect(el.shadowRoot?.querySelector(".archive-btn")).toBeNull();
  expect(el.shadowRoot?.querySelector(".destroy-btn")).toBeNull();

  document.body.removeChild(el);
});

it("does not expose the join prompt or destructive controls for an archived active space", async () => {
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: {
      spacesList: unknown[];
      activeSpaceId: string | null;
      setSpacesList: (rows: unknown[]) => void;
    };
    bridge: unknown;
    currentSlug: string;
    archivedSlug: string | null;
    selfIsOwner: boolean;
    open: boolean;
    updateComplete: Promise<unknown>;
  };
  el.currentSlug = "old-space";
  el.archivedSlug = "old-space";
  el.selfIsOwner = true;
  el.bridge = {};
  el.store = {
    activeSpaceId: null,
    spacesList: [],
    setSpacesList: () => {},
  };
  el.open = true;

  document.body.appendChild(el);
  await el.updateComplete;

  expect(el.shadowRoot?.querySelector(".copy-btn")).toBeNull();
  expect(el.shadowRoot?.querySelector(".archive-btn")).toBeNull();
  expect(el.shadowRoot?.querySelector(".destroy-btn")).toBeNull();

  document.body.removeChild(el);
});
