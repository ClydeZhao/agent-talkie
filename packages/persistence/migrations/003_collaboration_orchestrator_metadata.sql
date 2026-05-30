-- Migration 003: human session flag, per-space orchestrator, collaboration profile/status metadata.

ALTER TABLE sessions ADD COLUMN is_human INTEGER NOT NULL DEFAULT 0;

ALTER TABLE spaces ADD COLUMN orchestrator_session_id TEXT;

CREATE TABLE IF NOT EXISTS collaboration_profile (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, session_id)
);

CREATE TABLE IF NOT EXISTS collaboration_status (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  progress TEXT NOT NULL DEFAULT 'idle' CHECK(progress IN ('idle','working','blocked','done')),
  blocked_reason TEXT,
  last_activity_ms INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_collab_profile_space ON collaboration_profile(space_id);
CREATE INDEX IF NOT EXISTS idx_collab_status_space ON collaboration_status(space_id);
