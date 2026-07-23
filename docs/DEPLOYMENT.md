# GruaHub — Deploy

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- Java 21 + Maven 3.9+ (para build do backend)
- Node.js 20+ (para build do web)
- Expo CLI (para build do mobile)

## Ambiente Local (Desenvolvimento)

### 1. Copiar e preencher variáveis de ambiente

```bash
cp infra/.env.example infra/.env
# Segredos só vêm do .env — o compose não embute passwords/secrets.
# Para apps locais fora do compose, use também a raiz `.env.example`.
```

### 2. Subir infraestrutura

```bash
cd infra
docker compose up -d postgres keycloak emqx minio
```

Aguardar health checks:
```bash
docker compose ps
# todos devem estar "healthy"
```

### 3. Backend (dev mode com hot reload)

```bash
cd backend
./mvnw quarkus:dev
# disponível em http://localhost:8080
# Swagger UI: http://localhost:8080/q/swagger-ui
```

Liquibase roda automaticamente na inicialização e aplica todas as migrações + seed.

### 4. Frontend Web

```bash
cd web
npm install
npm run dev
# disponível em http://localhost:3000
```

### 5. Mobile (Expo Go)

```bash
cd mobile
npm install
npx expo start
# Escanear QR com Expo Go (Android/iOS)
# ou pressionar 'a' para Android Emulator / 'i' para iOS Simulator
```

### 6. Simuladores de máquina

```bash
cd simulators
npm install
npm run simulate
# publica heartbeats MQTT para as máquinas do seed
```

## Usuários Demo

| Email                     | Senha        | Role               |
|---------------------------|--------------|--------------------|
| admin@gruahub.com         | admin123     | PLATFORM_ADMIN     |
| operator@tenant1.com      | op123        | TENANT_ADMIN       |
| field@tenant1.com         | field123     | FIELD_OPERATOR     |
| tech@tenant1.com          | tech123      | TECHNICIAN         |
| finance@tenant1.com       | fin123       | FINANCE            |
| parceiro@estabelec1.com   | parceiro123  | ESTABLISHMENT_VIEWER|

## Build de Produção

### Backend (JVM)

```bash
cd backend
./mvnw package -DskipTests
# gera: target/gruahub-backend-1.0.0-SNAPSHOT-runner.jar
docker build -f src/main/docker/Dockerfile.jvm -t gruahub/backend:latest .
```

### Backend (Native — GraalVM)

```bash
./mvnw package -Pnative -DskipTests
# Requer GraalVM 21+ com native-image
docker build -f src/main/docker/Dockerfile.native -t gruahub/backend:native .
```

### Frontend Web

```bash
cd web
npm run build
# saída em .next/
# deploy: Vercel, AWS Amplify, ou Docker com nginx
```

### Mobile

```bash
cd mobile
eas build --platform android --profile production
eas build --platform ios --profile production
```

## Checklist de piloto

Antes de DNS público / Let's Encrypt / tráfego real, siga `docs/PILOT_CHECKLIST.md`
(sandbox off, sem seed demo, safety guard, backup offsite, player public só se necessário).

## Docker Compose — profiles comerciais (prod-like)

O compose principal expõe profiles opcionais. O modo **prod-like** usa ainda o overlay `docker-compose.prod-like.yml` (fecha exposição de app/admin no host).

| Profile | Serviços | Uso |
|---------|----------|-----|
| `tls` / `prod-like` | `caddy` (build com rate-limit) | HTTPS local (`https://localhost` + `https://auth.localhost`) |
| `backup` / `prod-like` | `postgres-backup` | `pg_dump` periódico para volume `postgres_backups` |
| `simulators` | machine/payment sim | Demo IoT/pagamento |

### HTTPS local (Caddy) — só TLS

```bash
cd infra
cp .env.example .env   # se ainda não existir
docker compose --profile tls up -d --build
```

- Entrada HTTPS: `https://localhost` (web) e `https://localhost/api/...` / `https://localhost/q/...` (backend)
- Auth no edge: `https://auth.localhost` → Keycloak (também disponível em `:8180` sem overlay)
- Certificado: Caddy `tls internal` — aceitar aviso do browser ou usar `curl -k`
- Headers de segurança: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Edge leve: rate-limit por IP (global + rotas OIDC) e bloqueio de paths de scanner (`waf_lite`)
- Neste modo (sem overlay), portas `3000`/`8080`/`8180` continuam no host para debug HTTP direto

### Prod-like (tráfego app + OIDC só via Caddy)

Fecha publicação no host de **backend (8080)**, **web (3000)**, **Keycloak (8180)**, **Postgres (5432)**, **MinIO (9000/9001)** e dashboards EMQX. Mantém MQTT `1883`/`8883`. OIDC no browser: `https://auth.localhost`.

```bash
cd infra
# no .env (defaults do overlay cobrem isso se omitido):
#   NEXTAUTH_URL=https://localhost
#   NEXT_PUBLIC_API_URL=https://localhost
#   GRUAHUB_CORS_ORIGINS=https://localhost
#   KEYCLOAK_EDGE_ISSUER=https://auth.localhost/realms/gruahub   # default do overlay
./scripts/up-prod-like.sh up -d --build
```

Equivalente manual:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod-like.yml --profile prod-like up -d --build
```

Verificação rápida:

```bash
curl -kI https://localhost | tr -d '\r' | grep -iE 'strict-transport|x-content-type|x-frame'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/q/health/ready   # esperado: falha de conexão
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8180/                  # esperado: falha de conexão
curl -k -s -o /dev/null -w '%{http_code}\n' https://localhost/q/health/ready     # esperado: 200
curl -k -s https://auth.localhost/realms/gruahub/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
# esperado: "issuer":"https://auth.localhost/realms/gruahub"
```

Login: Keycloak atrás do Caddy (`auth.localhost`) + brute-force no realm (`failureFactor=5`). Web/backend usam `KEYCLOAK_EDGE_ISSUER` (default `https://auth.localhost/realms/gruahub`); JWKS via `KEYCLOAK_URL=http://keycloak:8080` (backchannel).

### Let's Encrypt / DNS real (config pronta, sem cert público no CI)

Template: `infra/caddy/Caddyfile.public.example`.

1. DNS A/AAAA: `app.exemplo.com` e `auth.exemplo.com` → IP do host
2. No `.env` de produção: `GRUAHUB_PUBLIC_HOST=app.exemplo.com`, `GRUAHUB_AUTH_HOST=auth.exemplo.com`, `CADDY_ACME_EMAIL=ops@exemplo.com`
3. Trocar o volume do Caddyfile para o template público (ou copiar sobre `Caddyfile`) e remover `tls internal` / `local_certs`
4. Alinhar issuer/OIDC: `KEYCLOAK_EDGE_ISSUER=https://auth.exemplo.com/realms/gruahub`, `NEXTAUTH_URL`/`NEXT_PUBLIC_API_URL`/`GRUAHUB_CORS_ORIGINS` no host público, `KC_HOSTNAME=auth.exemplo.com`
5. Caddy emite/renova Let's Encrypt automaticamente na porta 80/443 — **não** é exercitado no CI (só `tls internal` local)

### Backup Postgres (local + offsite opcional)

```bash
cd infra
docker compose --profile backup up -d --build postgres postgres-backup
# dumps em volume nomeado postgres_backups; retenção via BACKUP_RETENTION_DAYS
# one-shot manual (stack já no ar):
docker compose --profile backup run --rm postgres-backup /scripts/pg-backup.sh
```

Variáveis locais: `BACKUP_INTERVAL_SECONDS` (default 86400), `BACKUP_RETENTION_DAYS` (default 7).

Offsite S3-compatible (opcional) — use MinIO da stack ou AWS:

```bash
# no infra/.env
BACKUP_S3_ENDPOINT=http://minio:9000
BACKUP_S3_ACCESS_KEY=minioadmin
BACKUP_S3_SECRET_KEY=minioadmin
BACKUP_S3_BUCKET=gruahub
BACKUP_S3_PREFIX=postgres-backups
```

Se `BACKUP_S3_ENDPOINT` estiver vazio, o job só grava no volume. Com endpoint definido, faz `mc cp` após o `pg_dump`.

### Restore drill

```bash
cd infra
docker compose --profile backup up -d --build postgres postgres-backup minio
docker compose --profile backup run --rm postgres-backup /scripts/pg-backup.sh
docker compose --profile backup run --rm postgres-backup /scripts/pg-restore-drill.sh
```

O drill restaura o dump mais recente num DB temporário `${POSTGRES_DB}_restore_drill`, valida schemas/tabelas de aplicação e apaga o DB. Não substitui restore de desastre em produção — é smoke de integridade do artefato.

### Runbook DR (backup / restore / retenção)

Expectativa honesta do MVP (não é SLA contratual):

| Item | Valor sugerido | Notas |
|------|----------------|-------|
| RPO | ≈ intervalo do job (`BACKUP_INTERVAL_SECONDS`, default 24h) | Sem PITR/WAL archiving |
| RTO | horas (restore manual + validação) | Depende do tamanho do dump e do host |
| Retenção local | `BACKUP_RETENTION_DAYS` (default 7) | `find -mtime` no volume `postgres_backups` |
| Offsite | obrigatório em piloto público | `BACKUP_S3_*`; retenção no bucket é política do provedor (lifecycle), não automatizada pelo job |

**Antes de um incidente (rotina):**

1. Profile `backup` ou `prod-like` ativo com `postgres-backup` saudável
2. Offsite configurado (`BACKUP_S3_ENDPOINT` + credenciais) — volume local sozinho não basta contra perda do host
3. Drill semanal (ou após mudança de schema): `docker compose --profile backup run --rm postgres-backup /scripts/pg-restore-drill.sh`
4. Guardar fora do host: credenciais DB, Keycloak admin, e caminho do último dump conhecido

**Restore de desastre (produção — cuidado):**

```bash
cd infra
# 1) Identificar artefato (local ou baixar do S3/MinIO)
# ls do volume, ou: mc cp backup-s3/bucket/prefix/arquivo.sql.gz ./

# 2) Parar writers (backend/web) para evitar escrita durante restore
docker compose stop backend web

# 3) Restaurar no database real (NÃO usar o drill DB)
# Exemplo destrutivo — confirma backup + janela de manutenção:
gunzip -c /caminho/gruahub_YYYYMMDDTHHMMSSZ.sql.gz \
  | docker compose exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

# 4) Subir apps e validar
docker compose start backend web
curl -sf http://localhost:8080/q/health/ready
# login OIDC + smoke de frota/alertas
```

Scripts alinhados: `pg-backup.sh` (dump + retenção local + upload opcional), `pg-backup-loop.sh` (agendamento), `pg-restore-drill.sh` (smoke não destrutivo). Não há script de restore destrutivo versionado de propósito — o passo 3 exige decisão humana.

Ainda aberto: PITR, retenção S3 automatizada no job, failover multi-região, Vault/SM com rotação.

### Push notifications

Backend: porta `PushNotifier` com providers:

| `GRUAHUB_PUSH_PROVIDER` | Comportamento |
|-------------------------|---------------|
| `noop` (default) | Log `[PUSH-NOOP]` — sem entrega externa |
| `http-stub` | POST JSON em `GRUAHUB_PUSH_HTTP_STUB_URL` (webhook de teste) |
| `expo` | Expo Push API + tokens em `device_token` |

Registro de device: `POST /api/v1/devices/push-tokens` `{ token, platform }`.

Mobile: `usePushNotifications` pede permissão, obtém Expo push token (requer `EXPO_PUBLIC_EAS_PROJECT_ID` / `eas init`) e registra no backend.

Piloto recomendado: `GRUAHUB_PUSH_PROVIDER=expo` + build EAS preview com projectId real.

### Anexos de visita (fotos)

`POST /api/v1/visits/{visitId}/attachments` (JSON base64, idempotente via `clientOperationId`) grava em MinIO/S3 (`visit_attachment`). O app mobile enfileira `UPLOAD_PHOTO` e sincroniza automaticamente.

### Monitoramento (uptime)

Health já exposto:

```bash
curl -sf http://localhost:8080/q/health/live
curl -sf http://localhost:8080/q/health/ready
# via Caddy: curl -k -sf https://localhost/q/health/ready
```

**Opção A — Uptime Kuma (Compose profile `monitoring`):**

```bash
cd infra
docker compose --profile monitoring up -d
# UI: http://localhost:3002
```

Monitores sugeridos (criar na UI na primeira subida):

| Nome | Tipo | URL / alvo |
|------|------|------------|
| backend-ready | HTTP(s) | `http://backend:8080/q/health/ready` (rede compose) |
| web | HTTP(s) | `http://web:3000/api/health` |
| edge-ready | HTTP(s) | `https://caddy/q/health/ready` só se Caddy estiver no profile; ou `https://host.docker.internal/...` |

Configure alerta mínimo na UI (e-mail/Discord/Telegram) — Kuma persiste em volume `uptime_kuma_data`.

**Opção B — uptime externo** (sem profile): aponte UptimeRobot / Better Stack / similar para `https://<host-publico>/q/health/ready` com intervalo 1–5 min e alerta por e-mail/Slack. Não substitui métricas APM; só disponibilidade.

### Segredos via `*_FILE` (Docker secrets style)

Sem Vault completo: qualquer `VAR_FILE` apontando para um arquivo montado preenche `VAR` se `VAR` estiver vazio (`infra/scripts/load-secret-files.sh`).

Hook ativo em:
- backend / web (entrypoint)
- postgres-backup (scripts)

Exemplo Compose:

```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
services:
  backend:
    secrets: [db_password]
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password
```

Ainda aberto para produção gerenciada: rotação automática via Vault / AWS Secrets Manager.

### Produção pública (ainda aberto)

Além dos profiles locais, um deploy público deve:
- Aplicar `Caddyfile.public.example` com DNS real (Let's Encrypt automático; não coberto no CI)
- Usar imagens versionadas (não só `build:`)
- Definir réplicas e limites de recursos
- Completar Vault / AWS Secrets Manager (hoje: `.env` + caminho `*_FILE`)
- WAF comercial / rate-limit distribuído (hoje: edge leve in-process no Caddy + API in-memory)

## Variáveis de Ambiente Críticas

| Variável                          | Descrição                              |
|-----------------------------------|----------------------------------------|
| `QUARKUS_DATASOURCE_JDBC_URL`     | JDBC URL do PostgreSQL                 |
| `QUARKUS_DATASOURCE_PASSWORD`     | Senha do banco                         |
| `QUARKUS_OIDC_AUTH_SERVER_URL`    | URL do realm Keycloak                  |
| `GRUAHUB_MQTT_BROKER_URL`         | URL do EMQX (tcp://host:1883)          |
| `GRUAHUB_MQTT_PASSWORD`           | Senha do usuário backend no EMQX       |
| `GRUAHUB_SANDBOX_WEBHOOK_SECRET`  | Segredo HMAC do webhook                |
| `AWS_ACCESS_KEY_ID`               | Chave MinIO/S3                         |
| `AWS_SECRET_ACCESS_KEY`           | Segredo MinIO/S3                       |
| `NEXTAUTH_SECRET`                 | Segredo de sessão Next.js              |
| `KEYCLOAK_SECRET`                 | Client secret do cliente gruahub-web   |
| `GRUAHUB_PUSH_PROVIDER`           | `noop`, `http-stub` ou `expo` (default `noop`) |
| `GRUAHUB_PUSH_HTTP_STUB_URL`      | URL POST do stub (só com `http-stub`)  |
| `GRUAHUB_PUSH_EXPO_URL`           | Expo Push API (default oficial)        |
| `BACKUP_RETENTION_DAYS`           | Retenção local dos dumps (default 7)   |
| `BACKUP_S3_ENDPOINT`              | Offsite S3-compatible (opcional)       |

## Health Checks e Readiness

```bash
# Backend
curl http://localhost:8080/q/health/live   # 200 UP
curl http://localhost:8080/q/health/ready  # 200 UP

# Database
curl http://localhost:8080/q/health | jq '.checks[] | select(.name == "Database connections health check")'

# Uptime local (profile monitoring): http://localhost:3002
```

## Rollback de Migração

Liquibase não faz rollback automático em produção. Para reverter:

```bash
cd backend
./mvnw liquibase:rollback -Dliquibase.rollbackCount=1
```

Cada changeset deve ter `<rollback>` definido para suporte ao rollback manual.
