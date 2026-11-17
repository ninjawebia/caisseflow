#!/usr/bin/env bash
# Répare les droits hôte SANS sudo : le chown est exécuté dans un conteneur
# jetable monté sur la racine du dépôt (règle : tout passe par Docker).
# Cible : node_modules (écrits par les conteneurs à travers les bind-mounts),
# output/ (APK, rapports, exports fiscaux) et logs/.
# Usage : make fix-perms   →   bash infra/scripts/fix-permissions.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Les dossiers doivent exister (make up les recrée aussi s'ils manquent).
mkdir -p "$ROOT/output/apk" "$ROOT/output/reports" "$ROOT/output/exports" "$ROOT/logs"

docker run --rm -v "$ROOT":/work alpine sh -c '
  for d in /work/apps/web/node_modules /work/apps/mobile/node_modules \
           /work/packages/*/node_modules /work/output /work/logs; do
    [ -e "$d" ] && chown -R 1000:1000 "$d"
  done
'
echo "Droits réparés (1000:1000) : node_modules, output/, logs/"
