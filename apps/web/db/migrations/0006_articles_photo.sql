-- 0006_articles_photo.sql — Backlog F2 « photos d'articles » (PRD ch. 14.2, BO-1).
-- photo_file : nom du fichier sur disque (volume uploads, jamais contrôlé par le
-- client — nom généré UUID) ; photo_hash : SHA-256 du fichier (ETag / cache
-- tablettes). Les photos n'entrent pas dans les exports fiscaux.
-- Idempotent, appliquée par le ledger (make migrate).

ALTER TABLE articles ADD COLUMN IF NOT EXISTS photo_file TEXT NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS photo_hash TEXT NULL;
