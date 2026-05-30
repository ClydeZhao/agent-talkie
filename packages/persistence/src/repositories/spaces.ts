import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";

const DEFAULT_SPACE_ARCHIVED_TTL_MS = 2592000000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Trim, lowercase ASCII, collapse internal whitespace to a single hyphen,
 * strip leading/trailing hyphens, then enforce slug pattern and max length 64.
 */
export function normalizeSpaceSlug(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/\s+/g, "-");
  s = s.replace(/^-+/, "").replace(/-+$/, "");

  if (s.length > 64) {
    throw new Error(`Invalid space slug: ${raw.slice(0, 80)}`);
  }
  if (!SLUG_PATTERN.test(s)) {
    throw new Error(`Invalid space slug: ${raw.slice(0, 80)}`);
  }
  return s;
}

export type SpaceStatus = "active" | "idle" | "archived" | "destroyed";

function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function insertSpaceWithSlug(
  db: Database.Database,
  args: { slug: string; nowMs: number; id?: string; label?: string },
): { id: string } {
  const id = args.id ?? uuidv7();
  const label = args.label?.trim() || labelFromSlug(args.slug);
  db.prepare(
    `INSERT INTO spaces (id, created_at, slug, status, label)
     VALUES (?, ?, ?, 'active', ?)`,
  ).run(id, args.nowMs, args.slug, label);
  return { id };
}

export function getSpaceBySlug(
  db: Database.Database,
  slug: string,
):
  | {
      id: string;
      slug: string;
      label: string;
      status: SpaceStatus;
      archivedAt: number | null;
      expiresAt: number | null;
      destroyedAt: number | null;
    }
  | undefined {
  const row = db
    .prepare(
      `SELECT id, slug, label, status, archived_at, expires_at, destroyed_at
       FROM spaces WHERE slug = ?`,
    )
    .get(slug) as
    | {
        id: string;
        slug: string;
        label: string | null;
        status: string;
        archived_at: number | null;
        expires_at: number | null;
        destroyed_at: number | null;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  const status = row.status as SpaceStatus;
  return {
    id: row.id,
    slug: row.slug,
    label: row.label ?? labelFromSlug(row.slug),
    status,
    archivedAt: row.archived_at,
    expiresAt: row.expires_at,
    destroyedAt: row.destroyed_at,
  };
}

export function setSpaceActive(db: Database.Database, spaceId: string): void {
  db.prepare(
    `UPDATE spaces
     SET status = 'active', archived_at = NULL, expires_at = NULL, destroyed_at = NULL
     WHERE id = ?`,
  ).run(spaceId);
}

export function setSpaceIdle(
  db: Database.Database,
  spaceId: string,
  nowMs: number = Date.now(),
  idleTtlMs: number = DEFAULT_SPACE_ARCHIVED_TTL_MS,
): void {
  db.prepare(
    `UPDATE spaces
     SET status = 'idle', archived_at = NULL, expires_at = ?
     WHERE id = ? AND status IN ('active', 'idle')`,
  ).run(nowMs + idleTtlMs, spaceId);
}

export function setSpaceArchived(
  db: Database.Database,
  spaceId: string,
  nowMs: number,
  spaceArchivedTtlMs: number = DEFAULT_SPACE_ARCHIVED_TTL_MS,
): void {
  const expiresAt = nowMs + spaceArchivedTtlMs;
  db.prepare(
    `UPDATE spaces
     SET status = 'archived', archived_at = ?, expires_at = ?
     WHERE id = ?`,
  ).run(nowMs, expiresAt, spaceId);
}

export function reviveSpaceFromArchived(
  db: Database.Database,
  spaceId: string,
  _nowMs: number,
): void {
  setSpaceActive(db, spaceId);
}

export function markSpaceDestroyed(
  db: Database.Database,
  spaceId: string,
  nowMs: number,
): void {
  db.prepare(
    `UPDATE spaces
     SET status = 'destroyed', destroyed_at = ?, archived_at = NULL, expires_at = NULL
     WHERE id = ?`,
  ).run(nowMs, spaceId);
}

export function insertMembership(
  db: Database.Database,
  args: { spaceId: string; sessionId: string; nowMs: number },
): void {
  try {
    db.prepare(
      `INSERT INTO space_memberships (space_id, session_id, joined_at, left_at)
       VALUES (?, ?, ?, NULL)`,
    ).run(args.spaceId, args.sessionId, args.nowMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|UNIQUE/i.test(msg)) {
      throw new Error(
        `Membership already exists for space ${args.spaceId} and session ${args.sessionId}`,
      );
    }
    throw err;
  }
}

export function clearMembershipLeftAt(
  db: Database.Database,
  spaceId: string,
  sessionId: string,
  nowMs: number,
): void {
  db.prepare(
    `UPDATE space_memberships
     SET left_at = NULL, joined_at = ?
     WHERE space_id = ? AND session_id = ?`,
  ).run(nowMs, spaceId, sessionId);
}

export function markMembershipLeft(
  db: Database.Database,
  spaceId: string,
  sessionId: string,
  nowMs: number,
): void {
  db.prepare(
    `UPDATE space_memberships SET left_at = ? WHERE space_id = ? AND session_id = ?`,
  ).run(nowMs, spaceId, sessionId);
}

export function countActiveMembers(
  db: Database.Database,
  spaceId: string,
  _nowMs: number,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM space_memberships
       WHERE space_id = ? AND left_at IS NULL`,
    )
    .get(spaceId) as { n: number };
  return row.n;
}

/** Active membership for a session (at most one in v1). */
export function findActiveMembershipForSession(
  db: Database.Database,
  sessionId: string,
): { spaceId: string; slug: string } | undefined {
  const row = db
    .prepare(
      `SELECT s.id AS space_id, s.slug AS slug
       FROM space_memberships m
       JOIN spaces s ON s.id = m.space_id
       WHERE m.session_id = ? AND m.left_at IS NULL
       LIMIT 1`,
    )
    .get(sessionId) as { space_id: string; slug: string } | undefined;
  if (!row) {
    return undefined;
  }
  return { spaceId: row.space_id, slug: row.slug };
}

/** Removes space row; FK CASCADE deletes memberships and transcript rows. */
export function deleteSpaceById(db: Database.Database, spaceId: string): void {
  db.prepare(`DELETE FROM spaces WHERE id = ?`).run(spaceId);
}
