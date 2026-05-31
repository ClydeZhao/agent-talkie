// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { DashboardStore } from "../store/dashboard-store.js";
import "./talkie-space-picker.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

it("marks unusable active spaces with actionability state in the space list", async () => {
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: {
      spacesList: Array<{
        slug: string;
        label: string;
        status: "active" | "idle";
        memberCount: number;
        ownerSessionId: string | null;
        orchestratorSessionId: string | null;
        actionability: {
          state: "blocked" | "manual-pull";
          reason: "no_orchestrator" | "orchestrator_manual_pull";
          label: string;
          detail: string;
        };
      }>;
      activeSpaceId: string | null;
      setSpacesList: (rows: unknown[]) => void;
    };
    currentSlug: string;
    open: boolean;
    updateComplete: Promise<unknown>;
  };
  el.currentSlug = "healthy-room";
  el.store = {
    activeSpaceId: "space-id",
    spacesList: [
      {
        slug: "codex-lead",
        label: "Codex lead",
        status: "active",
        memberCount: 1,
        ownerSessionId: null,
        orchestratorSessionId: "codex-session",
        actionability: {
          state: "manual-pull",
          reason: "orchestrator_manual_pull",
          label: "Manual pull",
          detail: "The orchestrator is pull-based and will receive messages on its next pull.",
        },
      },
      {
        slug: "missing-lead",
        label: "Missing lead",
        status: "active",
        memberCount: 2,
        ownerSessionId: null,
        orchestratorSessionId: null,
        actionability: {
          state: "blocked",
          reason: "no_orchestrator",
          label: "No orchestrator",
          detail: "Default dashboard messages need an orchestrator target.",
        },
      },
    ],
    setSpacesList: () => {},
  };
  el.open = true;

  document.body.appendChild(el);
  await el.updateComplete;

  const metas = Array.from(el.shadowRoot?.querySelectorAll(".space-meta") ?? []).map(
    (node) => node.textContent ?? "",
  );
  const rows = Array.from(el.shadowRoot?.querySelectorAll(".row") ?? []);
  expect(metas[0]).toContain("Manual pull");
  expect(rows[0]?.classList.contains("row--blocked")).toBe(false);
  expect(metas[1]).toContain("No orchestrator");
  expect(rows[1]?.classList.contains("row--blocked")).toBe(true);

  document.body.removeChild(el);
});

it("renders active spaces fetched after the picker opens", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      json: async () => [
        {
          slug: "missing-lead",
          label: "Missing lead",
          status: "active",
          memberCount: 1,
          ownerSessionId: null,
          orchestratorSessionId: null,
          actionability: {
            state: "blocked",
            reason: "no_orchestrator",
            label: "No orchestrator",
            detail: "Default dashboard messages need an orchestrator target.",
          },
        },
      ],
    })),
  );
  const store = new DashboardStore();
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: DashboardStore;
    httpOrigin: string;
    currentSlug: string;
    updateComplete: Promise<unknown>;
  };
  el.store = store;
  el.httpOrigin = "http://relay.test";
  el.currentSlug = "current";

  document.body.appendChild(el);
  await el.updateComplete;
  el.shadowRoot
    ?.querySelector<HTMLButtonElement>(".trigger")
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  await vi.waitFor(() => {
    expect(el.shadowRoot?.textContent).toContain("Missing lead");
    expect(el.shadowRoot?.textContent).toContain("No orchestrator");
  });

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

it("creates a generated space without requiring the user to invent a slug", async () => {
  const open = vi.fn();
  vi.stubGlobal("open", open);
  const el = document.createElement("talkie-space-picker") as HTMLElement & {
    store: {
      spacesList: unknown[];
      activeSpaceId: string | null;
      setSpacesList: (rows: unknown[]) => void;
    };
    currentSlug: string;
    open: boolean;
    updateComplete: Promise<unknown>;
  };
  el.currentSlug = "current-space";
  el.store = {
    activeSpaceId: "space-id",
    spacesList: [],
    setSpacesList: () => {},
  };
  el.open = true;

  document.body.appendChild(el);
  await el.updateComplete;

  const create = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent?.includes("Create new space"),
  );
  create?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

  expect(open).toHaveBeenCalledTimes(1);
  const [rawUrl, target] = open.mock.calls[0]!;
  expect(target).toBe("_self");
  const url = new URL(String(rawUrl));
  expect(url.pathname).toBe("/dashboard");
  expect(url.searchParams.get("space")).toMatch(/^talkie-[a-z0-9]+-[a-z0-9-]+$/);
  expect(url.searchParams.get("label")).toMatch(/^Talkie Space /);

  document.body.removeChild(el);
});
