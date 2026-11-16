-- Migration 0002 — add actif to tables_resto (used by plan de salle UI + sync/pull).
ALTER TABLE tables_resto ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;
