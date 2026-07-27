#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

JOBS="${CI_LOCAL_JOBS:-contracts,simulators,firmware}"
FAILED=0

log() { printf '\n==> %s\n' "$*"; }
ok() { printf 'OK  %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; FAILED=1; }

has_job() {
  [[ ",$JOBS," == *",$1,"* ]] || [[ "$JOBS" == "all" ]]
}

run_contracts() {
  log "contracts (MQTT + OpenAPI)"
  if ! command -v ajv >/dev/null 2>&1; then
    npm install -g ajv-cli@5 ajv-formats >/dev/null
  fi
  if ! command -v redocly >/dev/null 2>&1; then
    npm install -g @redocly/cli@1 >/dev/null
  fi
  ajv compile --spec=draft7 -c ajv-formats -s contracts/mqtt/schema-v1.json
  shopt -s nullglob
  local examples=(contracts/mqtt/examples/*.json)
  if [[ ${#examples[@]} -eq 0 ]]; then
    fail "nenhum exemplo MQTT"
    return
  fi
  local f
  for f in "${examples[@]}"; do
    ajv validate --spec=draft7 -c ajv-formats -s contracts/mqtt/schema-v1.json -d "$f"
  done
  test -f contracts/openapi/openapi.yaml
  test -f contracts/openapi/openapi.json
  redocly lint contracts/openapi/openapi.yaml --extends=minimal
  ok "contracts"
}

run_simulators() {
  log "simulators (tsc + build)"
  (
    cd simulators/machine-simulator
    npm ci
    npx tsc --noEmit
    npm run build
  )
  (
    cd simulators/payment-simulator
    npm ci
    npx tsc --noEmit
    npm run build
  )
  ok "simulators"
}

run_firmware() {
  log "firmware adaptador-fino (pio)"
  if ! command -v pio >/dev/null 2>&1; then
    fail "PlatformIO (pio) não encontrado — pule com CI_LOCAL_JOBS sem firmware"
    return
  fi
  (
    cd firmware/adaptador-fino
    pio run -e esp32dev
  )
  ok "firmware"
}

run_web() {
  log "web (tsc + lint + test + build)"
  (
    cd web
    npm ci
    npx tsc --noEmit
    npm run lint
    npm test -- --passWithNoTests --ci
    NEXTAUTH_SECRET=ci-secret-not-for-production \
    NEXTAUTH_URL=http://localhost:3000 \
    NEXT_PUBLIC_API_URL=http://localhost:8080 \
    KEYCLOAK_ID=gruahub-web \
    KEYCLOAK_SECRET=ci-placeholder \
    KEYCLOAK_ISSUER=http://localhost:8180/realms/gruahub \
    npm run build
  )
  ok "web"
}

run_mobile() {
  log "mobile (tests)"
  (
    cd mobile
    npm ci
    npm test -- --ci
  )
  ok "mobile"
}

run_backend() {
  log "backend (mvn verify) — requer Postgres em localhost:5432"
  (
    cd backend
    ./mvnw -B verify -Dquarkus.test.profile=test -Dquarkus.datasource.devservices.enabled=false
  )
  ok "backend"
}

usage() {
  cat <<'EOF'
Uso: scripts/ci-local.sh

Espelha checks do GitHub Actions quando o Actions remoto está indisponível
(billing / spending limit).

Jobs (CI_LOCAL_JOBS, CSV):
  contracts   MQTT schema + examples + OpenAPI   [default]
  simulators  tsc + build dos simuladores          [default]
  firmware    pio run -e esp32dev                  [default]
  web         lint + build Next.js
  mobile      testes Expo
  backend     mvn verify (precisa Postgres)
  all         todos acima

Exemplos:
  ./scripts/ci-local.sh
  CI_LOCAL_JOBS=contracts,simulators ./scripts/ci-local.sh
  CI_LOCAL_JOBS=all ./scripts/ci-local.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

has_job contracts && run_contracts
has_job simulators && run_simulators
has_job firmware && run_firmware
has_job web && run_web
has_job mobile && run_mobile
has_job backend && run_backend

if [[ "$FAILED" -ne 0 ]]; then
  log "ci-local: FALHOU"
  exit 1
fi
log "ci-local: OK ($JOBS)"
