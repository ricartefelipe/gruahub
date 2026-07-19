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
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

if [ -z "${PGPASSWORD:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
fi

if [ -z "${PGPASSWORD:-}" ]; then
  echo "PGPASSWORD or POSTGRES_PASSWORD is required" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

pg_dump -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip -c > "$FILE"

echo "Backup written: $FILE ($(wc -c < "$FILE") bytes)"

find "$BACKUP_DIR" -type f -name "${POSTGRES_DB}_*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete 2>/dev/null || true

if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
  ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-${MINIO_ROOT_USER:-${MINIO_ACCESS_KEY:-}}}"
  SECRET_KEY="${BACKUP_S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-${MINIO_SECRET_KEY:-}}}"
  BUCKET="${BACKUP_S3_BUCKET:-${MINIO_BUCKET:-gruahub}}"
  PREFIX="${BACKUP_S3_PREFIX:-postgres-backups}"
  REGION="${BACKUP_S3_REGION:-us-east-1}"
  OBJECT="${PREFIX%/}/$(basename "$FILE")"

  if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ]; then
    echo "BACKUP_S3_ENDPOINT set but access/secret key missing" >&2
    exit 1
  fi

  if ! command -v mc >/dev/null 2>&1; then
    echo "mc client required for S3 upload" >&2
    exit 1
  fi

  mc alias set backup-s3 "$BACKUP_S3_ENDPOINT" "$ACCESS_KEY" "$SECRET_KEY" --api S3v4 >/dev/null
  mc mb --ignore-existing "backup-s3/${BUCKET}" >/dev/null
  mc cp "$FILE" "backup-s3/${BUCKET}/${OBJECT}"
  echo "Backup uploaded: s3://${BUCKET}/${OBJECT} (endpoint=${BACKUP_S3_ENDPOINT} region=${REGION})"
fi
