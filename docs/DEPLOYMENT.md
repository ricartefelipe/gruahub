# GruaHub — Deploy

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- Java 21 + Maven 3.9+ (para build do backend)
- Node.js 20+ (para build do web)
- Expo CLI (para build do mobile)

## Ambiente Local (Desenvolvimento)

### 1. Copiar e preencher variáveis de ambiente

```bash
cp .env.example .env
# Edite .env — troque os valores CHANGE_ME_IN_PRODUCTION
```

### 2. Subir infraestrutura

```bash
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

## Docker Compose — Produção

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

O `docker-compose.prod.yml` (a criar) deve:
- Usar imagens de build (não `build: .`)
- Definir réplicas e limites de recursos
- Configurar Traefik/nginx para TLS
- Usar segredos Docker Secrets ou Vault ao invés de `.env`

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
