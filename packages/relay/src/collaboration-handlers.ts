import type Database from "better-sqlite3";
import type { Envelope } from "@agent-talkie/protocol";
import {
  appendTranscriptEntry,
  getCollaborationMetadataSnapshot,
  getOrchestratorSessionId,
  getSessionById,
  getSpaceOwnerSessionId,
  setOrchestratorSessionId,
  tryAssignSpaceOwnerIfUnsetForHuman,
  tryRecordIdempotencyKey,
  upsertCollaborationProfile,
  upsertCollaborationStatus,
} from "@agent-talkie/persistence";
import type { WebSocket } from "ws";
import {
  metadataPatchPayloadSchema,
  metadataQueryPayloadSchema,
  orchestratorDesignatePayloadSchema,
  orchestratorClearPayloadSchema,
  taskAssignPayloadSchema,
} from "@agent-talkie/protocol";
import type { RelayDispatchContext } from "./server.js";
import { pruneTranscriptIfOverCap } from "./router.js";

const CONTROL_TYPES = new Set([
  "orchestrator.designate",
  "orchestrator.clear",
  "task.assign",
  "metadata.patch",
  "metadata.query",
]);

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
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

function listActiveMemberSessionIds(
  db: Database.Database,
  spaceId: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT session_id FROM space_memberships
       WHERE space_id = ? AND left_at IS NULL`,
    )
    .all(spaceId) as Array<{ session_id: string }>;
  return rows.map((r) => r.session_id);
}

function fanOutOrchestratorUpdate(
  ctx: RelayDispatchContext,
  spaceId: string,
  senderSessionId: string,
  orchestratorSessionId: string | null,
): void {
  for (const sid of listActiveMemberSessionIds(ctx.db, spaceId)) {
    if (sid === senderSessionId) {
      continue;
    }
    const sock = ctx.registry.get(sid);
    if (sock?.readyState === sock.OPEN) {
      sendJson(sock, {
        type: "collaboration.orchestrator",
        spaceId,
        orchestratorSessionId,
      });
    }
  }
}

/**
 * Handles collaboration control envelopes before generic routing.
 * @returns true if the envelope was fully handled (caller must not call routeEnvelope).
 */
export function handleCollaborationControl(
  ctx: RelayDispatchContext,
  envelope: Envelope,
): boolean {
  if (envelope.kind !== "control" || !CONTROL_TYPES.has(envelope.type)) {
    return false;
  }

  const spaceId = envelope.spaceId;
  if (!spaceId) {
    sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
    return true;
  }

  if (!hasActiveMembership(ctx.db, spaceId, envelope.sessionId)) {
    sendJson(ctx.ws, { type: "protocol.error", error: "not_in_space" });
    return true;
  }

  const nowMs = Date.now();
  const db = ctx.db;
  const ws = ctx.ws;

  if (envelope.type === "orchestrator.designate") {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const parsed = orchestratorDesignatePayloadSchema.safeParse(
      envelope.payload,
    );
    if (!parsed.success) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const target = parsed.data.orchestratorSessionId;
    const senderRow = getSessionById(db, envelope.sessionId);
    if (!senderRow?.isHuman) {
      sendJson(ws, {
        type: "protocol.error",
        error: "orchestrator_designate_forbidden",
      });
      return true;
    }
    if (!hasActiveMembership(db, spaceId, target)) {
      sendJson(ws, {
        type: "protocol.error",
        error: "orchestrator_target_invalid",
      });
      return true;
    }

    const owner = getSpaceOwnerSessionId(db, spaceId);
    if (owner !== null && owner !== envelope.sessionId) {
      sendJson(ws, { type: "protocol.error", error: "not_space_owner" });
      return true;
    }
    if (owner === null) {
      const claimed = tryAssignSpaceOwnerIfUnsetForHuman(db, {
        spaceId,
        sessionId: envelope.sessionId,
      });
      if (!claimed) {
        sendJson(ws, { type: "protocol.error", error: "not_space_owner" });
        return true;
      }
    }

    const run = (): void => {
      const { inserted } = tryRecordIdempotencyKey(
        db,
        idempotencyKey,
        envelope.sessionId,
        nowMs,
      );
      if (!inserted) {
        if (getOrchestratorSessionId(db, spaceId) === target) {
          sendJson(ws, {
            type: "orchestrator.designated",
            spaceId,
            orchestratorSessionId: target,
          });
          return;
        }
        sendJson(ws, {
          type: "protocol.error",
          error: "idempotency_replay_mismatch",
        });
        return;
      }

      setOrchestratorSessionId(db, spaceId, target, nowMs);
      appendTranscriptEntry(db, {
        spaceId,
        senderSessionId: envelope.sessionId,
        envelopeJson: JSON.stringify(envelope),
        kind: "control",
        nowMs,
      });
      pruneTranscriptIfOverCap(db, spaceId);
      sendJson(ws, {
        type: "orchestrator.designated",
        spaceId,
        orchestratorSessionId: target,
      });
      fanOutOrchestratorUpdate(ctx, spaceId, envelope.sessionId, target);
    };
    db.transaction(run)();
    return true;
  }

  if (envelope.type === "orchestrator.clear") {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const parsed = orchestratorClearPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const senderRow = getSessionById(db, envelope.sessionId);
    if (!senderRow?.isHuman) {
      sendJson(ws, {
        type: "protocol.error",
        error: "orchestrator_designate_forbidden",
      });
      return true;
    }

    const ownerClear = getSpaceOwnerSessionId(db, spaceId);
    if (ownerClear !== null && ownerClear !== envelope.sessionId) {
      sendJson(ws, { type: "protocol.error", error: "not_space_owner" });
      return true;
    }
    if (ownerClear === null) {
      const claimed = tryAssignSpaceOwnerIfUnsetForHuman(db, {
        spaceId,
        sessionId: envelope.sessionId,
      });
      if (!claimed) {
        sendJson(ws, { type: "protocol.error", error: "not_space_owner" });
        return true;
      }
    }

    const run = (): void => {
      const { inserted } = tryRecordIdempotencyKey(
        db,
        idempotencyKey,
        envelope.sessionId,
        nowMs,
      );
      if (!inserted) {
        if (getOrchestratorSessionId(db, spaceId) === null) {
          sendJson(ws, { type: "orchestrator.cleared", spaceId });
          return;
        }
        sendJson(ws, {
          type: "protocol.error",
          error: "idempotency_replay_mismatch",
        });
        return;
      }

      setOrchestratorSessionId(db, spaceId, null, nowMs);
      appendTranscriptEntry(db, {
        spaceId,
        senderSessionId: envelope.sessionId,
        envelopeJson: JSON.stringify(envelope),
        kind: "control",
        nowMs,
      });
      pruneTranscriptIfOverCap(db, spaceId);
      sendJson(ws, { type: "orchestrator.cleared", spaceId });
      fanOutOrchestratorUpdate(ctx, spaceId, envelope.sessionId, null);
    };
    db.transaction(run)();
    return true;
  }

  if (envelope.type === "task.assign") {
    const parsed = taskAssignPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    if (!envelope.to) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const currentOrch = getOrchestratorSessionId(db, spaceId);
    if (currentOrch !== envelope.sessionId) {
      sendJson(ws, { type: "protocol.error", error: "task_assign_forbidden" });
      return true;
    }
    if (!hasActiveMembership(db, spaceId, envelope.to)) {
      sendJson(ws, { type: "protocol.error", error: "not_in_space" });
      return true;
    }
    return false;
  }

  if (envelope.type === "metadata.patch") {
    const parsed = metadataPatchPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const payload = parsed.data;
    const subjectSessionId =
      payload.namespace === "profile"
        ? (payload.targetSessionId ?? envelope.sessionId)
        : envelope.sessionId;

    if (payload.namespace === "profile") {
      const senderRow = getSessionById(db, envelope.sessionId);
      if (!senderRow?.isHuman) {
        sendJson(ws, {
          type: "protocol.error",
          error: "metadata_patch_forbidden",
        });
        return true;
      }
      if (
        payload.targetSessionId !== undefined &&
        payload.targetSessionId !== envelope.sessionId
      ) {
        if (!hasActiveMembership(db, spaceId, payload.targetSessionId)) {
          sendJson(ws, { type: "protocol.error", error: "not_in_space" });
          return true;
        }
      }
      upsertCollaborationProfile(db, {
        spaceId,
        sessionId: subjectSessionId,
        patch: payload.patch,
        nowMs,
      });
    } else {
      if (envelope.sessionId !== subjectSessionId) {
        sendJson(ws, {
          type: "protocol.error",
          error: "metadata_patch_forbidden",
        });
        return true;
      }
      upsertCollaborationStatus(db, {
        spaceId,
        sessionId: subjectSessionId,
        patch: payload.patch,
        nowMs,
      });
    }

    const broadcastPatch: Record<string, unknown> = { ...payload.patch };
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: envelope.sessionId,
      envelopeJson: JSON.stringify(envelope),
      kind: "control",
      nowMs,
    });
    pruneTranscriptIfOverCap(db, spaceId);

    for (const sid of listActiveMemberSessionIds(db, spaceId)) {
      if (sid === envelope.sessionId) {
        continue;
      }
      const sock = ctx.registry.get(sid);
      if (sock?.readyState === sock.OPEN) {
        sendJson(sock, {
          type: "collaboration.metadata",
          spaceId,
          sessionId: subjectSessionId,
          namespace: payload.namespace,
          patch: broadcastPatch,
          updatedAt: nowMs,
        });
      }
    }
    return true;
  }

  if (envelope.type === "metadata.query") {
    const parsed = metadataQueryPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      sendJson(ws, { type: "protocol.error", error: "invalid_envelope" });
      return true;
    }
    const snapshot = getCollaborationMetadataSnapshot(db, spaceId);
    sendJson(ws, {
      type: "metadata.query.result",
      spaceId,
      snapshot,
    });
    return true;
  }

  return false;
}
