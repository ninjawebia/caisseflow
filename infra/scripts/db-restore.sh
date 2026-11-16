#!/usr/bin/env bash
# Restauration TESTÉE d'un dump — usage : make restore FILE=caisseflow-YYYY…sql.gz
# ⚠ Écrase la base courante — uniquement sur dev/préprod (jamais prod sans arrêt).
set -euo pipefail
FILE="/backups/${FILE:?Passez FILE=caisseflow-XXXX.sql.gz (dans infra/backups)}"
echo "— Restauration depuis $FILE (base caisseflow)"
gunzip -c "$FILE" | psql -U caisseflow -d caisseflow -q
echo "— Vérification post-restauration"
psql -U caisseflow -d caisseflow -t -c "SELECT 'ecritures=' || COUNT(*) FROM journal_replica"
echo "Restauration terminée."
