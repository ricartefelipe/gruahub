#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing infra/.env — copy from .env.example and fill secrets." >&2
  exit 1
fi

exec docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod-like.yml \
  --profile prod-like \
  "$@"
