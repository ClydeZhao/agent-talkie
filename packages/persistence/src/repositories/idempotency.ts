import type Database from "better-sqlite3";

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
