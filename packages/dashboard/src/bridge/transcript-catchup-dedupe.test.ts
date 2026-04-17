import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { BrowserSessionBridge } from "./browser-session-bridge.js";

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

  simulateInboundJson(json: string): void {
    const ev = { data: json } as MessageEvent;
    this.onmessage?.(ev);
  }

  close(): void {
    this.readyState = 3;
  }
}

let lastMockSocket: MockWebSocket | null = null;

describe("transcript.catchup dedupe", () => {
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

  it("delivers transcript.catchup once when relaySeq repeats (tail overlap)", async () => {
    const bridge = new BrowserSessionBridge({ url: "ws://127.0.0.1:18765" });
    const connectP = bridge.connect();
    await new Promise((r) => setTimeout(r, 0));
    const ws = lastMockSocket!;

    ws.simulateInboundJson(
      JSON.stringify({
        type: "handshake.ack",
        negotiatedVersion: 1,
        relay: { minVersion: 1, maxVersion: 1 },
      }),
    );
    await connectP;

    const sessionId = uuidv7();
    const regP = bridge.registerNewSession({
      displayName: "H",
      runtime: "browser",
      workspaceLabel: "w",
    });
    ws.simulateInboundJson(
      JSON.stringify({
        type: "session.registered",
        sessionId,
        reconnectSecret: "s",
        displayName: "H",
      }),
    );
    await regP;

    const joinP = bridge.joinSpace({
      slug: "default",
      idempotencyKey: randomUUID(),
    });
    ws.simulateInboundJson(
      JSON.stringify({
        type: "space.joined",
        spaceId: randomUUID(),
        slug: "default",
      }),
    );
    await joinP;

    let count = 0;
    bridge.onTranscriptCatchup(() => {
      count += 1;
    });

    const catchupJson = JSON.stringify({
      type: "transcript.catchup",
      spaceId: "space-1",
      relaySeq: 5,
      envelope: { note: "a" },
    });
    ws.simulateInboundJson(catchupJson);
    ws.simulateInboundJson(catchupJson);

    expect(count).toBe(1);
    expect(bridge.getMaxRelaySeq()).toBe(5);

    bridge.close();
  });
});
