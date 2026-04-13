import { describe, it, expect, vi } from "vitest";

vi.mock("ws", () => {
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;

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
      const o = JSON.parse(data) as {
        type?: string;
        supportedVersions?: unknown;
      };
      expect(o.type).toBe("handshake");
      expect(o.supportedVersions).toEqual({ minVersion: 1, maxVersion: 1 });
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

import { TalkieSessionClient } from "./session-client.js";

describe("TalkieSessionClient", () => {
  it("connect sends handshake JSON with supportedVersions", async () => {
    const client = new TalkieSessionClient();
    await client.connect();
    client.close();
  });
});
