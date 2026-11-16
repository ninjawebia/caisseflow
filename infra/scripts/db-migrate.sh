#!/usr/bin/env bash
# Migration SQL versionnée (ledger schema_migrations) — DANS le conteneur web.
# Usage : make migrate  →  docker compose exec web ./infra/scripts/db-migrate.sh
set -euo pipefail
cd /repo/apps/web
echo "— Migrations PostgreSQL (ledger idempotent)"
node db/migrate.js
