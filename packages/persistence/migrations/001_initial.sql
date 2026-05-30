CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL, runtime TEXT NOT NULL, workspace_label TEXT NOT NULL, branch TEXT, focus TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS space_memberships (space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, PRIMARY KEY (space_id, session_id));

CREATE TABLE IF NOT EXISTS idempotency_keys (idempotency_key TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, first_seen_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_first_seen ON idempotency_keys(first_seen_at);
