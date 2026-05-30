import type Database from "better-sqlite3";

export function getOrchestratorSessionId(
  db: Database.Database,
  spaceId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT orchestrator_session_id FROM spaces WHERE id = ?`,
    )
    .get(spaceId) as { orchestrator_session_id: string | null } | undefined;
  return row?.orchestrator_session_id ?? null;
}

/**
 * Sets the space orchestrator session id. `spaces` has no `updated_at` column; `nowMs` is reserved for future use.
 */
export function setOrchestratorSessionId(
  db: Database.Database,
  spaceId: string,
  orchestratorSessionId: string | null,
  _nowMs: number,
): void {
  db.prepare(
    `UPDATE spaces SET orchestrator_session_id = ? WHERE id = ?`,
  ).run(orchestratorSessionId, spaceId);
}

export type CollaborationMetadataSnapshot = {
  sessions: Array<{
    sessionId: string;
    profile: {
      role: string;
      focus: string;
      updatedAt: number;
    };
    status: {
      progress: string;
      blockedReason: string | null;
      lastActivityMs: number | null;
      updatedAt: number;
    };
  }>;
};

export function getCollaborationMetadataSnapshot(
  db: Database.Database,
  spaceId: string,
): CollaborationMetadataSnapshot {
  const rows = db
    .prepare(
      `SELECT sm.session_id AS session_id,
              cp.role AS profile_role,
              cp.focus AS profile_focus,
              cp.updated_at AS profile_updated_at,
              cs.progress AS status_progress,
              cs.blocked_reason AS status_blocked_reason,
              cs.last_activity_ms AS status_last_activity_ms,
              cs.updated_at AS status_updated_at
       FROM space_memberships sm
       LEFT JOIN collaboration_profile cp
         ON cp.space_id = sm.space_id AND cp.session_id = sm.session_id
       LEFT JOIN collaboration_status cs
         ON cs.space_id = sm.space_id AND cs.session_id = sm.session_id
       WHERE sm.space_id = ? AND sm.left_at IS NULL
       ORDER BY sm.session_id`,
    )
    .all(spaceId) as Array<{
      session_id: string;
      profile_role: string | null;
      profile_focus: string | null;
      profile_updated_at: number | null;
      status_progress: string | null;
      status_blocked_reason: string | null;
      status_last_activity_ms: number | null;
      status_updated_at: number | null;
    }>;

  return {
    sessions: rows.map((r) => ({
      sessionId: r.session_id,
      profile: {
        role: r.profile_role ?? "",
        focus: r.profile_focus ?? "",
        updatedAt: r.profile_updated_at ?? 0,
      },
      status: {
        progress: r.status_progress ?? "idle",
        blockedReason: r.status_blocked_reason ?? null,
        lastActivityMs: r.status_last_activity_ms ?? null,
        updatedAt: r.status_updated_at ?? 0,
      },
    })),
  };
}

export function upsertCollaborationProfile(
  db: Database.Database,
  args: {
    spaceId: string;
    sessionId: string;
    patch: { role?: string; focus?: string };
    nowMs: number;
  },
): void {
  if (args.patch.role === undefined && args.patch.focus === undefined) {
    return;
  }

  const row = db
    .prepare(
      `SELECT role, focus FROM collaboration_profile WHERE space_id = ? AND session_id = ?`,
    )
    .get(args.spaceId, args.sessionId) as
    | { role: string; focus: string }
    | undefined;

  const role =
    args.patch.role !== undefined ? args.patch.role : (row?.role ?? "");
  const focus =
    args.patch.focus !== undefined ? args.patch.focus : (row?.focus ?? "");

  if (!row) {
    db.prepare(
      `INSERT INTO collaboration_profile (space_id, session_id, role, focus, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(args.spaceId, args.sessionId, role, focus, args.nowMs);
  } else {
    db.prepare(
      `UPDATE collaboration_profile SET role = ?, focus = ?, updated_at = ?
       WHERE space_id = ? AND session_id = ?`,
    ).run(role, focus, args.nowMs, args.spaceId, args.sessionId);
  }
}

export function upsertCollaborationStatus(
  db: Database.Database,
  args: {
    spaceId: string;
    sessionId: string;
    patch: {
      progress?: "idle" | "working" | "blocked" | "done";
      blockedReason?: string;
      lastActivityMs?: number;
    };
    nowMs: number;
  },
): void {
  if (
    args.patch.progress === undefined &&
    args.patch.blockedReason === undefined &&
    args.patch.lastActivityMs === undefined
  ) {
    return;
  }

  const row = db
    .prepare(
      `SELECT progress, blocked_reason, last_activity_ms
       FROM collaboration_status WHERE space_id = ? AND session_id = ?`,
    )
    .get(args.spaceId, args.sessionId) as
    | {
        progress: string;
        blocked_reason: string | null;
        last_activity_ms: number | null;
      }
    | undefined;

  const progress =
    args.patch.progress !== undefined
      ? args.patch.progress
      : (row?.progress ?? "idle");
  const blockedReason =
    args.patch.blockedReason !== undefined
      ? args.patch.blockedReason
      : (row?.blocked_reason ?? null);
  const lastActivityMs =
    args.patch.lastActivityMs !== undefined
      ? args.patch.lastActivityMs
      : (row?.last_activity_ms ?? null);

  if (!row) {
    db.prepare(
      `INSERT INTO collaboration_status (space_id, session_id, progress, blocked_reason, last_activity_ms, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      args.spaceId,
      args.sessionId,
      progress,
      blockedReason,
      lastActivityMs,
      args.nowMs,
    );
  } else {
    db.prepare(
      `UPDATE collaboration_status
       SET progress = ?, blocked_reason = ?, last_activity_ms = ?, updated_at = ?
       WHERE space_id = ? AND session_id = ?`,
    ).run(
      progress,
      blockedReason,
      lastActivityMs,
      args.nowMs,
      args.spaceId,
      args.sessionId,
    );
  }
}
