import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { createSession } from "./sessions.js";
import {
  pruneExpiredIdempotencyKeys,
  runConversationIdempotentTranscriptAppend,
  tryRecordIdempotencyKey,
} from "./idempotency.js";

describe("idempotency repository", () => {
  it("records first insert and rejects duplicate key", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const { id: sessionId } = createSession(db, {
      displayName: "s",
      runtime: "r",
      workspaceLabel: "w",
    });
    const key = "550e8400-e29b-41d4-a716-446655440000";

    expect(tryRecordIdempotencyKey(db, key, sessionId)).toEqual({
      inserted: true,
    });
    expect(tryRecordIdempotencyKey(db, key, sessionId)).toEqual({
      inserted: false,
    });
  });

  it("pruneExpiredIdempotencyKeys removes rows older than window", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const { id: sessionId } = createSession(db, {
      displayName: "s2",
      runtime: "r",
      workspaceLabel: "w",
    });
    const staleAt = 1_000;
    db.prepare(
      `INSERT INTO idempotency_keys (idempotency_key, session_id, first_seen_at)
       VALUES (?, ?, ?)`,
    ).run("stale-key", sessionId, staleAt);

    const nowMs = 10_000_000_000;
    const deleted = pruneExpiredIdempotencyKeys(db, nowMs, 300_000);
    expect(deleted).toBe(1);

    const row = db
      .prepare("SELECT 1 FROM idempotency_keys WHERE idempotency_key = ?")
      .get("stale-key");
    expect(row).toBeUndefined();
  });

  it("runConversationIdempotentTranscriptAppend: fresh stores replay wire; replay returns same wire", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const { id: sessionId } = createSession(db, {
      displayName: "s3",
      runtime: "r",
      workspaceLabel: "w",
    });
    const key = "660e8400-e29b-41d4-a716-446655440001";
    const envelopeId = "770e8400-e29b-41d4-a716-446655440002";
    const wire = JSON.stringify({ id: envelopeId, k: key });
    let appendCalls = 0;

    const r1 = runConversationIdempotentTranscriptAppend(db, {
      key,
      sessionId,
      envelopeId,
      wire,
      nowMs: 1000,
      append: () => {
        appendCalls += 1;
      },
    });
    expect(r1).toEqual({ outcome: "fresh" });
    expect(appendCalls).toBe(1);

    const r2 = runConversationIdempotentTranscriptAppend(db, {
      key,
      sessionId,
      envelopeId,
      wire,
      nowMs: 2000,
      append: () => {
        appendCalls += 1;
      },
    });
    expect(r2).toEqual({ outcome: "replay", wire });
    expect(appendCalls).toBe(1);
  });

  it("runConversationIdempotentTranscriptAppend: same key different envelope id is mismatch", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const { id: sessionId } = createSession(db, {
      displayName: "s4",
      runtime: "r",
      workspaceLabel: "w",
    });
    const key = "880e8400-e29b-41d4-a716-446655440003";
    const wire1 = JSON.stringify({ id: "a", text: "one" });
    runConversationIdempotentTranscriptAppend(db, {
      key,
      sessionId,
      envelopeId: "a",
      wire: wire1,
      nowMs: 1,
      append: () => {},
    });

    const wire2 = JSON.stringify({ id: "b", text: "two" });
    const r = runConversationIdempotentTranscriptAppend(db, {
      key,
      sessionId,
      envelopeId: "b",
      wire: wire2,
      nowMs: 2,
      append: () => {},
    });
    expect(r).toEqual({ outcome: "mismatch" });
  });
});
