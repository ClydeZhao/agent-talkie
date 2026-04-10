import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import WebSocket from "ws";
import { createRelayServer } from "./server.js";

function testDbPath(): string {
  return join(tmpdir(), `relay-test-${randomUUID()}.db`);
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

describe("createRelayServer", () => {
  it("handshakes, registers, and accepts a valid envelope without closing", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    const ws = await openWs(srv.url);
    await handshake(ws);
    ws.send(
      JSON.stringify({
        type: "session.register",
        newSession: {
          displayName: "T",
          runtime: "vitest",
          workspaceLabel: "wl",
        },
      }),
    );
    const reg = (await nextJson(ws)) as {
      type?: string;
      sessionId?: string;
      reconnectSecret?: string;
    };
    expect(reg.type).toBe("session.registered");
    expect(reg.sessionId).toBeTruthy();
    expect((reg.reconnectSecret ?? "").length).toBeGreaterThan(20);

    ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: reg.sessionId,
        kind: "control",
        type: "space.join",
        payload: { slug: "vitest-space" },
        idempotencyKey: randomUUID(),
      }),
    );
    const joined = (await nextJson(ws)) as { type?: string; spaceId?: string };
    expect(joined.type).toBe("space.joined");
    const spaceId = joined.spaceId;
    expect(spaceId).toBeTruthy();

    ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: reg.sessionId,
        kind: "control",
        type: "test.ping",
        payload: {},
        spaceId,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await srv.close();
  });

  it("rejects envelope when version does not match negotiatedVersion", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    const ws = await openWs(srv.url);
    await handshake(ws);
    ws.send(
      JSON.stringify({
        type: "session.register",
        newSession: {
          displayName: "T2",
          runtime: "vitest",
          workspaceLabel: "wl",
        },
      }),
    );
    const reg = (await nextJson(ws)) as { sessionId?: string };
    ws.send(
      JSON.stringify({
        version: 2,
        id: randomUUID(),
        sessionId: reg.sessionId,
        kind: "control",
        type: "test.ping",
        payload: {},
      }),
    );
    const err = (await nextJson(ws)) as { type?: string; error?: string };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("envelope_version_mismatch");
    await srv.close();
  });

  it("rejects envelope when sessionId does not match bound session", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    const ws = await openWs(srv.url);
    await handshake(ws);
    ws.send(
      JSON.stringify({
        type: "session.register",
        newSession: {
          displayName: "T3",
          runtime: "vitest",
          workspaceLabel: "wl",
        },
      }),
    );
    const reg = (await nextJson(ws)) as { sessionId?: string };
    const otherSessionId = uuidv7();
    expect(otherSessionId).not.toBe(reg.sessionId);

    ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: otherSessionId,
        kind: "control",
        type: "test.ping",
        payload: {},
      }),
    );
    const err = (await nextJson(ws)) as { type?: string; error?: string };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("session_mismatch");
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await srv.close();
  });

  it("allows session.resume on a new connection after the first socket closes", async () => {
    const dbPath = testDbPath();
    const srv = await createRelayServer({ dbPath, port: 0 });

    const ws1 = await openWs(srv.url);
    await handshake(ws1);
    ws1.send(
      JSON.stringify({
        type: "session.register",
        newSession: {
          displayName: "R",
          runtime: "vitest",
          workspaceLabel: "wl",
        },
      }),
    );
    const reg = (await nextJson(ws1)) as {
      sessionId?: string;
      reconnectSecret?: string;
    };
    const sessionId = reg.sessionId!;
    const secret = reg.reconnectSecret!;
    ws1.close();
    await new Promise((r) => setTimeout(r, 80));

    const ws2 = await openWs(srv.url);
    await handshake(ws2);
    ws2.send(
      JSON.stringify({
        type: "session.resume",
        sessionId,
        reconnectSecret: secret,
      }),
    );
    const resumed = (await nextJson(ws2)) as { type?: string; sessionId?: string };
    expect(resumed.type).toBe("session.resumed");
    expect(resumed.sessionId).toBe(sessionId);

    ws2.close();
    await srv.close();
  });
});
