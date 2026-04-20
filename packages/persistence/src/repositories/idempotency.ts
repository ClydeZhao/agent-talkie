import type Database from "better-sqlite3";

export type ConversationIdempotencyOutcome =
  | { outcome: "fresh" }
  | { outcome: "replay"; wire: string }
  | { outcome: "mismatch" };

/**
 * Atomically records a conversation idempotency key and runs `append` inside the same
 * transaction when the key is new. Replay returns the stored wire without appending.
 */
export function runConversationIdempotentTranscriptAppend(
  db: Database.Database,
  args: {
    key: string;
    sessionId: string;
    envelopeId: string;
    wire: string;
    nowMs: number;
    append: () => void;
  },
): ConversationIdempotencyOutcome {
  return db.transaction(() => {
    const insertResult = db
      .prepare(
        `INSERT OR IGNORE INTO idempotency_keys (idempotency_key, session_id, first_seen_at, conversation_envelope_id, conversation_replay_wire)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        args.key,
        args.sessionId,
        args.nowMs,
        args.envelopeId,
        args.wire,
      );

    if (insertResult.changes > 0) {
      args.append();
      return { outcome: "fresh" };
    }

    const row = db
      .prepare(
        `SELECT session_id, conversation_envelope_id, conversation_replay_wire
         FROM idempotency_keys WHERE idempotency_key = ?`,
      )
      .get(args.key) as
      | {
          session_id: string;
          conversation_envelope_id: string | null;
          conversation_replay_wire: string | null;
        }
      | undefined;

    if (!row) {
      return { outcome: "mismatch" };
    }
    if (row.session_id !== args.sessionId) {
      return { outcome: "mismatch" };
    }
    if (
      row.conversation_envelope_id !== args.envelopeId ||
      row.conversation_replay_wire === null ||
      row.conversation_replay_wire.length === 0
    ) {
      return { outcome: "mismatch" };
    }

    return { outcome: "replay", wire: row.conversation_replay_wire };
  })();
}

export function tryRecordIdempotencyKey(
  db: Database.Database,
  key: string,
  sessionId: string,
  nowMs: number = Date.now(),
): { inserted: boolean } {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO idempotency_keys (idempotency_key, session_id, first_seen_at)
       VALUES (?, ?, ?)`,
    )
    .run(key, sessionId, nowMs);
  return { inserted: result.changes > 0 };
}

export function pruneExpiredIdempotencyKeys(
  db: Database.Database,
  nowMs: number,
  windowMs: number = 300_000,
): number {
  const threshold = nowMs - windowMs;
  const result = db
    .prepare("DELETE FROM idempotency_keys WHERE first_seen_at < ?")
    .run(threshold);
  return Number(result.changes);
}
