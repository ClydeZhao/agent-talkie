/**
 * Orchestrator default routing (MSG-04).
 *
 * MSG-06 follow-up / consolidation may use optional conversation payload keys `threadId`
 * (string) and `forHumanSummary` (string). The relay does not rewrite these; this is
 * documentation for future clients only.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Envelope } from "@agent-talkie/protocol";
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

function convEnvelope(
  sessionId: string,
  spaceId: string,
  to?: string,
): Envelope {
  return {
    version: 1,
    id: randomUUID(),
    sessionId,
    kind: "conversation",
    type: "chat.message",
    payload: { text: "hi" },
    spaceId,
    ...(to !== undefined ? { to } : {}),
  };
}

describe("routeEnvelope orchestrator defaults", () => {
  it("human undirected conversation delivers only to orchestrator when set", () => {
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
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "orch-test", nowMs: now });
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
    expect(JSON.parse(wsA.sent[0]!) as Envelope).toMatchObject({
      sessionId: idH,
      kind: "conversation",
    });
    expect(wsH.sent).toHaveLength(1);
    expect(JSON.parse(wsH.sent[0]!) as Envelope).toMatchObject({
      sessionId: idH,
      kind: "conversation",
      payload: { text: "hi" },
    });
  });

  it("human undirected conversation with no orchestrator yields no_orchestrator", () => {
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
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "no-orch", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });

    const wsH = captureWs();
    const wsA = captureWs();
    routeEnvelope({
      db,
      envelope: convEnvelope(idH, spaceId),
      senderWs: wsH,
      getSocketForSession: (sid) =>
        sid === idA ? wsA : sid === idH ? wsH : undefined,
    });

    expect(wsA.sent).toHaveLength(0);
    expect(wsH.sent).toHaveLength(1);
    const err = JSON.parse(wsH.sent[0]!) as {
      type?: string;
      error?: string;
    };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("no_orchestrator");
  });

  it("human undirected conversation when orchestrator socket not open yields orchestrator_offline", () => {
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
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "off-orch", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });
    setOrchestratorSessionId(db, spaceId, idA, now);

    const wsH = captureWs();
    const wsA = closedWs();
    routeEnvelope({
      db,
      envelope: convEnvelope(idH, spaceId),
      senderWs: wsH,
      getSocketForSession: (sid) => (sid === idA ? wsA : wsH),
    });

    expect(wsH.sent).toHaveLength(1);
    const err = JSON.parse(wsH.sent[0]!) as {
      type?: string;
      error?: string;
    };
    expect(err.type).toBe("protocol.error");
    expect(err.error).toBe("orchestrator_offline");
  });

  it("non-human undirected conversation fans out to other members", () => {
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
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "fanout", nowMs: now });
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
      envelope: convEnvelope(idA, spaceId),
      senderWs: wsA,
      getSocketForSession: (sid) => {
        if (sid === idH) return wsH;
        if (sid === idA) return wsA;
        if (sid === idB) return wsB;
        return undefined;
      },
    });

    expect(wsA.sent).toHaveLength(0);
    expect(wsH.sent).toHaveLength(1);
    expect(wsB.sent).toHaveLength(1);
  });
});
