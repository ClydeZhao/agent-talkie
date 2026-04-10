-- Migration 002: relay spaces lifecycle, membership timestamps, session reconnect columns, transcript.
-- Prefer additive ALTER TABLE statements; forward-only for dev DBs.

ALTER TABLE sessions ADD COLUMN reconnect_secret_hash TEXT;
ALTER TABLE sessions ADD COLUMN reconnect_valid_until INTEGER;

ALTER TABLE spaces ADD COLUMN slug TEXT;
ALTER TABLE spaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE spaces ADD COLUMN archived_at INTEGER;
ALTER TABLE spaces ADD COLUMN expires_at INTEGER;
ALTER TABLE spaces ADD COLUMN policy_json TEXT;

UPDATE spaces SET slug = lower(hex(randomblob(8))) || '-' || rowid WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_slug ON spaces(slug);

ALTER TABLE space_memberships ADD COLUMN joined_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE space_memberships ADD COLUMN left_at INTEGER;

CREATE TABLE IF NOT EXISTS transcript_entries (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  relay_seq INTEGER NOT NULL,
  sender_session_id TEXT NOT NULL REFERENCES sessions(id),
  envelope_json TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('control','conversation')),
  created_at INTEGER NOT NULL,
  UNIQUE(space_id, relay_seq)
);

CREATE INDEX IF NOT EXISTS idx_transcript_space_seq ON transcript_entries(space_id, relay_seq DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_space_created ON transcript_entries(space_id, created_at DESC);
