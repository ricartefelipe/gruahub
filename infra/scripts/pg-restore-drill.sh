#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/load-secret-files.sh" ]; then
  . "$SCRIPT_DIR/load-secret-files.sh"
fi

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-gruahub}"
POSTGRES_USER="${POSTGRES_USER:-gruahub}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DRILL_DB="${RESTORE_DRILL_DB:-${POSTGRES_DB}_restore_drill}"

if [ -z "${PGPASSWORD:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
fi

if [ -z "${PGPASSWORD:-}" ]; then
  echo "PGPASSWORD or POSTGRES_PASSWORD is required" >&2
  exit 1
fi

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(ls -1t "${BACKUP_DIR}/${POSTGRES_DB}_"*.sql.gz 2>/dev/null | head -n1 || true)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "No backup file found under ${BACKUP_DIR}" >&2
  exit 1
fi

echo "Restore drill using: $BACKUP_FILE -> database ${DRILL_DB}"

psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DRILL_DB}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\";" \
  -c "CREATE DATABASE \"${DRILL_DB}\" OWNER \"${POSTGRES_USER}\";"

gunzip -c "$BACKUP_FILE" | psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 >/tmp/restore-drill.log

OBJECT_COUNT="$(psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d "$DRILL_DB" -Atqc \
  "SELECT
     (SELECT count(*) FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public'))
   + (SELECT count(*) FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema'));")"

if [ "${OBJECT_COUNT}" -lt 1 ]; then
  echo "Restore drill failed: no application schemas/tables in ${DRILL_DB}" >&2
  exit 1
fi

psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE \"${DRILL_DB}\";"

echo "Restore drill OK: restored ${OBJECT_COUNT} schemas/tables from $(basename "$BACKUP_FILE")"
