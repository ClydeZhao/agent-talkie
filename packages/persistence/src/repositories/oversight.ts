import type Database from "better-sqlite3";
import { getSpaceOwnerSessionId } from "./space-owner.js";
import { getSpaceBySlug } from "./spaces.js";

export type OversightMember = {
  sessionId: string;
  displayName: string;
  isHuman: boolean;
  role: string;
  focus: string;
  progress: string;
  blockedReason: string | null;
  runtime: string;
  workspaceLabel: string;
  inboxMode: "live" | "pull";
  lastSeenAtMs: number | null;
};

export type OversightSpaceSummary = {
  spaceId: string;
  slug: string;
  label: string;
  status: string;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
  memberCount: number;
  members: OversightMember[];
};

/** Row for `GET /oversight/spaces` (active/idle spaces only; see {@link listOversightSpaces}). */
export type OversightSpaceListRow = {
  slug: string;
  label: string;
  status: "active" | "idle";
  memberCount: number;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
};

/**
 * Lists active spaces with member counts (`left_at IS NULL`) and oversight ids.
 * Excludes archived/destroyed rows. Sorted by `slug` ascending.
 */
export function listOversightSpaces(db: Database.Database): OversightSpaceListRow[] {
  const rows = db
    .prepare(
      `SELECT s.id AS space_id,
              s.slug AS slug,
              COALESCE(s.label, s.slug) AS label,
              s.status AS status,
              s.orchestrator_session_id AS orchestrator_session_id,
              (SELECT COUNT(*) FROM space_memberships m
               WHERE m.space_id = s.id AND m.left_at IS NULL) AS member_count
       FROM spaces s
       WHERE s.status IN ('active', 'idle')
       ORDER BY s.slug ASC`,
    )
    .all() as Array<{
      space_id: string;
      slug: string;
      label: string;
      status: "active" | "idle";
      orchestrator_session_id: string | null;
      member_count: number;
    }>;

  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    status: r.status,
    memberCount: Number(r.member_count),
    ownerSessionId: getSpaceOwnerSessionId(db, r.space_id),
    orchestratorSessionId: r.orchestrator_session_id,
  }));
}

export function getOversightSpaceSummaryBySlug(
  db: Database.Database,
  slug: string,
): OversightSpaceSummary | undefined {
  const space = getSpaceBySlug(db, slug);
  if (!space) {
    return undefined;
  }
  if (space.status === "destroyed") {
    return undefined;
  }

  const ownerSessionId = getSpaceOwnerSessionId(db, space.id);

  const orchRow = db
    .prepare(`SELECT orchestrator_session_id FROM spaces WHERE id = ?`)
    .get(space.id) as { orchestrator_session_id: string | null } | undefined;

  const memberRows = db
    .prepare(
      `SELECT sess.id AS session_id,
              sess.display_name AS display_name,
              sess.is_human AS is_human,
              sess.runtime AS runtime,
              sess.workspace_label AS workspace_label,
              sess.inbox_mode AS inbox_mode,
              COALESCE(cp.role, '') AS role,
              COALESCE(cp.focus, '') AS focus,
              COALESCE(cs.progress, 'idle') AS progress,
              cs.blocked_reason AS blocked_reason,
              cs.last_activity_ms AS last_seen_at_ms
       FROM space_memberships m
       JOIN sessions sess ON sess.id = m.session_id
       LEFT JOIN collaboration_profile cp
         ON cp.space_id = m.space_id AND cp.session_id = m.session_id
       LEFT JOIN collaboration_status cs
         ON cs.space_id = m.space_id AND cs.session_id = m.session_id
       WHERE m.space_id = ? AND m.left_at IS NULL
       ORDER BY sess.display_name`,
    )
    .all(space.id) as Array<{
      session_id: string;
      display_name: string;
      is_human: number;
      runtime: string;
      workspace_label: string;
      inbox_mode: "live" | "pull";
      role: string;
      focus: string;
      progress: string;
      blocked_reason: string | null;
      last_seen_at_ms: number | null;
    }>;

  return {
    spaceId: space.id,
    slug: space.slug,
    label: space.label,
    status: space.status,
    ownerSessionId,
    orchestratorSessionId: orchRow?.orchestrator_session_id ?? null,
    memberCount: memberRows.length,
    members: memberRows.map((r) => ({
      sessionId: r.session_id,
      displayName: r.display_name,
      isHuman: r.is_human === 1,
      role: r.role,
      focus: r.focus,
      progress: r.progress,
      blockedReason: r.blocked_reason,
      runtime: r.runtime,
      workspaceLabel: r.workspace_label,
      inboxMode: r.inbox_mode,
      lastSeenAtMs: r.last_seen_at_ms,
    })),
  };
}

export function listOversightTranscriptTailBySlug(
  db: Database.Database,
  args: { slug: string; limit: number },
): Array<{ relaySeq: number; envelopeJson: string; createdAtMs: number }> {
  const space = getSpaceBySlug(db, args.slug);
  if (!space) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT relay_seq, envelope_json, created_at
       FROM transcript_entries
       WHERE space_id = ?
       ORDER BY relay_seq DESC
       LIMIT ?`,
    )
    .all(space.id, args.limit) as Array<{
    relay_seq: number;
    envelope_json: string;
    created_at: number;
  }>;

  return rows
    .map((r) => ({
      relaySeq: r.relay_seq,
      envelopeJson: r.envelope_json,
      createdAtMs: r.created_at,
    }))
    .reverse();
}

export type OversightBlockedSession = {
  sessionId: string;
  displayName: string;
  blockedReason: string | null;
};

export function listOversightBlockedSessionsBySlug(
  db: Database.Database,
  slug: string,
): OversightBlockedSession[] {
  const space = getSpaceBySlug(db, slug);
  if (!space) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT sess.id AS session_id,
              sess.display_name AS display_name,
              cs.blocked_reason AS blocked_reason
       FROM space_memberships m
       JOIN sessions sess ON sess.id = m.session_id
       JOIN collaboration_status cs
         ON cs.space_id = m.space_id AND cs.session_id = m.session_id
       WHERE m.space_id = ? AND m.left_at IS NULL AND cs.progress = 'blocked'
       ORDER BY sess.display_name`,
    )
    .all(space.id) as Array<{
      session_id: string;
      display_name: string;
      blocked_reason: string | null;
    }>;

  return rows.map((r) => ({
    sessionId: r.session_id,
    displayName: r.display_name,
    blockedReason: r.blocked_reason,
  }));
}
