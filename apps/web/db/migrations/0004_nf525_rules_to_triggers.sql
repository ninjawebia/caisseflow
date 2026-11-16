-- 0004_nf525_rules_to_triggers.sql — Renforcement explicite du garde append-only.
-- La migration 0001 protégeait journal_replica/clotures par des RULES
-- « ON UPDATE/DELETE DO INSTEAD NOTHING » : l'append-only était garanti mais
-- SILENCIEUX (UPDATE 0, aucune erreur — peu probant pour l'audit TC-NF525-010).
-- Les rules sont réécrites au parse : les triggers 0003 ne se déclenchent jamais
-- en leur présence. On remplace donc les rules par les triggers qui RISE EXCEPTION
-- (toute tentative d'altération est refusée ET journalisable).
-- Aucune UPDATE/DELETE légitime n'existe sur ces tables dans le code (vérifié).

DROP RULE IF EXISTS journal_replica_no_update ON journal_replica;
DROP RULE IF EXISTS journal_replica_no_delete ON journal_replica;
DROP RULE IF EXISTS clotures_no_update ON clotures;
DROP RULE IF EXISTS clotures_no_delete ON clotures;

-- Les triggers 0003_nf525_guards.sql (RAISE EXCEPTION) deviennent alors actifs.
