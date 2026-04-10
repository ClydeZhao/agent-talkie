import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";

export function nextRelaySeq(db: Database.Database, spaceId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(relay_seq), 0) + 1 AS n
       FROM transcript_entries WHERE space_id = ?`,
    )
    .get(spaceId) as { n: number };
  return row.n;
}

export function appendTranscriptEntry(
  db: Database.Database,
  args: {
    spaceId: string;
    senderSessionId: string;
    envelopeJson: string;
    kind: "control" | "conversation";
    nowMs: number;
    id?: string;
  },
): { id: string; relaySeq: number } {
  const relaySeq = nextRelaySeq(db, args.spaceId);
  const id = args.id ?? uuidv7();
  db.prepare(
    `INSERT INTO transcript_entries (
       id, space_id, relay_seq, sender_session_id, envelope_json, kind, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.spaceId,
    relaySeq,
    args.senderSessionId,
    args.envelopeJson,
    args.kind,
    args.nowMs,
  );
  return { id, relaySeq };
}

export function listTranscriptTailBySeq(
  db: Database.Database,
  args: { spaceId: string; limit: number },
): Array<{ relaySeq: number; envelopeJson: string }> {
  const rows = db
    .prepare(
      `SELECT relay_seq, envelope_json
       FROM transcript_entries
       WHERE space_id = ?
       ORDER BY relay_seq DESC
       LIMIT ?`,
    )
    .all(args.spaceId, args.limit) as Array<{
    relay_seq: number;
    envelope_json: string;
  }>;

  return rows
    .map((r) => ({ relaySeq: r.relay_seq, envelopeJson: r.envelope_json }))
    .reverse();
}
