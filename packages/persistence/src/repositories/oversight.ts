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
};

export type OversightSpaceSummary = {
  spaceId: string;
  slug: string;
  ownerSessionId: string | null;
  orchestratorSessionId: string | null;
  memberCount: number;
  members: OversightMember[];
};

export function getOversightSpaceSummaryBySlug(
  db: Database.Database,
  slug: string,
): OversightSpaceSummary | undefined {
  const space = getSpaceBySlug(db, slug);
  if (!space) {
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
              COALESCE(cp.role, '') AS role,
              COALESCE(cp.focus, '') AS focus,
              COALESCE(cs.progress, 'idle') AS progress,
              cs.blocked_reason AS blocked_reason
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
      role: string;
      focus: string;
      progress: string;
      blocked_reason: string | null;
    }>;

  return {
    spaceId: space.id,
    slug: space.slug,
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
