-- Migration 007: explicit session inbox residency model.

ALTER TABLE sessions
  ADD COLUMN inbox_mode TEXT NOT NULL DEFAULT 'live'
  CHECK(inbox_mode IN ('live','pull'));

UPDATE sessions
SET inbox_mode = 'pull'
WHERE lower(runtime) IN ('codex-cli', 'codex-app');
