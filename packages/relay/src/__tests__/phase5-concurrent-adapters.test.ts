import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import WebSocket from "ws";
import { createRelayServer } from "../server.js";

function testDbPath(): string {
  return join(tmpdir(), `relay-p5-concurrent-${randomUUID()}.db`);
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

async function registerSessionWithRuntime(
  url: string,
  runtime: string,
): Promise<{ ws: WebSocket; sessionId: string }> {
  const ws = await openWs(url);
  await handshake(ws);
  ws.send(
    JSON.stringify({
      type: "session.register",
      newSession: {
        displayName: `session-${runtime}`,
        runtime,
        workspaceLabel: "phase5-proof",
      },
    }),
  );
  const reg = (await nextJson(ws)) as {
    sessionId: string;
    reconnectSecret: string;
  };
  return { ws, sessionId: reg.sessionId };
}

async function joinSpace(
  ws: WebSocket,
  sessionId: string,
  slug: string,
): Promise<string> {
  ws.send(
    JSON.stringify({
      version: 1,
      id: randomUUID(),
      sessionId,
      kind: "control",
      type: "space.join",
      payload: { slug },
      idempotencyKey: uuidv7(),
    }),
  );
  for (;;) {
    const msg = (await nextJson(ws)) as { type?: string; spaceId?: string };
    if (msg.type === "space.joined") {
      return msg.spaceId!;
    }
    if (msg.type === "protocol.error") {
      throw new Error(`join failed: ${JSON.stringify(msg)}`);
    }
  }
}

describe("phase5 concurrent adapters (protocol)", () => {
  const toClose: Array<{ close: () => Promise<void> }> = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of sockets.splice(0)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    for (const s of toClose.splice(0)) {
      await s.close();
    }
  });

  it("two WebSocket sessions with adapter-codex and adapter-cursor-mcp runtimes share a space and exchange conversation", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    toClose.push(srv);

    const codexSide = await registerSessionWithRuntime(srv.url, "adapter-codex");
    const mcpSide = await registerSessionWithRuntime(srv.url, "adapter-cursor-mcp");
    sockets.push(codexSide.ws, mcpSide.ws);

    const slug = "phase5-concurrent";
    const spaceId = await joinSpace(codexSide.ws, codexSide.sessionId, slug);
    await joinSpace(mcpSide.ws, mcpSide.sessionId, slug);

    const gotMessage = new Promise<unknown>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("timeout waiting for conversation")),
        5000,
      );
      const onMessage = (data: WebSocket.RawData): void => {
        try {
          const o = JSON.parse(data.toString()) as { kind?: string };
          if (o.kind === "conversation") {
            clearTimeout(to);
            mcpSide.ws.off("message", onMessage);
            resolve(o);
          }
        } catch {
          /* ignore */
        }
      };
      mcpSide.ws.on("message", onMessage);
    });

    codexSide.ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: codexSide.sessionId,
        kind: "conversation",
        type: "chat.message",
        spaceId,
        payload: { text: "proof-cross-adapter" },
      }),
    );

    const received = (await gotMessage) as {
      kind?: string;
      type?: string;
      payload?: { text?: string };
    };
    expect(received.kind).toBe("conversation");
    expect(received.type).toBe("chat.message");
    expect(received.payload?.text).toBe("proof-cross-adapter");
  });
});
