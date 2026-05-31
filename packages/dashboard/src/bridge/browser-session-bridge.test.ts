import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";
import type { Envelope } from "@agent-talkie/protocol";
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

  it("includes a human-visible label when joining a generated dashboard space", async () => {
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
      displayName: "Human",
      runtime: "browser",
      workspaceLabel: "dashboard",
    });
    ws.simulateInbound({
      type: "session.registered",
      sessionId,
      reconnectSecret: "secret-a",
      displayName: "Human",
    });
    await regP;

    const joinP = bridge.joinSpace({
      slug: "talkie-generated",
      label: "Talkie Space 2026-05-31 12:00:00",
      idempotencyKey: randomUUID(),
    });

    const joinRaw = JSON.parse(ws.sent[2]!) as Record<string, unknown>;
    expect(joinRaw.payload).toEqual({
      slug: "talkie-generated",
      label: "Talkie Space 2026-05-31 12:00:00",
    });

    ws.simulateInbound({
      type: "space.joined",
      spaceId: randomUUID(),
      slug: "talkie-generated",
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

  it("sendEnvelope throws not_ready before session registration", async () => {
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

    const env: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId: uuidv7(),
      kind: "conversation",
      type: "chat.message",
      payload: { text: "x" },
      spaceId: randomUUID(),
    };
    expect(() => bridge.sendEnvelope(env)).toThrow(/not_ready/);
    bridge.close();
  });

  it("sendEnvelope throws socket_not_open when WebSocket is not open", async () => {
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

    ws.close();
    const env: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "x" },
      spaceId,
    };
    expect(() => bridge.sendEnvelope(env)).toThrow(/socket_not_open/);
    bridge.close();
  });

  it("sendEnvelope validates with safeParseEnvelope and does not send when invalid", async () => {
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

    const n = ws.sent.length;
    const invalid = {
      version: 1,
      id: "not-uuid",
      sessionId,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "x" },
      spaceId,
    } as unknown as Envelope;
    expect(() => bridge.sendEnvelope(invalid)).toThrow();
    expect(ws.sent.length).toBe(n);

    bridge.close();
  });

  it("sendEnvelope sends JSON for a valid envelope after join", async () => {
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

    expect(bridge.getRegisteredSessionId()).toBe(sessionId);
    expect(bridge.getNegotiatedEnvelopeVersion()).toBe(1);

    const env: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "hello" },
      spaceId,
      idempotencyKey: randomUUID(),
    };
    bridge.sendEnvelope(env);
    const last = JSON.parse(ws.sent[ws.sent.length - 1]!) as Envelope;
    expect(last).toEqual(env);

    bridge.close();
  });

  it("sendConversationWithRetryTracking rejects non-conversation", async () => {
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
    ws.simulateInbound({ type: "space.joined", spaceId, slug: "default" });
    await joinP;

    const control: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId,
      kind: "control",
      type: "space.join",
      payload: { slug: "x" },
      idempotencyKey: randomUUID(),
      spaceId,
    };
    expect(() => bridge.sendConversationWithRetryTracking(control)).toThrow(
      /not_conversation/,
    );
    bridge.close();
  });

  it("delivers space.destroyed wire to onSpaceDestroyedWire listeners", async () => {
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
      slug: "room-a",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInbound({ type: "space.joined", spaceId, slug: "room-a" });
    await joinP;

    const received: Array<{ slug: string }> = [];
    bridge.onSpaceDestroyedWire((m) => {
      received.push({ slug: m.slug });
    });

    ws.simulateInbound({ type: "space.destroyed", slug: "room-a" });
    expect(received).toEqual([{ slug: "room-a" }]);

    bridge.close();
  });

  it("close() prevents auto-reconnect after space.destroyed", async () => {
    vi.useFakeTimers();
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect({ autoReconnect: true });
    await vi.advanceTimersByTimeAsync(0);
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
      slug: "room-a",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInbound({ type: "space.joined", spaceId, slug: "room-a" });
    await joinP;

    bridge.onSpaceDestroyedWire(() => {
      bridge.close();
    });

    ws.simulateInbound({ type: "space.destroyed", slug: "room-a" });

    expect(bridge.getConnectionHealth()).toBe("disconnected");

    const socketCountBefore = lastMockSocket;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lastMockSocket).toBe(socketCountBefore);

    vi.useRealTimers();
  });

  it("retryLastConversation resends the same envelope JSON", async () => {
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
    ws.simulateInbound({ type: "space.joined", spaceId, slug: "default" });
    await joinP;

    const env: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "retry-me" },
      spaceId,
      idempotencyKey: randomUUID(),
    };
    bridge.sendConversationWithRetryTracking(env);
    expect(bridge.hasRetryableConversation()).toBe(true);
    const firstJson = ws.sent[ws.sent.length - 1]!;
    bridge.retryLastConversation();
    const secondJson = ws.sent[ws.sent.length - 1]!;
    expect(secondJson).toBe(firstJson);

    bridge.close();
  });
});
