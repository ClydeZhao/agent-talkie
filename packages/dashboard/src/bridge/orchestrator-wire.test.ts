import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { BrowserSessionBridge } from "./browser-session-bridge.js";
import {
  collaborationOrchestratorWireSchema,
  orchestratorClearedWireSchema,
  orchestratorDesignatedWireSchema,
} from "./wire-schemas.js";
import { DashboardStore, type RosterRow } from "../store/dashboard-store.js";

const OPEN = 1;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = OPEN;
  url: string;
  sent: string[] = [];
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  simulateInbound(payload: unknown): void {
    const ev = { data: JSON.stringify(payload) } as MessageEvent;
    this.onmessage?.(ev);
  }

  close(): void {
    this.readyState = 3;
  }
}

let lastMockSocket: MockWebSocket | null = null;

function baseRow(
  sessionId: string,
  overrides: Partial<RosterRow> = {},
): RosterRow {
  return {
    sessionId,
    displayName: "x",
    isHuman: false,
    runtime: "",
    workspaceLabel: "",
    orchestrator: false,
    owner: false,
    role: "",
    focus: "",
    progress: "idle",
    blockedReason: "",
    ...overrides,
  };
}

describe("orchestrator roster wire", () => {
  describe("zod schemas", () => {
    it("parses orchestrator.designated", () => {
      const spaceId = randomUUID();
      const orch = randomUUID();
      const r = orchestratorDesignatedWireSchema.safeParse({
        type: "orchestrator.designated",
        spaceId,
        orchestratorSessionId: orch,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.orchestratorSessionId).toBe(orch);
      }
    });

    it("parses orchestrator.cleared", () => {
      const spaceId = randomUUID();
      const r = orchestratorClearedWireSchema.safeParse({
        type: "orchestrator.cleared",
        spaceId,
      });
      expect(r.success).toBe(true);
    });

    it("parses collaboration.orchestrator with null", () => {
      const spaceId = randomUUID();
      const r = collaborationOrchestratorWireSchema.safeParse({
        type: "collaboration.orchestrator",
        spaceId,
        orchestratorSessionId: null,
      });
      expect(r.success).toBe(true);
    });
  });

  describe("DashboardStore.syncOrchestratorFromRelay", () => {
    it("sets exactly one orchestrator row when session id matches", () => {
      const store = new DashboardStore();
      const space = randomUUID();
      const a = randomUUID();
      const b = randomUUID();
      store.activeSpaceId = space;
      store.roster.set(a, baseRow(a, { orchestrator: false }));
      store.roster.set(b, baseRow(b, { orchestrator: true }));

      store.syncOrchestratorFromRelay(space, a);

      expect(store.roster.get(a)!.orchestrator).toBe(true);
      expect(store.roster.get(b)!.orchestrator).toBe(false);
    });

    it("clears all orchestrator flags when session id is null", () => {
      const store = new DashboardStore();
      const space = randomUUID();
      const a = randomUUID();
      store.activeSpaceId = space;
      store.roster.set(a, baseRow(a, { orchestrator: true }));

      store.syncOrchestratorFromRelay(space, null);

      expect(store.roster.get(a)!.orchestrator).toBe(false);
    });

    it("no-ops when spaceId !== activeSpaceId", () => {
      const store = new DashboardStore();
      const space = randomUUID();
      const other = randomUUID();
      const a = randomUUID();
      store.activeSpaceId = space;
      store.roster.set(a, baseRow(a, { orchestrator: false }));

      store.syncOrchestratorFromRelay(other, a);

      expect(store.roster.get(a)!.orchestrator).toBe(false);
    });
  });

  describe("BrowserSessionBridge orchestrator wire dispatch", () => {
    beforeEach(() => {
      lastMockSocket = null;
      const Ctor = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          lastMockSocket = this;
        }
      };
      vi.stubGlobal("WebSocket", Ctor as unknown as typeof WebSocket);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("invokes onOrchestratorRosterWire after join completes", async () => {
      const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
      const connectP = bridge.connect();
      await new Promise((r) => setTimeout(r, 0));
      const sock = lastMockSocket!;
      sock.simulateInbound({
        type: "handshake.ack",
        negotiatedVersion: 1,
        relay: { minVersion: 1, maxVersion: 1 },
      });
      await connectP;

      const sessionId = uuidv7();
      const regP = bridge.registerNewSession({
        displayName: "Human",
        runtime: "browser",
        workspaceLabel: "w",
      });
      sock.simulateInbound({
        type: "session.registered",
        sessionId,
        reconnectSecret: "sec",
        displayName: "Human",
      });
      await regP;

      const joinP = bridge.joinSpace({
        slug: "default",
        idempotencyKey: randomUUID(),
      });
      sock.simulateInbound({
        type: "space.joined",
        spaceId: randomUUID(),
        slug: "default",
      });
      await joinP;

      const received: unknown[] = [];
      bridge.onOrchestratorRosterWire((m) => {
        received.push(m);
      });

      const spaceId = randomUUID();
      const orch = randomUUID();
      sock.simulateInbound({
        type: "orchestrator.designated",
        spaceId,
        orchestratorSessionId: orch,
      });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        type: "orchestrator.designated",
        spaceId,
        orchestratorSessionId: orch,
      });
      bridge.close();
    });
  });
});
