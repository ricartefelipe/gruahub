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

## Docker Compose — profiles comerciais (prod-like)

O compose principal expõe profiles opcionais. O modo **prod-like** usa ainda o overlay `docker-compose.prod-like.yml` (fecha exposição de app/admin no host).

| Profile | Serviços | Uso |
|---------|----------|-----|
| `tls` / `prod-like` | `caddy` | HTTPS local (`https://localhost`) com certificado interno |
| `backup` / `prod-like` | `postgres-backup` | `pg_dump` periódico para volume `postgres_backups` |
| `simulators` | machine/payment sim | Demo IoT/pagamento |

### HTTPS local (Caddy) — só TLS

```bash
cd infra
cp .env.example .env   # se ainda não existir
docker compose --profile tls up -d
```

- Entrada HTTPS: `https://localhost` (web) e `https://localhost/api/...` / `https://localhost/q/...` (backend)
- Certificado: Caddy `tls internal` — aceitar aviso do browser ou usar `curl -k`
- Headers de segurança: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Neste modo (sem overlay), portas `3000`/`8080` continuam no host para debug HTTP direto

### Prod-like (tráfego app só via Caddy)

Fecha publicação no host de **backend (8080)**, **web (3000)**, **Postgres (5432)**, **MinIO (9000/9001)** e dashboards EMQX. Mantém MQTT `1883`/`8883` e Keycloak `8180` (OIDC no browser).

```bash
cd infra
# no .env:
#   NEXTAUTH_URL=https://localhost
#   NEXT_PUBLIC_API_URL=https://localhost
#   GRUAHUB_CORS_ORIGINS=https://localhost
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
curl -k -s -o /dev/null -w '%{http_code}\n' https://localhost/q/health/ready     # esperado: 200
```

Login: Keycloak realm com brute-force protection (`failureFactor=5`). Proxy Keycloak atrás do Caddy ainda é gap (porta 8180 permanece).

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
- Trocar `tls internal` por Let's Encrypt / cert gerenciado (DNS real)
- Colocar Keycloak atrás do mesmo edge (sem `:8180` no host)
- Usar imagens versionadas (não só `build:`)
- Definir réplicas e limites de recursos
- Completar Vault / AWS Secrets Manager (hoje: `.env` + caminho `*_FILE`)

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

## Health Checks e Readiness

```bash
# Backend
curl http://localhost:8080/q/health/live   # 200 UP
curl http://localhost:8080/q/health/ready  # 200 UP

# Database
curl http://localhost:8080/q/health | jq '.checks[] | select(.name == "Database connections health check")'
```

## Rollback de Migração

Liquibase não faz rollback automático em produção. Para reverter:

```bash
cd backend
./mvnw liquibase:rollback -Dliquibase.rollbackCount=1
```

Cada changeset deve ter `<rollback>` definido para suporte ao rollback manual.
