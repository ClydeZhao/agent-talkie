import type Database from "better-sqlite3";
import type { Envelope } from "@agent-talkie/protocol";
import {
  clearMembershipLeftAt,
  countActiveMembers,
  findActiveMembershipForSession,
  getSessionById,
  getSpaceBySlug,
  getSpaceOwnerSessionId,
  getOrchestratorSessionId,
  insertMembership,
  insertSpaceWithSlug,
  markSpaceDestroyed,
  markMembershipLeft,
  normalizeSpaceSlug,
  setSpaceActive,
  setSpaceArchived,
  setSpaceIdle,
  setOrchestratorSessionId,
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

export type SpaceDestroyOutcome =
  | { kind: "destroyed"; slug: string; closeSessionIds: string[] }
  | { kind: "error"; error: string; closeConnection?: boolean };

export type SpaceArchiveOutcome =
  | { kind: "archived"; slug: string; closeSessionIds: string[] }
  | { kind: "error"; error: string; closeConnection?: boolean };

export type MembershipRemoveOutcome =
  | { kind: "removed"; spaceId: string; targetSessionId: string }
  | { kind: "error"; error: string; closeConnection?: boolean };

function hasActiveMembershipInSpace(
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

function resolveOrCreateSpaceForSlug(
  db: Database.Database,
  slugNorm: string,
  nowMs: number,
  label: string | undefined,
):
  | { kind: "ok"; spaceId: string; created: boolean }
  | { kind: "error"; error: string } {
  for (;;) {
    const row = getSpaceBySlug(db, slugNorm);
    if (!row) {
      const insertArgs: Parameters<typeof insertSpaceWithSlug>[1] = {
        slug: slugNorm,
        nowMs,
      };
      if (label !== undefined) {
        insertArgs.label = label;
      }
      return {
        kind: "ok",
        spaceId: insertSpaceWithSlug(db, insertArgs).id,
        created: true,
      };
    }
    if (row.status === "active") {
      return { kind: "ok", spaceId: row.id, created: false };
    }
    if (row.status === "idle") {
      setSpaceActive(db, row.id);
      return { kind: "ok", spaceId: row.id, created: false };
    }
    if (row.status === "archived") {
      return { kind: "error", error: "space_archived" };
    }
    if (row.status === "destroyed") {
      return { kind: "error", error: "space_destroyed" };
    }
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
 * Join space by slug. Archived/destroyed slugs are durable terminal states.
 * Runs in a single SQLite transaction.
 */
export function handleSpaceJoin(
  db: Database.Database,
  args: {
    sessionId: string;
    idempotencyKey: string;
    slugRaw: string;
    nowMs: number;
    label?: string;
    creatorOrchestrator?: boolean;
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

    const targetSpace = resolveOrCreateSpaceForSlug(
      db,
      slugNorm,
      args.nowMs,
      args.label,
    );
    if (targetSpace.kind === "error") {
      return { kind: "error", error: targetSpace.error };
    }
    const targetSpaceId = targetSpace.spaceId;

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
    if (
      targetSpace.created &&
      args.creatorOrchestrator === true &&
      getOrchestratorSessionId(db, targetSpaceId) === null
    ) {
      setOrchestratorSessionId(db, targetSpaceId, args.sessionId, args.nowMs);
    }

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
      setSpaceIdle(db, spaceId, args.nowMs, LAST_MEMBER_ARCHIVE_TTL_MS);
    }
    return { kind: "left", spaceId };
  };

  return db.transaction(run)();
}

export function pruneStaleDisconnectedMemberships(
  db: Database.Database,
  args: {
    nowMs: number;
    staleAfterMs: number;
    onlineSessionIds: ReadonlySet<string>;
  },
): void {
  const cutoff = args.nowMs - args.staleAfterMs;
  db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT m.space_id AS space_id,
                m.session_id AS session_id,
                COALESCE(cs.last_activity_ms, m.joined_at) AS last_seen_at
         FROM space_memberships m
         JOIN spaces s ON s.id = m.space_id
         LEFT JOIN collaboration_status cs
           ON cs.space_id = m.space_id AND cs.session_id = m.session_id
         WHERE m.left_at IS NULL AND s.status IN ('active', 'idle')`,
      )
      .all() as Array<{
      space_id: string;
      session_id: string;
      last_seen_at: number | null;
    }>;

    const touchedSpaceIds = new Set<string>();
    for (const row of rows) {
      if (args.onlineSessionIds.has(row.session_id)) {
        continue;
      }
      const lastSeenAt = row.last_seen_at ?? 0;
      if (lastSeenAt > cutoff) {
        continue;
      }
      markMembershipLeft(db, row.space_id, row.session_id, args.nowMs);
      touchedSpaceIds.add(row.space_id);
    }

    for (const spaceId of touchedSpaceIds) {
      if (countActiveMembers(db, spaceId, args.nowMs) === 0) {
        setSpaceIdle(db, spaceId, args.nowMs, LAST_MEMBER_ARCHIVE_TTL_MS);
      }
    }
  })();
}

/**
 * Owner-only space destroy: marks active memberships left, marks the space destroyed,
 * returns session ids whose WebSockets should be closed.
 */
export function handleSpaceDestroy(
  db: Database.Database,
  args: {
    sessionId: string;
    idempotencyKey: string;
    slugRaw: string;
    nowMs: number;
  },
): SpaceDestroyOutcome {
  const run = (): SpaceDestroyOutcome => {
    let slugNorm: string;
    try {
      slugNorm = normalizeSpaceSlug(args.slugRaw);
    } catch {
      return { kind: "error", error: "invalid_slug" };
    }

    const { inserted } = tryRecordIdempotencyKey(
      db,
      args.idempotencyKey,
      args.sessionId,
      args.nowMs,
    );

    const space = getSpaceBySlug(db, slugNorm);

    if (!inserted) {
      if (!space || space.status === "destroyed") {
        return { kind: "destroyed", slug: slugNorm, closeSessionIds: [] };
      }
      return {
        kind: "error",
        error: "idempotency_replay_mismatch",
        closeConnection: true,
      };
    }

    if (!space) {
      return { kind: "error", error: "not_in_space" };
    }
    if (space.status === "destroyed") {
      return { kind: "destroyed", slug: slugNorm, closeSessionIds: [] };
    }

    const ownerId = getSpaceOwnerSessionId(db, space.id);
    if (ownerId !== args.sessionId) {
      return { kind: "error", error: "not_space_owner" };
    }

    const sess = getSessionById(db, args.sessionId);
    if (!sess?.isHuman) {
      return { kind: "error", error: "not_space_owner" };
    }

    const rows = db
      .prepare(
        `SELECT session_id FROM space_memberships
         WHERE space_id = ? AND left_at IS NULL`,
      )
      .all(space.id) as { session_id: string }[];

    const closeSessionIds = rows.map((r) => r.session_id);

    for (const sid of closeSessionIds) {
      markMembershipLeft(db, space.id, sid, args.nowMs);
    }

    markSpaceDestroyed(db, space.id, args.nowMs);

    return { kind: "destroyed", slug: slugNorm, closeSessionIds };
  };

  return db.transaction(run)();
}

export function handleSpaceArchive(
  db: Database.Database,
  args: {
    sessionId: string;
    idempotencyKey: string;
    slugRaw: string;
    nowMs: number;
  },
): SpaceArchiveOutcome {
  const run = (): SpaceArchiveOutcome => {
    let slugNorm: string;
    try {
      slugNorm = normalizeSpaceSlug(args.slugRaw);
    } catch {
      return { kind: "error", error: "invalid_slug" };
    }

    const { inserted } = tryRecordIdempotencyKey(
      db,
      args.idempotencyKey,
      args.sessionId,
      args.nowMs,
    );

    const space = getSpaceBySlug(db, slugNorm);

    if (!inserted) {
      if (!space || space.status === "archived" || space.status === "destroyed") {
        return { kind: "archived", slug: slugNorm, closeSessionIds: [] };
      }
      return {
        kind: "error",
        error: "idempotency_replay_mismatch",
        closeConnection: true,
      };
    }

    if (!space || space.status === "destroyed") {
      return { kind: "error", error: "not_in_space" };
    }

    const ownerId = getSpaceOwnerSessionId(db, space.id);
    if (ownerId !== args.sessionId) {
      return { kind: "error", error: "not_space_owner" };
    }

    const sess = getSessionById(db, args.sessionId);
    if (!sess?.isHuman) {
      return { kind: "error", error: "not_space_owner" };
    }

    const rows = db
      .prepare(
        `SELECT session_id FROM space_memberships
         WHERE space_id = ? AND left_at IS NULL`,
      )
      .all(space.id) as { session_id: string }[];

    const closeSessionIds = rows.map((r) => r.session_id);

    for (const sid of closeSessionIds) {
      markMembershipLeft(db, space.id, sid, args.nowMs);
    }

    setSpaceArchived(db, space.id, args.nowMs, LAST_MEMBER_ARCHIVE_TTL_MS);

    return { kind: "archived", slug: slugNorm, closeSessionIds };
  };

  return db.transaction(run)();
}

/**
 * Owner-only membership remove: marks target membership left; may archive space when last member leaves.
 */
export function handleMembershipRemove(
  db: Database.Database,
  args: {
    sessionId: string;
    spaceId: string;
    targetSessionId: string;
    idempotencyKey: string;
    nowMs: number;
  },
): MembershipRemoveOutcome {
  const run = (): MembershipRemoveOutcome => {
    const { inserted } = tryRecordIdempotencyKey(
      db,
      args.idempotencyKey,
      args.sessionId,
      args.nowMs,
    );

    if (!inserted) {
      if (!hasActiveMembershipInSpace(db, args.spaceId, args.targetSessionId)) {
        return {
          kind: "removed",
          spaceId: args.spaceId,
          targetSessionId: args.targetSessionId,
        };
      }
      return {
        kind: "error",
        error: "idempotency_replay_mismatch",
        closeConnection: true,
      };
    }

    const senderMem = findActiveMembershipForSession(db, args.sessionId);
    if (!senderMem || senderMem.spaceId !== args.spaceId) {
      return { kind: "error", error: "not_in_space" };
    }

    const ownerId = getSpaceOwnerSessionId(db, args.spaceId);
    if (ownerId !== args.sessionId) {
      return { kind: "error", error: "not_space_owner" };
    }

    const sess = getSessionById(db, args.sessionId);
    if (!sess?.isHuman) {
      return { kind: "error", error: "not_space_owner" };
    }

    if (args.targetSessionId === args.sessionId) {
      return { kind: "error", error: "membership_remove_self" };
    }

    if (ownerId && args.targetSessionId === ownerId) {
      return { kind: "error", error: "cannot_remove_space_owner" };
    }

    if (!hasActiveMembershipInSpace(db, args.spaceId, args.targetSessionId)) {
      return { kind: "error", error: "target_not_in_space" };
    }

    markMembershipLeft(db, args.spaceId, args.targetSessionId, args.nowMs);
    if (countActiveMembers(db, args.spaceId, args.nowMs) === 0) {
      setSpaceIdle(db, args.spaceId, args.nowMs, LAST_MEMBER_ARCHIVE_TTL_MS);
    }
    return {
      kind: "removed",
      spaceId: args.spaceId,
      targetSessionId: args.targetSessionId,
    };
  };

  return db.transaction(run)();
}

export function isSpaceJoinEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.join";
}

export function isSpaceLeaveEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.leave";
}

export function isSpaceDestroyEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.destroy";
}

export function isSpaceArchiveEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "space.archive";
}

export function isMembershipRemoveEnvelope(envelope: Envelope): boolean {
  return envelope.kind === "control" && envelope.type === "membership.remove";
}

/** Idle spaces auto-archive; archived spaces preserve transcript history. */
export function pruneExpiredArchivedSpaces(
  db: Database.Database,
  nowMs: number,
): void {
  db.prepare(
    `UPDATE spaces
     SET status = 'archived', archived_at = ?, expires_at = NULL
     WHERE status = 'idle' AND expires_at IS NOT NULL AND expires_at <= ?`,
  ).run(nowMs, nowMs);
  db.prepare(
    `UPDATE spaces
     SET expires_at = NULL
     WHERE status = 'archived' AND expires_at IS NOT NULL`,
  ).run();
}
