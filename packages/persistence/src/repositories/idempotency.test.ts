import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { createSession } from "./sessions.js";
import {
  pruneExpiredIdempotencyKeys,
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
});
