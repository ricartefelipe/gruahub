#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
PUBLIC_IP="${PUBLIC_IP:-54.94.163.136}"

cd "$INFRA"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Criado infra/.env a partir de .env.example"
fi

export NEXTAUTH_URL="${NEXTAUTH_URL:-http://${PUBLIC_IP}:9083}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://${PUBLIC_IP}:8084}"
export KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://${PUBLIC_IP}:8182/realms/gruahub}"
export GRUAHUB_CORS_ORIGINS="${GRUAHUB_CORS_ORIGINS:-http://${PUBLIC_IP}:9083,http://localhost:9083,http://localhost:3000}"

echo "==> GruaHub portfolio (web :9083 · API :8084 · Keycloak :8182)"
docker compose -f docker-compose.yml -f docker-compose.portfolio.yml up -d --build

echo "==> Aguardando health da API..."
ok=0
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8084/q/health" || true)"
  if [[ "$code" == "200" ]]; then
    ok=1
    break
  fi
  sleep 4
done

echo
echo "Web UI:   http://${PUBLIC_IP}:9083"
echo "Swagger:  http://${PUBLIC_IP}:8084/q/swagger-ui"
echo "Health:   http://${PUBLIC_IP}:8084/q/health"
echo "Keycloak: http://${PUBLIC_IP}:8182"
echo "Login:    gestor@diversao.demo / gruahub@2025"
if [[ "$ok" -eq 1 ]]; then
  echo "Status:   API healthy"
else
  echo "Status:   API ainda não respondeu health — veja: docker compose -f docker-compose.yml -f docker-compose.portfolio.yml logs backend"
  exit 1
fi
