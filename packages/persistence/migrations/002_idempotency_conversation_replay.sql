ALTER TABLE idempotency_keys ADD COLUMN conversation_envelope_id TEXT;
ALTER TABLE idempotency_keys ADD COLUMN conversation_replay_wire TEXT;
