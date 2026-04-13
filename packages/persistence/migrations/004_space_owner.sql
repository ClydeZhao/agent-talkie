-- Migration 004: per-space human owner for management actions (Phase 5 MHUM-01).
ALTER TABLE spaces ADD COLUMN owner_session_id TEXT REFERENCES sessions(id);
