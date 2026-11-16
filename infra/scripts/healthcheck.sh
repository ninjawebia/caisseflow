#!/usr/bin/env bash
# Ping des services critiques : PostgreSQL + web (depuis l'intérieur du réseau).
set -euo pipefail
psql -U caisseflow -d caisseflow -t -c "SELECT 'postgres=OK'" >/dev/null && echo "postgres=OK"
WGET_URL="${WEB_URL:-http://web:3000/api/health}"
if wget -qO- "$WGET_URL" 2>/dev/null | grep -q '"ok":true'; then
  echo "web=OK ($WGET_URL)"
else
  echo "web=KO ($WGET_URL)" >&2
  exit 1
fi
