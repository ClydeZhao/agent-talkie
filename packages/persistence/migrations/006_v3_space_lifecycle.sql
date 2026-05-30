-- Migration 006: v3 product-level space lifecycle and human labels.
ALTER TABLE spaces ADD COLUMN label TEXT;
ALTER TABLE spaces ADD COLUMN destroyed_at INTEGER;

UPDATE spaces
SET label = slug
WHERE label IS NULL;

UPDATE spaces
SET status = 'archived'
WHERE status = 'expired';
