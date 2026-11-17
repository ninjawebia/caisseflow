-- 0007_licence_cles.sql — Activation de licence par clé signée (LIC, PRD ch. 8).
-- Le gérant colle une clé « CF-… » signée (Ed25519) : le logiciel vérifie la
-- signature en LOCAL (aucun serveur de licences, coût nul). expires_at est la
-- date d'expiration portée par la clé (NULL = perpétuelle) ; cle_id est
-- l'empreinte de la clé activée (détection de réutilisation).
-- Idempotent, appliquée par le ledger (make migrate).

ALTER TABLE licences ADD COLUMN IF NOT EXISTS expires_at DATE NULL;
ALTER TABLE licences ADD COLUMN IF NOT EXISTS plan TEXT NULL;
ALTER TABLE licences ADD COLUMN IF NOT EXISTS cle_id TEXT NULL;
