import type Database from "better-sqlite3";
import type { Envelope } from "@agent-talkie/protocol";
import {
  clearMembershipLeftAt,
  countActiveMembers,
  deleteSpaceById,
  findActiveMembershipForSession,
  getSpaceBySlug,
  insertMembership,
  insertSpaceWithSlug,
  markMembershipLeft,
  normalizeSpaceSlug,
  reviveSpaceFromArchived,
  setSpaceArchived,
  tryAssignSpaceOwnerIfUnsetForHuman,
  tryRecordIdempotencyKey,
} from "@agent-talkie/persistence";

const LAST_MEMBER_ARCHIVE_TTL_MS = 2592000000;

export type SpaceJoinOutcome =
  | { kind: "joined"; spaceId: string; slug: string }
  | { kind: "error"; error: string; closeConnection?: boolean };

export type SpaceLeaveOutcome =
  | { kind: "left"; spaceId: string }
  | { kind: "error"; error: string; closeConnection?: boolean };

function resolveOrCreateSpaceForSlug(
  db: Database.Database,
  slugNorm: string,
  nowMs: number,
): string {
  for (;;) {
    const row = getSpaceBySlug(db, slugNorm);
    if (!row) {
      return insertSpaceWithSlug(db, { slug: slugNorm, nowMs }).id;
    }
    if (row.status === "active") {
      return row.id;
    }
    if (
      row.status === "archived" &&
      row.expiresAt != null &&
      row.expiresAt > nowMs
    ) {
      reviveSpaceFromArchived(db, row.id, nowMs);
      return row.id;
    }
    deleteSpaceById(db, row.id);
  }
}

function currentActiveSpaceId(
  db: Database.Database,
  sessionId: string,
): string | undefined {
  const row = db
    .prepare(
      `SELECT space_id FROM space_memberships
       WHERE session_id = ? AND left_at IS NULL`,
    )
    .get(sessionId) as { space_id: string } | undefined;
  return row?.space_id;
}

/**
 * Join space by slug (create-or-revive-or-replace per plan 02-03).
 * Runs in a single SQLite transaction.
 */
export function handleSpaceJoin(
  db: Database.Database,
  args: {
    sessionId: string;
    idempotencyKey: string;
    slugRaw: string;
    nowMs: number;
  },
): SpaceJoinOutcome {
  const run = (): SpaceJoinOutcome => {
    const { inserted } = tryRecordIdempotencyKey(
      db,
      args.idempotencyKey,
      args.sessionId,
      args.nowMs,
    );

    if (!inserted) {
      const row = db
        .prepare(
          `SELECT s.id AS space_id, s.slug AS slug
           FROM spaces s
           JOIN space_memberships m ON m.space_id = s.id
           WHERE m.session_id = ? AND m.left_at IS NULL
           LIMIT 1`,
        )
        .get(args.sessionId) as { space_id: string; slug: string } | undefined;
      if (!row) {
        return {
          kind: "error",
          error: "idempotency_replay_mismatch",
          closeConnection: true,
        };
      }
      tryAssignSpaceOwnerIfUnsetForHuman(db, {
        spaceId: row.space_id,
        sessionId: args.sessionId,
      });
      return { kind: "joined", spaceId: row.space_id, slug: row.slug };
    }

    let slugNorm: string;
    try {
      slugNorm = normalizeSpaceSlug(args.slugRaw);
    } catch {
      return { kind: "error", error: "invalid_slug" };
    }

    const targetSpaceId = resolveOrCreateSpaceForSlug(
      db,
      slugNorm,
      args.nowMs,
    );

    const activeSpaceId = currentActiveSpaceId(db, args.sessionId);
    if (activeSpaceId && activeSpaceId !== targetSpaceId) {
      return { kind: "error", error: "already_in_space" };
    }
    if (activeSpaceId === targetSpaceId) {
      tryAssignSpaceOwnerIfUnsetForHuman(db, {
        spaceId: targetSpaceId,
        sessionId: args.sessionId,
      });
      const slugRow = db
        .prepare(`SELECT slug FROM spaces WHERE id = ?`)
        .get(targetSpaceId) as { slug: string } | undefined;
      const slug = slugRow?.slug ?? slugNorm;
      return { kind: "joined", spaceId: targetSpaceId, slug };
    }

    const mem = db
      .prepare(
        `SELECT left_at FROM space_memberships WHERE space_id = ? AND session_id = ?`,
      )
      .get(targetSpaceId, args.sessionId) as
      | { left_at: number | null }
      | undefined;

    if (!mem) {
      insertMembership(db, {
        spaceId: targetSpaceId,
        sessionId: args.sessionId,
        nowMs: args.nowMs,
      });
    } else if (mem.left_at != null) {
      clearMembershipLeftAt(
        db,
        targetSpaceId,
        args.sessionId,
        args.nowMs,
      );
    }

    tryAssignSpaceOwnerIfUnsetForHuman(db, {
      spaceId: targetSpaceId,
      sessionId: args.sessionId,
    });

    const slugRow = db
      .prepare(`SELECT slug FROM spaces WHERE id = ?`)
      .get(targetSpaceId) as { slug: string } | undefined;
    const slug = slugRow?.slug ?? slugNorm;
    return { kind: "joined", spaceId: targetSpaceId, slug };
  };

  return db.transaction(run)();
}

export function handleSpaceLeave(
  db: Database.Database,
  args: {
    sessionId: string;
    idempotencyKey: string;
    nowMs: number;
  },
): SpaceLeaveOutcome {
  const run = (): SpaceLeaveOutcome => {
    const { inserted } = tryRecordIdempotencyKey(
      db,
      args.idempotencyKey,
      args.sessionId,
      args.nowMs,
    );

    if (!inserted) {
      const active = findActiveMembershipForSession(db, args.sessionId);
      if (active) {
        return { kind: "left", spaceId: active.spaceId };
      }
      const row = db
        .prepare(
          `SELECT space_id FROM space_memberships
           WHERE session_id = ? AND left_at IS NOT NULL
           ORDER BY left_at DESC
           LIMIT 1`,
        )
        .get(args.sessionId) as { space_id: string } | undefined;
      if (row) {
        return { kind: "left", spaceId: row.space_id };
      }
      return {
        kind: "error",
        error: "idempotency_replay_mismatch",
        closeConnection: true,
      };
    }

    const active = findActiveMembershipForSession(db, args.sessionId);
    if (!active) {
      return { kind: "error", error: "not_in_space" };
    }

    const { spaceId } = active;
    markMembershipLeft(db, spaceId, args.sessionId, args.nowMs);
    if (countActiveMembers(db, spaceId, args.nowMs) === 0) {
      setSpaceArchived(db, spaceId, args.nowMs, LAST_MEMBER_ARCHIVE_TTL_MS);
    }
    return { kind: "left", spaceId };
  };

  return db.transaction(run)();
}

export function isSpaceJoinEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.join";
}

export function isSpaceLeaveEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.leave";
}

/** Periodic GC: remove archived spaces past expiry (memberships/transcript CASCADE). */
export function pruneExpiredArchivedSpaces(
  db: Database.Database,
  nowMs: number,
): void {
  db.prepare(
    `DELETE FROM spaces
     WHERE status = 'archived'
       AND expires_at IS NOT NULL
       AND expires_at <= ?`,
  ).run(nowMs);
}
