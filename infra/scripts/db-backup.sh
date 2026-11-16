#!/usr/bin/env bash
# Sauvegarde pg_dump horodatée + gzip + rotation (garde les 14 dernières).
# Usage : make backup  →  docker compose exec postgres /scripts/db-backup.sh
set -euo pipefail
BACKUP_DIR=/backups
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/caisseflow-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "— pg_dump horodaté : $FILE"
pg_dump -U caisseflow caisseflow | gzip > "$FILE"
echo "— Rotation (conservation des 14 dernières)"
ls -1t "$BACKUP_DIR"/caisseflow-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Sauvegardes présentes : $(ls -1 "$BACKUP_DIR"/caisseflow-*.sql.gz | wc -l)"
