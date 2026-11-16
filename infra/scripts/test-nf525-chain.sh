#!/usr/bin/env bash
# Contrôle du chaînage SHA-256 du journal répliqué (FISC-2, TC-NF525-004).
# hash_prev(n) doit = hash_self(n-1) pour chaque (restaurant, poste).
set -euo pipefail
SQL=$(psql -U caisseflow -d caisseflow -t -A -c "
SELECT COUNT(*) FROM (
  SELECT seq,
         LAG(hash_self) OVER (PARTITION BY restaurant_id, poste ORDER BY seq) AS prev_self,
         hash_prev
  FROM journal_replica) r
WHERE prev_self IS NOT NULL AND hash_prev IS DISTINCT FROM prev_self")
if [ "$SQL" = "0" ]; then
  echo "Chaînage SHA-256 : INTACT (FISC-2 ✓)"
else
  echo "Chaînage SHA-256 : $SQL rupture(s) détectée(s) — FISC-2 VIOLÉ" >&2
  exit 1
fi
