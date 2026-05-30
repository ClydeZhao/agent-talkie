import type Database from "better-sqlite3";
import type { Envelope } from "@agent-talkie/protocol";
import {
  appendTranscriptEntry,
  getOrchestratorSessionId,
  getSessionById,
  listTranscriptEntriesAfterSeq,
  runConversationIdempotentTranscriptAppend,
} from "@agent-talkie/persistence";
import WebSocket from "ws";

export const TRANSCRIPT_MAX_ROWS_PER_SPACE = 50000;

const SKIP_TRANSCRIPT_TYPES = new Set([
  "space.join",
  "space.leave",
  "transcript.query",
  "metadata.query",
]);

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function hasActiveMembership(
  db: Database.Database,
  spaceId: string,
  sessionId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS x FROM space_memberships
       WHERE space_id = ? AND session_id = ? AND left_at IS NULL`,
    )
    .get(spaceId, sessionId) as { x: number } | undefined;
  return row !== undefined;
}

export function pruneTranscriptIfOverCap(
  db: Database.Database,
  spaceId: string,
): void {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?`,
    )
    .get(spaceId) as { n: number };
  if (row.n <= TRANSCRIPT_MAX_ROWS_PER_SPACE) {
    return;
  }
  const excess = row.n - TRANSCRIPT_MAX_ROWS_PER_SPACE;
  const ids = db
    .prepare(
      `SELECT id FROM transcript_entries
       WHERE space_id = ?
       ORDER BY relay_seq ASC
       LIMIT ?`,
    )
    .all(spaceId, excess) as Array<{ id: string }>;
  const del = db.prepare(`DELETE FROM transcript_entries WHERE id = ?`);
  for (const { id } of ids) {
    del.run(id);
  }
}

export function routeEnvelope(ctx: {
  db: Database.Database;
  envelope: Envelope;
  senderWs: WebSocket;
  getSocketForSession: (sessionId: string) => WebSocket | undefined;
}): void {
  const { db, envelope, senderWs, getSocketForSession } = ctx;
  const nowMs = Date.now();
  const relayEnvelope =
    envelope.effectiveTo === undefined
      ? envelope
      : ({ ...envelope, effectiveTo: undefined } satisfies Envelope);

  if (relayEnvelope.type === "transcript.query") {
    const spaceId = relayEnvelope.spaceId;
    if (!spaceId) {
      sendJson(senderWs, { type: "protocol.error", error: "not_in_space" });
      return;
    }
    if (!hasActiveMembership(db, spaceId, relayEnvelope.sessionId)) {
      sendJson(senderWs, { type: "protocol.error", error: "not_in_space" });
      return;
    }
    const p = relayEnvelope.payload;
    const afterSeq =
      typeof p.afterSeq === "number" && Number.isInteger(p.afterSeq)
        ? p.afterSeq
        : 0;
    const limitRaw =
      typeof p.limit === "number" && Number.isInteger(p.limit)
        ? p.limit
        : 50;
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const rows = listTranscriptEntriesAfterSeq(db, {
      spaceId,
      afterSeq,
      limit,
    });
    const entries = rows.map((r) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.envelopeJson) as unknown;
      } catch {
        parsed = null;
      }
      return { relaySeq: r.relaySeq, envelope: parsed };
    });
    sendJson(senderWs, {
      type: "transcript.query.result",
      entries,
    });
    return;
  }

  const spaceId = relayEnvelope.spaceId;
  if (!spaceId) {
    sendJson(senderWs, { type: "protocol.error", error: "not_in_space" });
    return;
  }

  if (!hasActiveMembership(db, spaceId, relayEnvelope.sessionId)) {
    sendJson(senderWs, { type: "protocol.error", error: "not_in_space" });
    return;
  }

  const wire = JSON.stringify(relayEnvelope);
  const senderSession = getSessionById(db, relayEnvelope.sessionId);
  if (!senderSession) {
    sendJson(senderWs, { type: "protocol.error", error: "invalid_envelope" });
    return;
  }

  let defaultOrchestratorSessionId: string | null = null;
  if (
    relayEnvelope.kind === "conversation" &&
    relayEnvelope.to === undefined &&
    senderSession.isHuman
  ) {
    const orch = getOrchestratorSessionId(db, spaceId);
    if (orch === null) {
      sendJson(senderWs, { type: "protocol.error", error: "no_orchestrator" });
      return;
    }
    if (!hasActiveMembership(db, spaceId, orch)) {
      sendJson(senderWs, {
        type: "protocol.error",
        error: "orchestrator_offline",
      });
      return;
    }
    defaultOrchestratorSessionId = orch;
  }

  if (relayEnvelope.to) {
    if (!hasActiveMembership(db, spaceId, relayEnvelope.to)) {
      sendJson(senderWs, { type: "protocol.error", error: "target_not_in_space" });
      return;
    }
  }

  let skipGlobalAppend = false;

  const transcriptEnvelope =
    defaultOrchestratorSessionId !== null
      ? { ...relayEnvelope, effectiveTo: defaultOrchestratorSessionId }
      : relayEnvelope;
  const transcriptWire = JSON.stringify(transcriptEnvelope);

  if (relayEnvelope.kind === "conversation" && relayEnvelope.idempotencyKey) {
    const idem = runConversationIdempotentTranscriptAppend(db, {
      key: relayEnvelope.idempotencyKey,
      sessionId: relayEnvelope.sessionId,
      envelopeId: relayEnvelope.id,
      wire,
      nowMs,
      append: () => {
        if (!SKIP_TRANSCRIPT_TYPES.has(relayEnvelope.type)) {
          appendTranscriptEntry(db, {
            spaceId,
            senderSessionId: relayEnvelope.sessionId,
            envelopeJson: transcriptWire,
            kind: relayEnvelope.kind,
            nowMs,
          });
          pruneTranscriptIfOverCap(db, spaceId);
        }
      },
    });
    if (idem.outcome === "mismatch") {
      sendJson(senderWs, {
        type: "protocol.error",
        error: "idempotency_replay_mismatch",
      });
      return;
    }
    if (idem.outcome === "replay") {
      senderWs.send(idem.wire);
      return;
    }
    skipGlobalAppend = true;
  }

  if (!skipGlobalAppend && !SKIP_TRANSCRIPT_TYPES.has(relayEnvelope.type)) {
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: relayEnvelope.sessionId,
      envelopeJson: transcriptWire,
      kind: relayEnvelope.kind,
      nowMs,
    });
    pruneTranscriptIfOverCap(db, spaceId);
  }

  if (
    relayEnvelope.kind === "conversation" &&
    relayEnvelope.to === undefined &&
    senderSession.isHuman
  ) {
    const orch = defaultOrchestratorSessionId;
    if (orch === null) {
      sendJson(senderWs, { type: "protocol.error", error: "no_orchestrator" });
      return;
    }
    const orchWs = getSocketForSession(orch);
    if (orchWs?.readyState === WebSocket.OPEN) {
      orchWs.send(wire);
    }
    senderWs.send(wire);
    return;
  }

  if (relayEnvelope.to) {
    const targetWs = getSocketForSession(relayEnvelope.to);
    if (targetWs?.readyState === WebSocket.OPEN) {
      targetWs.send(wire);
    }
    if (senderSession.isHuman && relayEnvelope.kind === "conversation") {
      senderWs.send(wire);
    }
    return;
  }

  const members = db
    .prepare(
      `SELECT session_id FROM space_memberships
       WHERE space_id = ? AND left_at IS NULL`,
    )
    .all(spaceId) as Array<{ session_id: string }>;

  for (const { session_id: sid } of members) {
    if (sid === relayEnvelope.sessionId) {
      continue;
    }
    const sock = getSocketForSession(sid);
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(wire);
    }
  }

  if (senderSession.isHuman && relayEnvelope.kind === "conversation") {
    senderWs.send(wire);
  }
}
