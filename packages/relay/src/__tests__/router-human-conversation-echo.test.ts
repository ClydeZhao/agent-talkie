/**
 * Human conversation sender echo (CTRL-01 / D-09): successful routes mirror `wire` to senderWs.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeParseEnvelope, type Envelope } from "@agent-talkie/protocol";
import {
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
  setOrchestratorSessionId,
  tryAssignSpaceOwnerIfUnsetForHuman,
} from "@agent-talkie/persistence";
import type { WebSocket } from "ws";
import WebSocketImpl from "ws";
import { routeEnvelope } from "../router.js";

function captureWs(): WebSocket & { sent: string[] } {
  const sent: string[] = [];
  const ws = {
    sent,
    readyState: WebSocketImpl.OPEN,
    OPEN: WebSocketImpl.OPEN,
    send(data: string | Buffer) {
      sent.push(typeof data === "string" ? data : data.toString("utf8"));
    },
  };
  return ws as unknown as WebSocket & { sent: string[] };
}

function closedWs(): WebSocket {
  return {
    readyState: WebSocketImpl.CLOSED,
    OPEN: WebSocketImpl.OPEN,
    send: () => {},
  } as unknown as WebSocket;
}

function transcriptCount(db: ReturnType<typeof openDatabase>, spaceId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?")
    .get(spaceId) as { n: number };
  return row.n;
}

function convEnvelope(
  sessionId: string,
  spaceId: string,
  opts?: { to?: string },
): Envelope {
  return {
    version: 1,
    id: randomUUID(),
    sessionId,
    kind: "conversation",
    type: opts?.to !== undefined ? "chat.direct" : "chat.message",
    payload: { text: "hello-echo" },
    spaceId,
    idempotencyKey: randomUUID(),
    ...(opts?.to !== undefined ? { to: opts.to } : {}),
  };
}

describe("routeEnvelope human conversation sender echo", () => {
  it("echoes orchestrator-routed human conversation to the human sender", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idA } = createSession(db, {
      displayName: "agent",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "echo-orch", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });
    setOrchestratorSessionId(db, spaceId, idA, now);

    const wsH = captureWs();
    const wsA = captureWs();
    const env = convEnvelope(idH, spaceId);

    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsH,
      getSocketForSession: (sid) =>
        sid === idA ? wsA : sid === idH ? wsH : undefined,
    });

    expect(wsA.sent).toHaveLength(1);
    expect(wsH.sent).toHaveLength(1);
    const parsed = safeParseEnvelope(JSON.parse(wsH.sent[0]!) as unknown);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(env);
    }
    const row = db
      .prepare(`SELECT envelope_json FROM transcript_entries WHERE space_id = ?`)
      .get(spaceId) as { envelope_json: string };
    const transcriptEnvelope = safeParseEnvelope(
      JSON.parse(row.envelope_json) as unknown,
    );
    expect(transcriptEnvelope.success).toBe(true);
    if (transcriptEnvelope.success) {
      expect(transcriptEnvelope.data.to).toBeUndefined();
      expect(transcriptEnvelope.data.effectiveTo).toBe(idA);
    }
  });

  it("does not add sender echo for non-human broadcast conversation", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idA } = createSession(db, {
      displayName: "agent-a",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: idB } = createSession(db, {
      displayName: "agent-b",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "echo-broadcast", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idB, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });
    setOrchestratorSessionId(db, spaceId, idA, now);

    const wsH = captureWs();
    const wsA = captureWs();
    const wsB = captureWs();
    routeEnvelope({
      db,
      envelope: convEnvelope(idB, spaceId),
      senderWs: wsB,
      getSocketForSession: (sid) => {
        if (sid === idH) return wsH;
        if (sid === idA) return wsA;
        if (sid === idB) return wsB;
        return undefined;
      },
    });

    expect(wsB.sent).toHaveLength(0);
    expect(wsA.sent).toHaveLength(1);
    expect(wsH.sent).toHaveLength(1);
  });

  it("strips client-supplied effectiveTo from non-default routes", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idA } = createSession(db, {
      displayName: "agent-a",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: idB } = createSession(db, {
      displayName: "agent-b",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "strip-effective", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idB, nowMs: now });

    const wsA = captureWs();
    const wsB = captureWs();
    const env = { ...convEnvelope(idB, spaceId), effectiveTo: idA };

    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsB,
      getSocketForSession: (sid) => (sid === idA ? wsA : sid === idB ? wsB : undefined),
    });

    expect(wsA.sent).toHaveLength(1);
    const live = safeParseEnvelope(JSON.parse(wsA.sent[0]!) as unknown);
    expect(live.success).toBe(true);
    if (live.success) {
      expect(live.data.effectiveTo).toBeUndefined();
    }
    const row = db
      .prepare(`SELECT envelope_json FROM transcript_entries WHERE space_id = ?`)
      .get(spaceId) as { envelope_json: string };
    const transcriptEnvelope = safeParseEnvelope(
      JSON.parse(row.envelope_json) as unknown,
    );
    expect(transcriptEnvelope.success).toBe(true);
    if (transcriptEnvelope.success) {
      expect(transcriptEnvelope.data.effectiveTo).toBeUndefined();
    }
  });

  it("queues direct human conversation for an active target even when target socket is offline", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idT } = createSession(db, {
      displayName: "target",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "echo-direct", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idT, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });

    const wsH = captureWs();
    const wsT = closedWs();
    const env = convEnvelope(idH, spaceId, { to: idT });

    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsH,
      getSocketForSession: (sid) => (sid === idT ? wsT : sid === idH ? wsH : undefined),
    });

    expect(wsH.sent).toHaveLength(1);
    const parsed = safeParseEnvelope(JSON.parse(wsH.sent[0]!) as unknown);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(env);
    }
    expect(transcriptCount(db, spaceId)).toBe(1);
  });

  it("rejects direct human conversation to a non-member target without transcript append", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idT } = createSession(db, {
      displayName: "target",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "direct-gone", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });

    const wsH = captureWs();
    const wsT = captureWs();
    const env = convEnvelope(idH, spaceId, { to: idT });

    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsH,
      getSocketForSession: (sid) => (sid === idT ? wsT : sid === idH ? wsH : undefined),
    });

    expect(wsT.sent).toHaveLength(0);
    expect(wsH.sent).toHaveLength(1);
    const err = JSON.parse(wsH.sent[0]!) as {
      type?: string;
      error?: string;
    };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("target_not_in_space");
    expect(transcriptCount(db, spaceId)).toBe(0);
  });

  it("does not consume idempotency for failed direct send before target joins", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idT } = createSession(db, {
      displayName: "target",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "direct-idem", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });

    const wsH = captureWs();
    const wsT = closedWs();
    const env = convEnvelope(idH, spaceId, { to: idT });

    const getSocketForSession = (sid: string) =>
      sid === idT ? wsT : sid === idH ? wsH : undefined;

    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsH,
      getSocketForSession,
    });

    expect(JSON.parse(wsH.sent[0]!) as { error?: string }).toMatchObject({
      error: "target_not_in_space",
    });
    expect(transcriptCount(db, spaceId)).toBe(0);

    insertMembership(db, { spaceId, sessionId: idT, nowMs: now + 1 });
    routeEnvelope({
      db,
      envelope: env,
      senderWs: wsH,
      getSocketForSession,
    });

    expect(wsH.sent).toHaveLength(2);
    const parsed = safeParseEnvelope(JSON.parse(wsH.sent[1]!) as unknown);
    expect(parsed.success).toBe(true);
    expect(transcriptCount(db, spaceId)).toBe(1);
  });
});
