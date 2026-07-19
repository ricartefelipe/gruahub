#!/bin/sh
set -eu

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

echo "Postgres backup loop started (interval=${INTERVAL_SECONDS}s)"
while true; do
  /bin/sh "$SCRIPT_DIR/pg-backup.sh" || echo "Backup failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  sleep "$INTERVAL_SECONDS"
done
