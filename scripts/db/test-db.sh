#!/usr/bin/env bash
# Starts a throwaway PostgreSQL cluster, loads the Supabase shim + all migrations + seed.
# Usage: scripts/db/test-db.sh [start|stop|reset]   (default: reset)
# Prints the connection URL. Requires PostgreSQL 15+ binaries (initdb/pg_ctl) on PATH
# or in /usr/lib/postgresql/*/bin.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DATA="${TEST_DB_DIR:-${TMPDIR:-/tmp}/paliya-test-db}"
PORT="${TEST_DB_PORT:-54329}"
URL="postgresql://postgres@127.0.0.1:${PORT}/postgres"
cmd="${1:-reset}"

# initdb/pg_ctl refuse to run as root (CI containers): drop to the postgres user.
as_pg() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- env PATH="$PATH" "$@"; else "$@"; fi; }

stop() { as_pg pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; }
start() {
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p "$DATA" && [ "$(id -u)" = "0" ] && chown postgres "$DATA"; as_pg initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  as_pg pg_ctl -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1 -c fsync=off" -l "$DATA/log.txt" -w start >/dev/null
}
load() {
  psql "$URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase-shim.sql
  for f in supabase/migrations/*.sql; do
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "FAILED: $f" >&2; exit 1; }
  done
  if [ -f supabase/seed.sql ]; then psql "$URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql; fi
}
case "$cmd" in
  stop) stop ;;
  start) start; echo "$URL" ;;
  reset) stop; rm -rf "$DATA"; start; load; echo "$URL" ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
