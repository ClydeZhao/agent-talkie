import { describe, it, expect, vi } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { TalkieSessionClient } from "./session-client.js";

vi.mock("ws", () => {
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    private sendPhase = 0;
    private readonly sessionId = uuidv7();

    constructor(public url: string) {
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open");
      });
    }

    private readonly listeners = new Map<
      string,
      Set<(...args: unknown[]) => void>
    >();

    private addListener(ev: string, fn: (...args: unknown[]) => void): void {
      if (!this.listeners.has(ev)) {
        this.listeners.set(ev, new Set());
      }
      this.listeners.get(ev)!.add(fn);
    }

    private removeListener(
      ev: string,
      fn: (...args: unknown[]) => void,
    ): void {
      this.listeners.get(ev)?.delete(fn);
    }

    on(ev: string, fn: (...args: unknown[]) => void): void {
      this.addListener(ev, fn);
    }

    once(ev: string, fn: (...args: unknown[]) => void): void {
      const wrap = (...args: unknown[]) => {
        this.removeListener(ev, wrap);
        fn(...args);
      };
      this.addListener(ev, wrap);
    }

    off(ev: string, fn: (...args: unknown[]) => void): void {
      this.removeListener(ev, fn);
    }

    private emit(ev: string, ...args: unknown[]): void {
      const set = this.listeners.get(ev);
      if (!set) {
        return;
      }
      for (const fn of [...set]) {
        fn(...args);
      }
    }

    send(data: string): void {
      const o = JSON.parse(data) as Record<string, unknown>;
      if (this.sendPhase === 0) {
        expect(o.type).toBe("handshake");
        this.sendPhase += 1;
        queueMicrotask(() => {
          this.emit(
            "message",
            JSON.stringify({
              type: "handshake.ack",
              negotiatedVersion: 1,
              relay: { minVersion: 1, maxVersion: 1 },
            }),
          );
        });
        return;
      }
      if (this.sendPhase === 1) {
        expect(o.type).toBe("session.register");
        this.sendPhase += 1;
        queueMicrotask(() => {
          this.emit(
            "message",
            JSON.stringify({
              type: "session.registered",
              sessionId: this.sessionId,
              reconnectSecret: "sec",
              displayName: "t",
            }),
          );
        });
        return;
      }
      const json = JSON.stringify(o);
      expect(json).toContain('"type":"space.join"');
      expect(o.kind).toBe("control");
      expect(o.type).toBe("space.join");
      queueMicrotask(() => {
        this.emit(
          "message",
          JSON.stringify({
            type: "space.joined",
            spaceId: uuidv7(),
          }),
        );
      });
    }

    removeAllListeners(): void {
      this.listeners.clear();
    }

    close(): void {
      this.readyState = MockWebSocket.CLOSED;
    }
  }

  return { default: MockWebSocket };
});

describe("TalkieSessionClient joinSpace", () => {
  it("sends space.join envelope with slug after registerSession", async () => {
    const client = new TalkieSessionClient();
    await client.connect();
    await client.registerSession({
      displayName: "join-tester",
      runtime: "vitest",
      workspaceLabel: ".",
    });
    const out = await client.joinSpace({
      slug: "my-space",
      idempotencyKey: uuidv7(),
    });
    expect(out.slug).toBe("my-space");
    expect(out.spaceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    client.close();
  });
});
