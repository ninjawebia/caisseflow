-- 0003_nf525_guards.sql — Garde-fous NF525 côté cloud (FISC-8, PRD 7.1/7.2).
-- La réplique cloud du journal et les clôtures Z scellées sont append-only :
-- toute UPDATE/DELETE est refusée au niveau PostgreSQL (le serveur ne corrige
-- ni ne réécrit jamais ; la conservation 6 ans est structurelle, TC-NF525-010).
-- Appliquée par le ledger db/migrate.js (make migrate) — idempotent.

CREATE OR REPLACE FUNCTION nf525_refuse_ecriture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'NF525 : écriture interdite sur % — journal append-only (FISC-1/FISC-8)', TG_TABLE_NAME;
END;
$$;

-- Journal répliqué : INSERT seul.
DROP TRIGGER IF EXISTS trg_journal_append_only ON journal_replica;
CREATE TRIGGER trg_journal_append_only
  BEFORE UPDATE OR DELETE ON journal_replica
  FOR EACH ROW EXECUTE FUNCTION nf525_refuse_ecriture();

-- Clôtures Z scellées : INSERT seul (le scellé n'est jamais retouché).
DROP TRIGGER IF EXISTS trg_clotures_append_only ON clotures;
CREATE TRIGGER trg_clotures_append_only
  BEFORE UPDATE OR DELETE ON clotures
  FOR EACH ROW EXECUTE FUNCTION nf525_refuse_ecriture();
