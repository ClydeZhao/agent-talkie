import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import WebSocket from "ws";
import { createRelayServer } from "./server.js";

function testDbPath(): string {
  return join(tmpdir(), `relay-test-${randomUUID()}.db`);
}

function httpOrigin(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, "http:");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, ...rest } = init;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
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

  it("rotates reconnectSecret on session.resume and returns the new secret", async () => {
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
    const secret1 = reg.reconnectSecret!;
    ws1.close();
    await new Promise((r) => setTimeout(r, 80));

    const ws2 = await openWs(srv.url);
    await handshake(ws2);
    ws2.send(
      JSON.stringify({
        type: "session.resume",
        sessionId,
        reconnectSecret: secret1,
      }),
    );
    const resumed = (await nextJson(ws2)) as {
      type?: string;
      sessionId?: string;
      reconnectSecret?: string;
    };
    expect(resumed.type).toBe("session.resumed");
    expect(resumed.sessionId).toBe(sessionId);
    expect((resumed.reconnectSecret ?? "").length).toBeGreaterThan(20);
    expect(resumed.reconnectSecret).not.toBe(secret1);
    const secret2 = resumed.reconnectSecret!;
    ws2.close();
    await new Promise((r) => setTimeout(r, 80));

    const ws3 = await openWs(srv.url);
    await handshake(ws3);
    ws3.send(
      JSON.stringify({
        type: "session.resume",
        sessionId,
        reconnectSecret: secret2,
      }),
    );
    const resumedAgain = (await nextJson(ws3)) as {
      type?: string;
      sessionId?: string;
      reconnectSecret?: string;
    };
    expect(resumedAgain.type).toBe("session.resumed");
    expect(resumedAgain.sessionId).toBe(sessionId);
    expect((resumedAgain.reconnectSecret ?? "").length).toBeGreaterThan(20);
    expect(resumedAgain.reconnectSecret).not.toBe(secret2);

    ws3.close();
    await srv.close();
  });

  describe("HTTP: health, /dashboard static, and 404", () => {
    it("GET relay/status returns active WebSocket connection count", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const origin = httpOrigin(srv.url);

      let res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/relay/status`,
      );
      expect(res.status).toBe(200);
      let body = (await res.json()) as {
        running?: boolean;
        activeConnectionCount?: number;
        stopSupported?: boolean;
        restartSupported?: boolean;
      };
      expect(body).toMatchObject({
        running: true,
        activeConnectionCount: 0,
        stopSupported: true,
        restartSupported: false,
      });

      res = await fetchWithTimeout(`${origin}/__agent-talkie/v1/relay/restart`, {
        method: "POST",
      });
      expect(res.status).toBe(409);

      const ws = await openWs(srv.url);
      res = await fetchWithTimeout(`${origin}/__agent-talkie/v1/relay/status`);
      body = (await res.json()) as { activeConnectionCount?: number };
      expect(body.activeConnectionCount).toBe(1);

      ws.close();
      await srv.close();
    });

    it("GET space-summary marks members online, offline, and stale", async () => {
      const dbPath = testDbPath();
      const prep = openDatabase(dbPath);
      migrate(prep);
      const now = Date.now();
      const { id: staleSessionId } = createSession(prep, {
        displayName: "Stale",
        runtime: "cli",
        workspaceLabel: "repo",
      });
      const { id: offlineSessionId } = createSession(prep, {
        displayName: "Offline",
        runtime: "cli",
        workspaceLabel: "repo",
      });
      const { id: spaceId } = insertSpaceWithSlug(prep, {
        slug: "presence-summary",
        nowMs: now,
      });
      insertMembership(prep, {
        spaceId,
        sessionId: staleSessionId,
        nowMs: now - 120_000,
      });
      insertMembership(prep, {
        spaceId,
        sessionId: offlineSessionId,
        nowMs: now,
      });
      prep
        .prepare(
          `INSERT INTO collaboration_status
             (space_id, session_id, progress, blocked_reason, last_activity_ms, updated_at)
           VALUES (?, ?, 'idle', NULL, ?, ?)`,
        )
        .run(spaceId, staleSessionId, now - 120_000, now - 120_000);
      prep.close();

      const srv = await createRelayServer({
        dbPath,
        port: 0,
        presenceStaleAfterMs: 60_000,
      });
      const ws = await openWs(srv.url);
      await handshake(ws);
      ws.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Online",
            runtime: "browser",
            workspaceLabel: "dashboard",
          },
        }),
      );
      const reg = (await nextJson(ws)) as { sessionId?: string };
      const onlineSessionId = reg.sessionId!;
      ws.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: onlineSessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: "presence-summary" },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(ws);

      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/space-summary?slug=presence-summary`,
      );
      expect(res.status).toBe(200);
      const summary = (await res.json()) as {
        members?: Array<{
          sessionId: string;
          presenceState?: string;
          lastSeenAtMs?: number;
        }>;
      };
      const byId = new Map(summary.members?.map((m) => [m.sessionId, m]));
      expect(byId.get(onlineSessionId)?.presenceState).toBe("online");
      expect(byId.get(offlineSessionId)?.presenceState).toBe("offline");
      expect(byId.get(staleSessionId)?.presenceState).toBe("stale");
      expect(byId.get(staleSessionId)?.lastSeenAtMs).toBe(now - 120_000);

      ws.close();
      await srv.close();
    });

    it("returns 200 JSON for GET /__agent-talkie/v1/health with matching generation", async () => {
      const token = "a".repeat(32);
      const srv = await createRelayServer({
        dbPath: testDbPath(),
        port: 0,
        relayGenerationToken: token,
      });
      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/health?generation=${encodeURIComponent(token)}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = (await res.json()) as { ok?: boolean; generation?: string };
      expect(body.ok).toBe(true);
      expect(body.generation).toBe(token);
      await srv.close();
    });

    it("serves SPA index.html for GET /dashboard and deep routes", async () => {
      const token = "a".repeat(32);
      const srv = await createRelayServer({
        dbPath: testDbPath(),
        port: 0,
        relayGenerationToken: token,
      });
      const origin = httpOrigin(srv.url);
      for (const path of ["/dashboard", "/dashboard/deep/route"]) {
        const res = await fetchWithTimeout(`${origin}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/html");
        const text = await res.text();
        expect(text).toContain("Agent Talkie Dashboard");
      }
      await srv.close();
    });

    it("returns 404 for GET / and unknown paths", async () => {
      const token = "a".repeat(32);
      const srv = await createRelayServer({
        dbPath: testDbPath(),
        port: 0,
        relayGenerationToken: token,
      });
      const origin = httpOrigin(srv.url);
      for (const path of ["/", "/nope"]) {
        const res = await fetchWithTimeout(`${origin}${path}`);
        expect(res.status).toBe(404);
        const text = await res.text();
        expect(text).toBe("Not Found");
      }
      await srv.close();
    });

    it("GET space-summary returns 400 missing_slug without slug query", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/space-summary`,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok?: boolean; error?: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe("missing_slug");
      await srv.close();
    });

    it("GET space-summary returns 404 space_not_found for unknown slug", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent("no-such-space")}`,
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { ok?: boolean; error?: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe("space_not_found");
      await srv.close();
    });

    it("GET space-summary returns 200 JSON with members after join", async () => {
      const dbPath = testDbPath();
      const srv = await createRelayServer({ dbPath, port: 0 });
      const ws = await openWs(srv.url);
      await handshake(ws);
      const slug = `http-summary-${randomUUID().slice(0, 8)}`;
      ws.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "HTTPMember",
            runtime: "vitest",
            workspaceLabel: "relay-test",
          },
        }),
      );
      const reg = (await nextJson(ws)) as { type?: string; sessionId?: string };
      expect(reg.type).toBe("session.registered");
      ws.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: reg.sessionId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      const joined = (await nextJson(ws)) as { type?: string };
      expect(joined.type).toBe("space.joined");
      ws.close();
      await new Promise((r) => setTimeout(r, 50));

      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(slug)}`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const summary = (await res.json()) as {
        slug?: string;
        members?: Array<{
          displayName?: string;
          runtime?: string;
          workspaceLabel?: string;
        }>;
      };
      expect(summary.slug).toBe(slug);
      expect(summary.members?.length).toBe(1);
      expect(summary.members?.[0]?.displayName).toBe("HTTPMember");
      expect(summary.members?.[0]?.runtime).toBe("vitest");
      expect(summary.members?.[0]?.workspaceLabel).toBe("relay-test");
      await srv.close();
    });

    it("GET oversight/spaces returns 200 JSON array sorted by slug", async () => {
      const dbPath = testDbPath();
      const prep = openDatabase(dbPath);
      migrate(prep);
      const now = Date.now();
      const { id: s1 } = createSession(prep, {
        displayName: "L",
        runtime: "r",
        workspaceLabel: "w",
      });
      insertSpaceWithSlug(prep, { slug: "zebra", nowMs: now });
      const { id: spaceA } = insertSpaceWithSlug(prep, {
        slug: "alpha",
        nowMs: now,
      });
      insertMembership(prep, {
        spaceId: spaceA,
        sessionId: s1,
        nowMs: now,
      });
      prep.close();

      const srv = await createRelayServer({ dbPath, port: 0 });
      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/spaces`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = (await res.json()) as Array<{
        slug: string;
        memberCount: number;
      }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      expect(body[0]!.slug).toBe("alpha");
      expect(body[0]!.memberCount).toBe(1);
      expect(body[1]!.slug).toBe("zebra");
      expect(body[1]!.memberCount).toBe(0);
      await srv.close();
    });
  });

  describe("metadata.patch fan-out and profile ACL", () => {
    it("does not crash when fanning out metadata and a member has no connected socket", async () => {
      const dbPath = testDbPath();
      const srv = await createRelayServer({ dbPath, port: 0 });
      const slug = `meta-fanout-${randomUUID().slice(0, 8)}`;

      const wsHuman = await openWs(srv.url);
      await handshake(wsHuman);
      wsHuman.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "H",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const hReg = (await nextJson(wsHuman)) as { sessionId?: string };
      const humanId = hReg.sessionId!;
      wsHuman.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: humanId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      const hj = (await nextJson(wsHuman)) as { spaceId?: string };
      const spaceId = hj.spaceId!;

      const wsAgent = await openWs(srv.url);
      await handshake(wsAgent);
      wsAgent.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Agent",
            runtime: "vitest",
            workspaceLabel: "w",
          },
        }),
      );
      const aReg = (await nextJson(wsAgent)) as { sessionId?: string };
      const agentId = aReg.sessionId!;
      wsAgent.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: agentId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(wsAgent);

      const wsAbsent = await openWs(srv.url);
      await handshake(wsAbsent);
      wsAbsent.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Absent",
            runtime: "vitest",
            workspaceLabel: "w",
          },
        }),
      );
      const abReg = (await nextJson(wsAbsent)) as { sessionId?: string };
      const absentId = abReg.sessionId!;
      wsAbsent.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: absentId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(wsAbsent);
      wsAbsent.close();
      await new Promise((r) => setTimeout(r, 50));

      const metaP = nextJson(wsHuman);
      wsAgent.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: agentId,
          kind: "control",
          type: "metadata.patch",
          spaceId,
          payload: {
            namespace: "profile",
            patch: { role: "worker", focus: "fixing bugs" },
          },
        }),
      );
      const collab = (await metaP) as {
        type?: string;
        sessionId?: string;
        namespace?: string;
        patch?: { role?: string; focus?: string };
      };
      expect(collab.type).toBe("collaboration.metadata");
      expect(collab.sessionId).toBe(agentId);
      expect(collab.namespace).toBe("profile");
      expect(collab.patch?.role).toBe("worker");
      expect(collab.patch?.focus).toBe("fixing bugs");

      wsHuman.close();
      wsAgent.close();
      await new Promise((r) => setTimeout(r, 50));

      const origin = httpOrigin(srv.url);
      const res = await fetchWithTimeout(
        `${origin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(slug)}`,
      );
      expect(res.status).toBe(200);
      const summary = (await res.json()) as {
        members?: Array<{ sessionId: string; role: string; focus: string }>;
      };
      const agentRow = summary.members?.find((m) => m.sessionId === agentId);
      expect(agentRow?.role).toBe("worker");
      expect(agentRow?.focus).toBe("fixing bugs");

      await srv.close();
    });

    it("rejects agent metadata.patch profile that targets another session", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const slug = `meta-acl-${randomUUID().slice(0, 8)}`;

      const wsHuman = await openWs(srv.url);
      await handshake(wsHuman);
      wsHuman.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "H",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const hReg = (await nextJson(wsHuman)) as { sessionId?: string };
      const humanId = hReg.sessionId!;
      wsHuman.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: humanId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      const hj = (await nextJson(wsHuman)) as { spaceId?: string };
      const spaceId = hj.spaceId!;

      const wsAgent = await openWs(srv.url);
      await handshake(wsAgent);
      wsAgent.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Agent",
            runtime: "vitest",
            workspaceLabel: "w",
          },
        }),
      );
      const aReg = (await nextJson(wsAgent)) as { sessionId?: string };
      const agentId = aReg.sessionId!;
      wsAgent.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: agentId,
          kind: "control",
          type: "space.join",
          payload: { slug },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(wsAgent);

      wsAgent.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: agentId,
          kind: "control",
          type: "metadata.patch",
          spaceId,
          payload: {
            namespace: "profile",
            targetSessionId: humanId,
            patch: { role: "nope" },
          },
        }),
      );
      const err = (await nextJson(wsAgent)) as { type?: string; error?: string };
      expect(err.type).toBe("protocol.error");
      expect(err.error).toBe("metadata_patch_forbidden");

      wsHuman.close();
      wsAgent.close();
      await srv.close();
    });
  });

  describe("space.destroy broadcast", () => {
    it("broadcasts space.destroyed to ALL members, then the slug is absent from /oversight/spaces", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const base = httpOrigin(srv.url);

      const wsOwner = await openWs(srv.url);
      await handshake(wsOwner);
      wsOwner.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Owner",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const ownerReg = (await nextJson(wsOwner)) as { sessionId: string };
      const ownerId = ownerReg.sessionId;

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.join",
          payload: { slug: "bcast-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      const ownerJoined = (await nextJson(wsOwner)) as { spaceId: string };
      const spaceId = ownerJoined.spaceId;

      const wsPeer = await openWs(srv.url);
      await handshake(wsPeer);
      wsPeer.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Peer",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const peerReg = (await nextJson(wsPeer)) as { sessionId: string };
      const peerId = peerReg.sessionId;

      wsPeer.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: peerId,
          kind: "control",
          type: "space.join",
          payload: { slug: "bcast-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(wsPeer);

      const listBefore = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/spaces`,
      );
      const spacesBefore = (await listBefore.json()) as Array<{ slug: string }>;
      expect(spacesBefore.some((s) => s.slug === "bcast-room")).toBe(true);

      const peerDestroyedPromise = nextJson(wsPeer, 5000).catch(() => null);

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.destroy",
          payload: { slug: "bcast-room" },
          idempotencyKey: randomUUID(),
          spaceId,
        }),
      );

      const ownerMsg = await nextJson(wsOwner);
      expect(ownerMsg).toEqual({ type: "space.destroyed", slug: "bcast-room" });

      const peerMsg = await peerDestroyedPromise;
      expect(peerMsg).toEqual({ type: "space.destroyed", slug: "bcast-room" });

      await new Promise((r) => setTimeout(r, 200));

      const listAfter = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/spaces`,
      );
      const spacesAfter = (await listAfter.json()) as Array<{ slug: string }>;
      expect(spacesAfter.some((s) => s.slug === "bcast-room")).toBe(false);

      const summaryRes = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/space-summary?slug=bcast-room`,
      );
      expect(summaryRes.status).toBe(404);

      await srv.close();
    });

    it("tombstones destroyed slug so a reconnecting client cannot recreate it via space.join", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const base = httpOrigin(srv.url);

      const wsOwner = await openWs(srv.url);
      await handshake(wsOwner);
      wsOwner.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Owner",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const ownerReg = (await nextJson(wsOwner)) as { sessionId: string };
      const ownerId = ownerReg.sessionId;

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.join",
          payload: { slug: "tomb-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      const ownerJoined = (await nextJson(wsOwner)) as { spaceId: string };
      const spaceId = ownerJoined.spaceId;

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.destroy",
          payload: { slug: "tomb-room" },
          idempotencyKey: randomUUID(),
          spaceId,
        }),
      );
      await nextJson(wsOwner);
      await new Promise((r) => setTimeout(r, 100));

      const wsRecon = await openWs(srv.url);
      await handshake(wsRecon);
      wsRecon.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Reconnector",
            runtime: "vitest",
            workspaceLabel: "w",
          },
        }),
      );
      const reconReg = (await nextJson(wsRecon)) as { sessionId: string };

      wsRecon.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: reconReg.sessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: "tomb-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      const joinReply = (await nextJson(wsRecon)) as { type: string; error?: string };
      expect(joinReply.type).toBe("protocol.error");
      expect(joinReply.error).toBe("space_recently_destroyed");

      const listAfter = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/spaces`,
      );
      const spacesAfter = (await listAfter.json()) as Array<{ slug: string }>;
      expect(spacesAfter.some((s) => s.slug === "tomb-room")).toBe(false);

      const summaryRes = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/space-summary?slug=tomb-room`,
      );
      expect(summaryRes.status).toBe(404);

      wsRecon.close();
      await srv.close();
    });

    it("keeps archived slugs durable so reconnect cannot revive the space", async () => {
      const srv = await createRelayServer({ dbPath: testDbPath(), port: 0 });
      const base = httpOrigin(srv.url);

      const wsOwner = await openWs(srv.url);
      await handshake(wsOwner);
      wsOwner.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Owner",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const ownerReg = (await nextJson(wsOwner)) as { sessionId: string };
      const ownerId = ownerReg.sessionId;

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.join",
          payload: { slug: "archive-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      const ownerJoined = (await nextJson(wsOwner)) as { spaceId: string };
      const spaceId = ownerJoined.spaceId;

      wsOwner.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: ownerId,
          kind: "control",
          type: "space.archive",
          payload: { slug: "archive-room" },
          idempotencyKey: randomUUID(),
          spaceId,
        }),
      );
      expect(await nextJson(wsOwner)).toEqual({
        type: "space.archived",
        slug: "archive-room",
      });
      await new Promise((r) => setTimeout(r, 100));

      const wsRecon = await openWs(srv.url);
      await handshake(wsRecon);
      wsRecon.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Reconnector",
            runtime: "vitest",
            workspaceLabel: "w",
          },
        }),
      );
      const reconReg = (await nextJson(wsRecon)) as { sessionId: string };

      wsRecon.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: reconReg.sessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: "archive-room" },
          idempotencyKey: randomUUID(),
        }),
      );
      const joinReply = (await nextJson(wsRecon)) as { type: string; error?: string };
      expect(joinReply.type).toBe("protocol.error");
      expect(joinReply.error).toBe("space_archived");

      const listAfter = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/spaces`,
      );
      const spacesAfter = (await listAfter.json()) as Array<{ slug: string }>;
      expect(spacesAfter.some((s) => s.slug === "archive-room")).toBe(false);

      wsRecon.close();
      await srv.close();
    });

    it("marks stale disconnected members left and idles the space", async () => {
      const srv = await createRelayServer({
        dbPath: testDbPath(),
        port: 0,
        presenceStaleAfterMs: 10,
      });
      const base = httpOrigin(srv.url);

      const ws = await openWs(srv.url);
      await handshake(ws);
      ws.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: "Owner",
            runtime: "vitest",
            workspaceLabel: "w",
            isHuman: true,
          },
        }),
      );
      const reg = (await nextJson(ws)) as { sessionId: string };
      ws.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: reg.sessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: "idle-on-close" },
          idempotencyKey: randomUUID(),
        }),
      );
      await nextJson(ws);

      ws.close();
      await new Promise((r) => setTimeout(r, 30));

      const listAfter = await fetchWithTimeout(
        `${base}/__agent-talkie/v1/oversight/spaces`,
      );
      const spacesAfter = (await listAfter.json()) as Array<{
        slug: string;
        status: string;
        memberCount: number;
      }>;
      const row = spacesAfter.find((s) => s.slug === "idle-on-close");
      expect(row).toMatchObject({ status: "idle", memberCount: 0 });

      await srv.close();
    });
  });
});
