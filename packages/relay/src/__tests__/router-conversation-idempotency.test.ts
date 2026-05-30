/**
 * Conversation + idempotencyKey: transcript dedupe and replay echo (CTRL-03 / 10-03).
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

function transcriptCount(db: ReturnType<typeof openDatabase>, spaceId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?")
    .get(spaceId) as { n: number };
  return row.n;
}

describe("routeEnvelope conversation idempotency", () => {
  it("same idempotencyKey and envelope.id: second send does not append; sender gets replay wire", () => {
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
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "idem-orch", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });
    setOrchestratorSessionId(db, spaceId, idA, now);

    const idemKey = randomUUID();
    const envelopeId = randomUUID();
    const env: Envelope = {
      version: 1,
      id: envelopeId,
      sessionId: idH,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "once" },
      spaceId,
      idempotencyKey: idemKey,
    };
    const wire = JSON.stringify(env);

    const wsH = captureWs();
    const wsA = captureWs();
    const getSock = (sid: string) =>
      sid === idA ? wsA : sid === idH ? wsH : undefined;

    routeEnvelope({ db, envelope: env, senderWs: wsH, getSocketForSession: getSock });
    expect(transcriptCount(db, spaceId)).toBe(1);
    expect(wsA.sent).toHaveLength(1);
    expect(wsH.sent).toHaveLength(1);

    routeEnvelope({ db, envelope: env, senderWs: wsH, getSocketForSession: getSock });
    expect(transcriptCount(db, spaceId)).toBe(1);
    expect(wsA.sent).toHaveLength(1);
    expect(wsH.sent).toHaveLength(2);
    expect(wsH.sent[1]).toBe(wire);
    const replayParsed = safeParseEnvelope(JSON.parse(wsH.sent[1]!) as unknown);
    expect(replayParsed.success).toBe(true);
    if (replayParsed.success) {
      expect(replayParsed.data).toEqual(env);
    }
  });

  it("same idempotencyKey but different envelope.id: protocol.error idempotency_replay_mismatch", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const { id: idH } = createSession(db, {
      displayName: "human2",
      runtime: "t",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: idA } = createSession(db, {
      displayName: "agent2",
      runtime: "t",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug: "idem-mis", nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: idH });
    setOrchestratorSessionId(db, spaceId, idA, now);

    const idemKey = randomUUID();
    const env1: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId: idH,
      kind: "conversation",
      type: "chat.message",
      payload: { text: "first" },
      spaceId,
      idempotencyKey: idemKey,
    };
    const wsH = captureWs();
    const wsA = captureWs();
    const getSock = (sid: string) =>
      sid === idA ? wsA : sid === idH ? wsH : undefined;

    routeEnvelope({ db, envelope: env1, senderWs: wsH, getSocketForSession: getSock });

    const env2: Envelope = {
      ...env1,
      id: randomUUID(),
      payload: { text: "tampered" },
    };
    routeEnvelope({ db, envelope: env2, senderWs: wsH, getSocketForSession: getSock });

    const last = JSON.parse(wsH.sent[wsH.sent.length - 1]!) as {
      type?: string;
      error?: string;
    };
    expect(last.type).toBe("protocol.error");
    expect(last.error).toBe("idempotency_replay_mismatch");
    expect(transcriptCount(db, spaceId)).toBe(1);
  });
});
