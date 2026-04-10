import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import WebSocket from "ws";
import {
  findActiveMembershipForSession,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { createRelayServer } from "./server.js";

function testDbPath(): string {
  return join(tmpdir(), `relay-int-${randomUUID()}.db`);
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

async function registerSession(url: string): Promise<{
  ws: WebSocket;
  sessionId: string;
  reconnectSecret: string;
}> {
  const ws = await openWs(url);
  await handshake(ws);
  ws.send(
    JSON.stringify({
      type: "session.register",
      newSession: {
        displayName: "int",
        runtime: "vitest",
        workspaceLabel: "wl",
      },
    }),
  );
  const reg = (await nextJson(ws)) as {
    sessionId: string;
    reconnectSecret: string;
  };
  return { ws, sessionId: reg.sessionId, reconnectSecret: reg.reconnectSecret };
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

describe("relay integration", () => {
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

  function track(ws: WebSocket): void {
    sockets.push(ws);
  }

  it("Test A: broadcast in alpha does not reach beta (isolation)", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    toClose.push(srv);

    const a = await registerSession(srv.url);
    const b = await registerSession(srv.url);
    const c = await registerSession(srv.url);
    track(a.ws);
    track(b.ws);
    track(c.ws);

    const spaceAlpha = await joinSpace(a.ws, a.sessionId, "alpha");
    await joinSpace(b.ws, b.sessionId, "alpha");
    const spaceBeta = await joinSpace(c.ws, c.sessionId, "beta");
    expect(spaceAlpha).toBeTruthy();
    expect(spaceBeta).toBeTruthy();

    let bConv = 0;
    let cConv = 0;
    const onB = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as { kind?: string };
        if (o.kind === "conversation") bConv++;
      } catch {
        /* ignore */
      }
    };
    const onC = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as { kind?: string };
        if (o.kind === "conversation") cConv++;
      } catch {
        /* ignore */
      }
    };
    b.ws.on("message", onB);
    c.ws.on("message", onC);

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: a.sessionId,
        kind: "conversation",
        type: "chat.message",
        payload: { text: "hi-all" },
        spaceId: spaceAlpha,
      }),
    );

    await new Promise((r) => setTimeout(r, 200));
    b.ws.off("message", onB);
    c.ws.off("message", onC);

    expect(bConv).toBe(1);
    expect(cConv).toBe(0);
  });

  it("Test B: direct to only reaches recipient", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    toClose.push(srv);

    const a = await registerSession(srv.url);
    const b = await registerSession(srv.url);
    const c = await registerSession(srv.url);
    track(a.ws);
    track(b.ws);
    track(c.ws);

    const spaceAlpha = await joinSpace(a.ws, a.sessionId, "alpha");
    await joinSpace(b.ws, b.sessionId, "alpha");
    await joinSpace(c.ws, c.sessionId, "alpha");

    let bConv = 0;
    let cConv = 0;
    const onB = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as { kind?: string };
        if (o.kind === "conversation") bConv++;
      } catch {
        /* ignore */
      }
    };
    const onC = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as { kind?: string };
        if (o.kind === "conversation") cConv++;
      } catch {
        /* ignore */
      }
    };
    b.ws.on("message", onB);
    c.ws.on("message", onC);

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: a.sessionId,
        kind: "conversation",
        type: "chat.direct",
        payload: { text: "hey-b" },
        spaceId: spaceAlpha,
        to: b.sessionId,
      }),
    );

    await new Promise((r) => setTimeout(r, 200));
    b.ws.off("message", onB);
    c.ws.off("message", onC);

    expect(bConv).toBe(1);
    expect(cConv).toBe(0);
  });

  it("Test C: multi-turn direct messages with distinct envelope ids", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    toClose.push(srv);

    const a = await registerSession(srv.url);
    const b = await registerSession(srv.url);
    track(a.ws);
    track(b.ws);

    const spaceAlpha = await joinSpace(a.ws, a.sessionId, "alpha");
    await joinSpace(b.ws, b.sessionId, "alpha");

    const recvA: number[] = [];
    const recvB: number[] = [];
    const onA = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as {
          kind?: string;
          to?: string;
          payload?: { n?: number };
        };
        if (
          o.kind === "conversation" &&
          o.to === a.sessionId &&
          typeof o.payload?.n === "number"
        ) {
          recvA.push(o.payload.n);
        }
      } catch {
        /* ignore */
      }
    };
    const onB = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as {
          kind?: string;
          to?: string;
          payload?: { n?: number };
        };
        if (
          o.kind === "conversation" &&
          o.to === b.sessionId &&
          typeof o.payload?.n === "number"
        ) {
          recvB.push(o.payload.n);
        }
      } catch {
        /* ignore */
      }
    };
    a.ws.on("message", onA);
    b.ws.on("message", onB);

    const id1 = randomUUID();
    const id2 = randomUUID();
    const id3 = randomUUID();
    const id4 = randomUUID();

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: id1,
        sessionId: a.sessionId,
        kind: "conversation",
        type: "turn",
        payload: { n: 1 },
        spaceId: spaceAlpha,
        to: b.sessionId,
      }),
    );
    b.ws.send(
      JSON.stringify({
        version: 1,
        id: id2,
        sessionId: b.sessionId,
        kind: "conversation",
        type: "turn",
        payload: { n: 2 },
        spaceId: spaceAlpha,
        to: a.sessionId,
      }),
    );
    a.ws.send(
      JSON.stringify({
        version: 1,
        id: id3,
        sessionId: a.sessionId,
        kind: "conversation",
        type: "turn",
        payload: { n:3 },
        spaceId: spaceAlpha,
        to: b.sessionId,
      }),
    );
    b.ws.send(
      JSON.stringify({
        version: 1,
        id: id4,
        sessionId: b.sessionId,
        kind: "conversation",
        type: "turn",
        payload: { n:3 },
        spaceId: spaceAlpha,
        to: a.sessionId,
      }),
    );

    await new Promise((r) => setTimeout(r, 250));
    a.ws.off("message", onA);
    b.ws.off("message", onB);

    expect(recvA.sort((x, y) => x - y)).toEqual([2, 3]);
    expect(recvB.sort((x, y) => x - y)).toEqual([1, 3]);
    expect(new Set([id1, id2, id3, id4]).size).toBe(4);
  });

  it("Test D: session.resume delivers transcript.catchup after restart", async () => {
    const dbPath = testDbPath();
    let srv = await createRelayServer({ dbPath, port: 0 });
    toClose.push(srv);

    const a = await registerSession(srv.url);
    track(a.ws);

    const spaceId = await joinSpace(a.ws, a.sessionId, "alpha");

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: a.sessionId,
        kind: "conversation",
        type: "seed",
        payload: { text: "for-transcript" },
        spaceId,
      }),
    );
    await new Promise((r) => setTimeout(r, 250));

    const secret = a.reconnectSecret;
    a.ws.close();
    await srv.close();
    toClose.pop();

    const dbMid = openDatabase(dbPath);
    migrate(dbMid);
    expect(findActiveMembershipForSession(dbMid, a.sessionId)?.slug).toBe(
      "alpha",
    );
    const transcriptCount = (
      dbMid
        .prepare(
          `SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?`,
        )
        .get(spaceId) as { n: number }
    ).n;
    expect(transcriptCount).toBeGreaterThanOrEqual(1);
    dbMid.close();

    srv = await createRelayServer({ dbPath, port: 0 });
    toClose.push(srv);

    const ws2 = await openWs(srv.url);
    track(ws2);
    await handshake(ws2);

    const inbound: unknown[] = [];
    ws2.on("message", (data: WebSocket.RawData) => {
      try {
        inbound.push(JSON.parse(data.toString()) as unknown);
      } catch {
        /* ignore */
      }
    });

    ws2.send(
      JSON.stringify({
        type: "session.resume",
        sessionId: a.sessionId,
        reconnectSecret: secret,
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    expect(
      inbound.some((m) => (m as { type?: string }).type === "session.resumed"),
    ).toBe(true);
    expect(
      inbound.some(
        (m) => (m as { type?: string }).type === "transcript.catchup",
      ),
    ).toBe(true);
  });

  it("Test E: invalid_envelope does not deliver to peers", async () => {
    const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
    toClose.push(srv);

    const a = await registerSession(srv.url);
    const b = await registerSession(srv.url);
    track(a.ws);
    track(b.ws);

    const spaceAlpha = await joinSpace(a.ws, a.sessionId, "alpha");
    await joinSpace(b.ws, b.sessionId, "alpha");

    let bConv = 0;
    const onB = (data: WebSocket.RawData) => {
      try {
        const o = JSON.parse(data.toString()) as { kind?: string };
        if (o.kind === "conversation") bConv++;
      } catch {
        /* ignore */
      }
    };
    b.ws.on("message", onB);

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: randomUUID(),
        sessionId: a.sessionId,
        kind: "conversation",
        type: "ok.msg",
        payload: { x: 1 },
        spaceId: spaceAlpha,
        to: b.sessionId,
      }),
    );
    await new Promise((r) => setTimeout(r, 120));
    const afterValid = bConv;
    expect(afterValid).toBeGreaterThanOrEqual(1);

    a.ws.send(
      JSON.stringify({
        version: 1,
        id: "not-a-uuid",
        sessionId: a.sessionId,
        kind: "conversation",
        type: "bad.msg",
        payload: {},
        spaceId: spaceAlpha,
        to: b.sessionId,
      }),
    );
    const err = (await nextJson(a.ws)) as { type?: string; error?: string };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("invalid_envelope");

    await new Promise((r) => setTimeout(r, 150));
    b.ws.off("message", onB);
    expect(bConv).toBe(afterValid);
  });
});
