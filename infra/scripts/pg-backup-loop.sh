#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/load-secret-files.sh" ]; then
  . "$SCRIPT_DIR/load-secret-files.sh"
fi

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

echo "Postgres backup loop started (interval=${INTERVAL_SECONDS}s)"
while true; do
  /bin/sh "$SCRIPT_DIR/pg-backup.sh" || echo "Backup failed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  sleep "$INTERVAL_SECONDS"
done
