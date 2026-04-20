import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { BrowserSessionBridge } from "./browser-session-bridge.js";
import {
  RECONNECT_SECRET_KEY,
  SESSION_ID_KEY,
} from "./session-storage-keys.js";

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

describe("BrowserSessionBridge", () => {
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

  it("handshake then session.register (isHuman) then space.join envelope", async () => {
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();

    await new Promise((r) => setTimeout(r, 0));
    const first = lastMockSocket;
    expect(first).not.toBeNull();

    expect(first!.sent).toHaveLength(1);
    const hs = JSON.parse(first!.sent[0]!) as {
      type: string;
      supportedVersions: { minVersion: number; maxVersion: number };
    };
    expect(hs.type).toBe("handshake");
    expect(hs.supportedVersions.minVersion).toBe(1);
    expect(hs.supportedVersions.maxVersion).toBe(1);

    first!.simulateInbound({
      type: "handshake.ack",
      negotiatedVersion: 1,
      relay: { minVersion: 1, maxVersion: 1 },
    });

    await connectP;

    expect(bridge.getNegotiatedEnvelopeVersion()).toBe(1);

    const sessionId = uuidv7();
    const regP = bridge.registerNewSession({
      displayName: "Human",
      runtime: "browser",
      workspaceLabel: "ws-a",
    });

    expect(first!.sent).toHaveLength(2);
    const regMsg = JSON.parse(first!.sent[1]!) as {
      type: string;
      newSession: { isHuman?: boolean; displayName: string };
    };
    expect(regMsg.type).toBe("session.register");
    expect(regMsg.newSession.isHuman).toBe(true);

    first!.simulateInbound({
      type: "session.registered",
      sessionId,
      reconnectSecret: "secret-a",
      displayName: "Human",
    });

    const registered = await regP;
    expect(registered.sessionId).toBe(sessionId);

    const joinKey = randomUUID();
    const joinP = bridge.joinSpace({
      slug: "default",
      idempotencyKey: joinKey,
    });

    const joinRaw = JSON.parse(first!.sent[2]!) as Record<string, unknown>;
    expect(joinRaw.version).toBe(1);
    expect(joinRaw.kind).toBe("control");
    expect(joinRaw.type).toBe("space.join");
    expect(joinRaw.sessionId).toBe(sessionId);
    expect(joinRaw.payload).toEqual({ slug: "default" });
    expect(joinRaw.idempotencyKey).toBe(joinKey);
    expect(typeof joinRaw.id).toBe("string");

    first!.simulateInbound({
      type: "space.joined",
      spaceId: randomUUID(),
      slug: "default",
    });

    await joinP;
    bridge.close();
  });

  it("updates maxRelaySeq on transcript.catchup", async () => {
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();
    await new Promise((r) => setTimeout(r, 0));
    const ws = lastMockSocket!;

    ws.simulateInbound({
      type: "handshake.ack",
      negotiatedVersion: 1,
      relay: { minVersion: 1, maxVersion: 1 },
    });
    await connectP;

    const sessionId = uuidv7();
    const regP = bridge.registerNewSession({
      displayName: "H",
      runtime: "browser",
      workspaceLabel: "w",
    });
    ws.simulateInbound({
      type: "session.registered",
      sessionId,
      reconnectSecret: "s",
      displayName: "H",
    });
    await regP;

    const joinP = bridge.joinSpace({
      slug: "default",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInbound({
      type: "space.joined",
      spaceId: randomUUID(),
      slug: "default",
    });
    await joinP;

    expect(bridge.getMaxRelaySeq()).toBe(0);

    ws.simulateInbound({
      type: "transcript.catchup",
      spaceId: "space-1",
      relaySeq: 3,
      envelope: {},
    });
    expect(bridge.getMaxRelaySeq()).toBe(3);

    ws.simulateInbound({
      type: "transcript.catchup",
      spaceId: "space-1",
      relaySeq: 7,
      envelope: {},
    });
    expect(bridge.getMaxRelaySeq()).toBe(7);

    ws.simulateInbound({
      type: "transcript.catchup",
      spaceId: "space-1",
      relaySeq: 7,
      envelope: {},
    });
    expect(bridge.getMaxRelaySeq()).toBe(7);

    bridge.close();
  });

  it("delivers post-handshake protocol.error to onProtocolError before envelope parse", async () => {
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();
    await new Promise((r) => setTimeout(r, 0));
    const ws = lastMockSocket!;

    ws.simulateInbound({
      type: "handshake.ack",
      negotiatedVersion: 1,
      relay: { minVersion: 1, maxVersion: 1 },
    });
    await connectP;

    const sessionId = uuidv7();
    const regP = bridge.registerNewSession({
      displayName: "H",
      runtime: "browser",
      workspaceLabel: "w",
    });
    ws.simulateInbound({
      type: "session.registered",
      sessionId,
      reconnectSecret: "s",
      displayName: "H",
    });
    await regP;

    const joinP = bridge.joinSpace({
      slug: "default",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInbound({
      type: "space.joined",
      spaceId: randomUUID(),
      slug: "default",
    });
    await joinP;

    const received: { type: string; error: string }[] = [];
    bridge.onProtocolError((p) => {
      received.push(p);
    });

    ws.simulateInbound({
      type: "protocol.error",
      error: "no_orchestrator",
    });

    expect(received).toEqual([{ type: "protocol.error", error: "no_orchestrator" }]);

    bridge.close();
  });

  it("delivers collaboration.metadata to onCollaborationMetadata after join", async () => {
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();
    await new Promise((r) => setTimeout(r, 0));
    const ws = lastMockSocket!;

    ws.simulateInbound({
      type: "handshake.ack",
      negotiatedVersion: 1,
      relay: { minVersion: 1, maxVersion: 1 },
    });
    await connectP;

    const sessionId = uuidv7();
    const regP = bridge.registerNewSession({
      displayName: "H",
      runtime: "browser",
      workspaceLabel: "w",
    });
    ws.simulateInbound({
      type: "session.registered",
      sessionId,
      reconnectSecret: "s",
      displayName: "H",
    });
    await regP;

    const spaceId = randomUUID();
    const joinP = bridge.joinSpace({
      slug: "default",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInbound({
      type: "space.joined",
      spaceId,
      slug: "default",
    });
    await joinP;

    const received: Array<{ sessionId: string; namespace: string }> = [];
    bridge.onCollaborationMetadata((m) => {
      received.push({ sessionId: m.sessionId, namespace: m.namespace });
    });

    const peer = randomUUID();
    ws.simulateInbound({
      type: "collaboration.metadata",
      spaceId,
      sessionId: peer,
      namespace: "profile",
      patch: { role: "r1" },
      updatedAt: Date.now(),
    });

    expect(received).toEqual([{ sessionId: peer, namespace: "profile" }]);
    bridge.close();
  });

  it("resumeFromStorage sends session.resume and persists new reconnectSecret", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal(
      "sessionStorage",
      {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => {
          store.clear();
        },
        key: () => null,
        length: store.size,
      } as Storage,
    );

    const sid = uuidv7();
    store.set(SESSION_ID_KEY, sid);
    store.set(RECONNECT_SECRET_KEY, "old-secret");

    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();
    await new Promise((r) => setTimeout(r, 0));
    const ws = lastMockSocket!;

    ws.simulateInbound({
      type: "handshake.ack",
      negotiatedVersion: 1,
      relay: { minVersion: 1, maxVersion: 1 },
    });
    await connectP;

    const resumeP = bridge.resumeFromStorage();
    expect(ws.sent.some((s) => (JSON.parse(s) as { type: string }).type === "session.resume")).toBe(
      true,
    );

    const resumePayload = JSON.parse(
      ws.sent.find((s) => (JSON.parse(s) as { type: string }).type === "session.resume")!,
    ) as { type: string; sessionId: string; reconnectSecret: string };
    expect(resumePayload.sessionId).toBe(sid);
    expect(resumePayload.reconnectSecret).toBe("old-secret");

    ws.simulateInbound({
      type: "session.resumed",
      sessionId: sid,
      reconnectSecret: "rotated-secret",
    });

    const out = await resumeP;
    expect(out?.reconnectSecret).toBe("rotated-secret");
    expect(store.get(RECONNECT_SECRET_KEY)).toBe("rotated-secret");

    bridge.close();
  });
});
