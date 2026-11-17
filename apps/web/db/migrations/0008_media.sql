-- 0008_media.sql — Bibliothèque média (v0.4) — assets d'images réutilisables.
-- Un asset = fichier (nom UUID sur disque, volume uploads) + hash SHA-256
-- (déduplication : le même contenu n'est stocké qu'une fois par restaurant).
-- Les articles référencent le CONTENU (photo_file/photo_hash dénormalisés) :
-- retirer la photo d'un article ne supprime jamais l'asset ; supprimer un
-- asset utilisé par un article est refusé (garde-fou applicatif).
-- Backfill : les photos d'articles existantes (F2) deviennent des médias.
-- Idempotent, appliquée par le ledger (make migrate).

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    hash TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/octet-stream',
    bytes INT NOT NULL DEFAULT 0,
    width INT NULL,
    height INT NULL,
    created_by_email TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, hash)
);

-- Les photos déjà en place (F2) entrent dans la bibliothèque (assets vivants).
INSERT INTO media (restaurant_id, file, hash, mime)
SELECT DISTINCT ON (a.restaurant_id, a.photo_hash)
       a.restaurant_id, a.photo_file, a.photo_hash,
       'image/' || lower(split_part(a.photo_file, '.', -1))
FROM articles a
WHERE a.photo_file IS NOT NULL AND a.photo_hash IS NOT NULL
ON CONFLICT (restaurant_id, hash) DO NOTHING;
