#!/usr/bin/env bash
# Libera portas do host usadas pelo compose demo do GruaHub.
#
# Casos cobertos:
#   1) Dois engines Docker (dockerd do sistema + Docker Desktop) — stack antiga
#      num context e `docker compose up` no outro → "port already in use"
#   2) Container gruahub-backend preso em Created + docker-proxy órfão
#   3) Quarkus no host (quarkus:dev / quarkus-run.jar) na :8080
#
# Uso:
#   ./scripts/free-host-ports.sh
#   ./scripts/free-host-ports.sh 8080 3000
#   ./run.sh free-ports
#   ./run.sh up          # chama este script automaticamente
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_PORTS=(8080 8180 3000 5432 1883 8883 18083 9000 9001)

PORTS=("$@")
if [ "${#PORTS[@]}" -eq 0 ]; then
  # shellcheck disable=SC2206
  PORTS=(${GRUAHUB_FREE_PORTS:-${DEFAULT_PORTS[*]}})
fi

step() { printf '==> %s\n' "$1"; }
ok()   { printf '    OK: %s\n' "$1"; }
warn() { printf '    Aviso: %s\n' "$1" >&2; }

port_in_use() {
  local port="$1"
  ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .
}

docker_contexts() {
  local ctxs=()
  local c
  if command -v docker >/dev/null 2>&1; then
    while IFS= read -r c; do
      [ -n "$c" ] && ctxs+=("$c")
    done < <(docker context ls -q 2>/dev/null || true)
  fi
  if [ "${#ctxs[@]}" -eq 0 ]; then
    ctxs=(default)
  fi
  # Garante default (dockerd do sistema) mesmo se o CLI estiver no Desktop.
  local has_default=0
  for c in "${ctxs[@]}"; do
    [ "$c" = "default" ] && has_default=1
  done
  if [ "$has_default" -eq 0 ]; then
    ctxs+=(default)
  fi
  printf '%s\n' "${ctxs[@]}"
}

docker_ctx() {
  local ctx="$1"
  shift
  docker -c "$ctx" "$@"
}

free_containers_on_port_all_contexts() {
  local port="$1"
  local ctx ids
  while IFS= read -r ctx; do
    ids="$(docker_ctx "$ctx" ps -aq --filter "publish=${port}" 2>/dev/null || true)"
    if [ -n "$ids" ]; then
      step "Context ${ctx}: removendo container(s) na :${port}"
      # shellcheck disable=SC2086
      docker_ctx "$ctx" rm -f $ids >/dev/null
      ok "Context ${ctx}: :${port} liberada (containers)."
    fi
  done < <(docker_contexts)
}

free_gruahub_named_all_contexts() {
  local ctx ids status name
  # Nomes fixos do compose — evita stack fantasma no dockerd do sistema.
  local names=(
    gruahub-backend gruahub-web gruahub-keycloak gruahub-postgres
    gruahub-emqx gruahub-minio gruahub-minio-setup gruahub-emqx-users
    gruahub-caddy gruahub-uptime-kuma
  )
  while IFS= read -r ctx; do
    for name in "${names[@]}"; do
      ids="$(docker_ctx "$ctx" ps -aq --filter "name=^/${name}$" 2>/dev/null || true)"
      [ -n "$ids" ] || continue
      status="$(docker_ctx "$ctx" inspect -f '{{.State.Status}}' $ids 2>/dev/null || true)"
      # Remove qualquer instância fora do context ativo só se estiver
      # ocupando portas do demo — na prática, remove stacks gruahub
      # duplicadas em engines secundários.
      if [ "$ctx" != "$(docker context show 2>/dev/null || echo default)" ] || [ "$status" != "running" ]; then
        step "Context ${ctx}: removendo ${name} (status=${status:-?})"
        # shellcheck disable=SC2086
        docker_ctx "$ctx" rm -f $ids >/dev/null 2>&1 || true
      fi
    done
  done < <(docker_contexts)
}

# Se o CLI aponta para Desktop mas o dockerd do sistema ainda tem a stack
# GruaHub, derruba essa stack do sistema (é a causa clássica da :8080 presa).
free_stale_system_stack() {
  local active
  active="$(docker context show 2>/dev/null || echo default)"
  if [ "$active" = "default" ]; then
    return 0
  fi
  if ! docker -c default info >/dev/null 2>&1; then
    return 0
  fi
  local ids
  ids="$(docker -c default ps -aq --filter "name=gruahub-" 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    return 0
  fi
  step "Context default (dockerd sistema): stack GruaHub fantasma detectada — removendo"
  # shellcheck disable=SC2086
  docker -c default rm -f $ids >/dev/null
  # Redes órfãs do projeto
  docker -c default network rm infra_gruahub >/dev/null 2>&1 || true
  ok "Stack do dockerd sistema removida (CLI usa ${active})."
}

free_host_quarkus_on_port() {
  local port="$1"
  [ "$port" = "8080" ] || return 0

  local pids pid cwd
  pids="$(ps -eo pid=,args= 2>/dev/null | awk '
    /quarkus:dev|quarkus-run\.jar/ && $0 !~ /awk/ && $0 !~ /docker/ { print $1 }
  ' || true)"
  [ -n "$pids" ] || return 0

  for pid in $pids; do
    [ "$(stat -c %u "/proc/${pid}" 2>/dev/null || echo)" = "$(id -u)" ] || continue
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if ss -H -ltnp 2>/dev/null | grep -E ":${port}\\b" | grep -q "pid=${pid}" \
      || [[ "$cwd" == *"gruahub/backend"* ]]; then
      step "Encerrando Quarkus no host (pid ${pid})"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
      ok "Processo ${pid} encerrado."
    fi
  done
}

list_docker_proxy_pids() {
  local port="$1"
  ps -eo pid=,args= 2>/dev/null | awk -v p="$port" '
    $0 ~ /\/docker-proxy( |$)/ && $0 ~ ("-host-port " p " ") { print $1 }
  '
}

kill_orphan_docker_proxies() {
  local port="$1"
  local pids
  pids="$(list_docker_proxy_pids "$port" | xargs 2>/dev/null || true)"
  [ -n "$pids" ] || return 0

  step "Removendo docker-proxy órfão na :${port} (pids: ${pids})"
  # shellcheck disable=SC2086
  if kill $pids 2>/dev/null; then
    sleep 0.4
  fi
  if port_in_use "$port"; then
    # shellcheck disable=SC2086
    if sudo -n kill -9 $pids 2>/dev/null; then
      sleep 0.4
    elif [ -t 0 ] && sudo kill -9 $pids 2>/dev/null; then
      sleep 0.4
    else
      warn "Sem permissão para kill nos docker-proxy. Rode: sudo kill -9 ${pids}"
      return 1
    fi
  fi
  if port_in_use "$port"; then
    return 1
  fi
  ok "Porta :${port} liberada (docker-proxy)."
  return 0
}

warn_dual_docker() {
  local active sys_ids desk_ids
  active="$(docker context show 2>/dev/null || echo default)"
  sys_ids="$(docker -c default ps -aq --filter "name=gruahub-" 2>/dev/null || true)"
  if docker -c desktop-linux info >/dev/null 2>&1; then
    desk_ids="$(docker -c desktop-linux ps -aq --filter "name=gruahub-" 2>/dev/null || true)"
  else
    desk_ids=""
  fi
  if [ -n "$sys_ids" ] && [ -n "$desk_ids" ]; then
    warn "Há containers GruaHub no dockerd sistema E no Docker Desktop."
    warn "Context ativo: ${active}. Prefira um único engine."
  elif [ "$active" != "default" ] && [ -n "$sys_ids" ]; then
    warn "CLI em '${active}' mas ainda há GruaHub no dockerd sistema (default)."
  fi
}

main() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'ERRO: docker não encontrado no PATH.\n' >&2
    exit 1
  fi
  if ! command -v ss >/dev/null 2>&1; then
    printf 'ERRO: ss (iproute2) é necessário.\n' >&2
    exit 1
  fi

  cd "$INFRA_DIR"

  step "Context Docker ativo: $(docker context show 2>/dev/null || echo '?')"
  warn_dual_docker
  free_stale_system_stack

  local port failed=0
  for port in "${PORTS[@]}"; do
    free_host_quarkus_on_port "$port"
    if ! port_in_use "$port"; then
      ok ":${port} já livre."
      continue
    fi
    step "Porta :${port} em uso — liberando..."
    free_containers_on_port_all_contexts "$port"
    if ! port_in_use "$port"; then
      ok ":${port} liberada."
      continue
    fi
    if ! kill_orphan_docker_proxies "$port"; then
      printf '    ERRO: porta :%s ainda em uso.\n' "$port" >&2
      failed=1
    else
      ok ":${port} liberada."
    fi
  done

  # Limpeza residual de nomes gruahub em contexts secundários
  free_gruahub_named_all_contexts

  if [ "$failed" -ne 0 ]; then
    exit 1
  fi
  step "Portas prontas: ${PORTS[*]}"
}

main "$@"
