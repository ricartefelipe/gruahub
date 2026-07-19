#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/contracts/openapi"
TMP="$ROOT/backend/target/openapi"

mkdir -p "$OUT"

(
  cd "$ROOT/backend"
  ./mvnw -B package -DskipTests \
    -Dquarkus.smallrye-openapi.store-schema-directory=target/openapi
)

cp "$TMP/openapi.yaml" "$OUT/openapi.yaml"
cp "$TMP/openapi.json" "$OUT/openapi.json"

echo "OpenAPI exportado para $OUT"
