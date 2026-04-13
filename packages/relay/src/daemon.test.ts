import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createRelayServer } from "./server.js";

function testDbPath(): string {
  return join(tmpdir(), `relay-daemon-test-${randomUUID()}.db`);
}

function wsUrlToHttpBase(url: string): string {
  const u = new URL(url);
  return `http://${u.hostname}:${u.port || "80"}`;
}

async function nextJson(ws: WebSocket, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("nextJson timeout")), timeoutMs);
    const done = (fn: () => void) => {
      clearTimeout(to);
      fn();
    };
    ws.once("message", (data) => {
      done(() => resolve(JSON.parse(data.toString()) as unknown));
    });
    ws.once("close", () => {
      done(() => reject(new Error("socket closed before message")));
    });
  });
}

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

async function handshake(ws: WebSocket): Promise<void> {
  ws.send(
    JSON.stringify({
      type: "handshake",
      supportedVersions: { minVersion: 1, maxVersion: 1 },
    }),
  );
  const ack = (await nextJson(ws)) as { type?: string; negotiatedVersion?: number };
  expect(ack.type).toBe("handshake.ack");
  expect(ack.negotiatedVersion).toBe(1);
}

describe("relay health and idle shutdown", () => {
  it("GET /__agent-talkie/v1/health returns 200 with matching generation", async () => {
    const srv = await createRelayServer({
      dbPath: testDbPath(),
      port: 0,
      relayGenerationToken: "abc",
    });
    const base = wsUrlToHttpBase(srv.url);
    const res = await fetch(
      `${base}/__agent-talkie/v1/health?generation=abc`,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"ok":true');
    expect(text).toContain('"generation":"abc"');
    await srv.close();
  });

  it("GET health with wrong generation returns 403", async () => {
    const srv = await createRelayServer({
      dbPath: testDbPath(),
      port: 0,
      relayGenerationToken: "secret",
    });
    const base = wsUrlToHttpBase(srv.url);
    const res = await fetch(
      `${base}/__agent-talkie/v1/health?generation=nope`,
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(JSON.stringify({ ok: false }));
    await srv.close();
  });

  it("non-GET health returns 405", async () => {
    const srv = await createRelayServer({
      dbPath: testDbPath(),
      port: 0,
      relayGenerationToken: "x",
    });
    const base = wsUrlToHttpBase(srv.url);
    const res = await fetch(`${base}/__agent-talkie/v1/health?generation=x`, {
      method: "POST",
    });
    expect(res.status).toBe(405);
    await srv.close();
  });

  it("fires onIdleShutdown after last WebSocket closes and grace elapses", async () => {
    let idleFired = false;
    const srv = await createRelayServer({
      dbPath: testDbPath(),
      port: 0,
      idleShutdownMs: 50,
      onIdleShutdown: async () => {
        idleFired = true;
      },
    });
    const ws = await openWs(srv.url);
    await handshake(ws);
    ws.close();
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 500;
      const tick = () => {
        if (idleFired) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error("onIdleShutdown not called within 500ms"));
          return;
        }
        setTimeout(tick, 10);
      };
      tick();
    });
    expect(idleFired).toBe(true);
    await srv.close();
  });
});
