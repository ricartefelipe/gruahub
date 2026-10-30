#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$ROOT/infra"
PUBLIC_IP="${PUBLIC_IP:-54.94.163.136}"
PUBLIC_HOST="${PUBLIC_HOST:-gruahub.${PUBLIC_IP}.sslip.io}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://${PUBLIC_HOST}}"

cd "$INFRA"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Criado infra/.env a partir de .env.example"
fi

export PORTFOLIO_NEXTAUTH_URL="${NEXTAUTH_URL:-$PUBLIC_ORIGIN}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api/gh}"
export PORTFOLIO_KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://${PUBLIC_IP}:8182/realms/gruahub}"
export GRUAHUB_CORS_ORIGINS="${GRUAHUB_CORS_ORIGINS:-$PUBLIC_ORIGIN,http://${PUBLIC_IP}:9083,http://localhost:9083,http://localhost:3000}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://backend:8080}"

# Fronteira de confiança da demo pública: o login do Keycloak e a API só devem ser expostos
# em texto claro se o operador aceitar isso explicitamente (PORTFOLIO_ALLOW_HTTP=true).
# Sem TLS, as credenciais da demo trafegam em claro pela Internet até o host.
API_PUBLIC_URL="${API_PUBLIC_URL:-http://${PUBLIC_IP}:8084}"
KEYCLOAK_PUBLIC_URL="${PORTFOLIO_KEYCLOAK_ISSUER%/realms/*}"
for exposed in "$PUBLIC_ORIGIN" "$API_PUBLIC_URL" "$PORTFOLIO_KEYCLOAK_ISSUER"; do
  if [[ "$exposed" == http://* && "$exposed" != http://localhost* && "$exposed" != http://127.0.0.1* && "${PORTFOLIO_ALLOW_HTTP:-false}" != "true" ]]; then
    echo "ABORTADO: '$exposed' expõe login/API em texto claro fora do host. Coloque o Keycloak e a API atrás da borda TLS (PUBLIC_ORIGIN/API_PUBLIC_URL/KEYCLOAK_ISSUER com https) ou aceite o risco explicitamente com PORTFOLIO_ALLOW_HTTP=true." >&2
    exit 2
  fi
done

if [[ -f .env ]]; then
  if grep -q '^GRUAHUB_CORS_ORIGINS=' .env; then
    sed -i.bak "s|^GRUAHUB_CORS_ORIGINS=.*|GRUAHUB_CORS_ORIGINS=${GRUAHUB_CORS_ORIGINS}|" .env
  else
    printf '\nGRUAHUB_CORS_ORIGINS=%s\n' "$GRUAHUB_CORS_ORIGINS" >> .env
  fi
fi

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
echo "Web UI:   ${PUBLIC_ORIGIN}"
echo "Swagger:  ${API_PUBLIC_URL}/q/swagger-ui"
echo "Health:   ${API_PUBLIC_URL}/q/health"
echo "Keycloak: ${KEYCLOAK_PUBLIC_URL}"
echo "Login:    gestor@diversao.demo / gruahub@2025"
if [[ "${PORTFOLIO_ALLOW_HTTP:-false}" == "true" ]]; then
  echo "AVISO:    exposição em texto claro aceita explicitamente (PORTFOLIO_ALLOW_HTTP=true)."
fi
if [[ "$ok" -eq 1 ]]; then
  echo "Status:   API healthy"
else
  echo "Status:   API ainda não respondeu health — veja: docker compose -f docker-compose.yml -f docker-compose.portfolio.yml logs backend"
  exit 1
fi
