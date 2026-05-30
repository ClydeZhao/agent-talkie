import type Database from "better-sqlite3";
import { getSessionById } from "./sessions.js";

function spacesHasOwnerSessionIdColumn(db: Database.Database): boolean {
  const rows = db
    .prepare(`PRAGMA table_info(spaces)`)
    .all() as { name: string }[];
  return rows.some((r) => r.name === "owner_session_id");
}

export function getSpaceOwnerSessionId(
  db: Database.Database,
  spaceId: string,
): string | null {
  if (!spacesHasOwnerSessionIdColumn(db)) {
    return null;
  }
  const row = db
    .prepare(`SELECT owner_session_id FROM spaces WHERE id = ?`)
    .get(spaceId) as { owner_session_id: string | null } | undefined;
  if (!row || row.owner_session_id == null) {
    return null;
  }
  return row.owner_session_id;
}

export function tryAssignSpaceOwnerIfUnsetForHuman(
  db: Database.Database,
  args: { spaceId: string; sessionId: string },
): boolean {
  const row = getSessionById(db, args.sessionId);
  if (!row?.isHuman) {
    return false;
  }
  const result = db
    .prepare(
      `UPDATE spaces SET owner_session_id = ? WHERE id = ? AND owner_session_id IS NULL`,
    )
    .run(args.sessionId, args.spaceId);
  return result.changes > 0;
}
