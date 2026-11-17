-- 0005_categories_actif.sql — Backlog F1 « catégories » (PRD ch. 14.1, BO-1).
-- Les catégories deviennent archivables (actif=false = absente des sélections
-- et du sync pull, mais conservée pour la cohérence des exports historiques).
-- Idempotent, appliquée par le ledger (make migrate).

ALTER TABLE categories ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;
