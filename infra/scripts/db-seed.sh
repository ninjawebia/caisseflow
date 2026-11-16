#!/usr/bin/env bash
# Données de démo déterministes (PIN 1234/2345/3456/4567) — DANS le conteneur web.
# ⚠ JAMAIS en production (lead NV-1 du dossier sécurité) : préprod/dev uniquement.
set -euo pipefail
cd /repo/apps/web
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "REFUS : le seed est interdit en production (NF525 / NV-1)." >&2
  exit 1
fi
echo "— Seed données de démo"
node db/seed.js
