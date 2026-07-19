#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
INFRA_DIR="$SCRIPT_DIR"

COMMAND="${1:-up}"

step() { printf '\n==> %s\n' "$1"; }
ok()   { printf '    OK: %s\n' "$1"; }
fail() { printf '    ERRO: %s\n' "$1" >&2; }

build_backend() {
    step "Compilando backend Quarkus no host..."

    local mvn_cmd
    if command -v mvn >/dev/null 2>&1; then
        mvn_cmd="mvn"
    elif [ -x "$BACKEND_DIR/mvnw" ]; then
        mvn_cmd="$BACKEND_DIR/mvnw"
    elif [ -f "$BACKEND_DIR/mvnw" ]; then
        chmod +x "$BACKEND_DIR/mvnw"
        mvn_cmd="$BACKEND_DIR/mvnw"
    else
        fail "Maven não encontrado (nem 'mvn' no PATH nem 'mvnw' no backend)."
        exit 1
    fi

    ( cd "$BACKEND_DIR" && "$mvn_cmd" package -DskipTests -B --no-transfer-progress )

    if [ ! -f "$BACKEND_DIR/target/quarkus-app/quarkus-run.jar" ]; then
        fail "target/quarkus-app/quarkus-run.jar não encontrado após build"
        exit 1
    fi
    ok "Backend compilado."
}

cd "$INFRA_DIR"

case "${COMMAND,,}" in
    build)
        build_backend
        ;;
    up)
        build_backend
        step "Construindo imagem Docker do backend..."
        docker compose build backend
        step "Subindo todos os serviços..."
        docker compose up -d
        ok "Serviços iniciados. Aguarde health checks (~2 min)."
        printf '\n  Backend:  http://localhost:8080/q/swagger-ui\n'
        printf '  Web:      http://localhost:3000\n'
        printf '  Keycloak: http://localhost:8180  (admin/admin)\n'
        printf '  EMQX:     http://localhost:18083 (admin/public)\n'
        printf '  MinIO:    http://localhost:9001  (minioadmin/minioadmin)\n\n'
        ;;
    infra)
        step "Subindo apenas infraestrutura (sem backend/web)..."
        docker compose up -d postgres keycloak emqx minio minio-setup
        ok "Infra iniciada."
        printf '\n  Para rodar o backend em modo dev (hot-reload):\n'
        printf '  cd backend && ./mvnw quarkus:dev\n\n'
        ;;
    down)
        step "Parando serviços..."
        docker compose down
        ok "Serviços parados."
        ;;
    logs)
        docker compose logs -f
        ;;
    *)
        printf 'Uso: ./run.sh [up | down | build | logs | infra]\n'
        ;;
esac
