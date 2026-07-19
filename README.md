# GruaHub MVP

Plataforma B2B multi-tenant para gestão de máquinas de pelúcia e gruas: telemetria IoT, pagamentos, jogadas, estoque, visitas de campo e portal de parceiros.

## Componentes

| Componente | Stack | Porta |
|---|---|---|
| **Backend** | Quarkus 3.8 + Java 21 | 8080 |
| **Frontend Web** | Next.js 14 App Router | 3000 |
| **App Mobile** | Expo 51 / React Native | — |
| **Keycloak** | v24 (auth) | 8180 (demo) / `https://auth.localhost` (prod-like) |
| **PostgreSQL** | v16 | 5432 |
| **EMQX** | v5.7 (MQTT) | 1883 / 8083 |
| **MinIO** | S3-compatible | 9000 |

## Início rápido

### Pré-requisitos

- Docker Desktop ≥ 4.28 (com Compose V2)
- Node.js 20+ (para web e mobile)
- Java 21+ (para backend local, opcional — o Docker constrói tudo)

### 1. Subir infraestrutura

```bash
cp infra/.env.example infra/.env   # segredos obrigatórios — sem defaults no compose
cd infra
docker compose up -d
```

Aguarde todos os serviços ficarem `healthy` (30–60 s):
```bash
docker compose ps
```

#### Profiles comerciais (opcional)

```bash
# Prod-like: Caddy HTTPS + backup + sem publicar 8080/3000/8180/admin no host
./scripts/up-prod-like.sh up -d --build

# ou só TLS / só backup / só monitoramento (portas de debug ainda no host):
docker compose --profile tls up -d --build
docker compose --profile backup up -d
docker compose --profile monitoring up -d
```

- HTTPS: `https://localhost` + OIDC `https://auth.localhost` (certificado interno — `curl -k`)
- Prod-like: `KEYCLOAK_EDGE_ISSUER` default `https://auth.localhost/realms/gruahub`
- Backup: volume `postgres_backups`; offsite opcional via `BACKUP_S3_*`; drill `pg-restore-drill.sh`; runbook DR em `DEPLOYMENT.md`
- Monitoramento: Uptime Kuma em `http://localhost:3002` (profile `monitoring`)
- Push: stub `GRUAHUB_PUSH_PROVIDER=noop|http-stub` (não é FCM completo)
- Segredos: preferir `infra/.env`; produção pode usar `VAR_FILE` (ver `DEPLOYMENT.md`)
- Detalhes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) e [docs/COMMERCIAL_READINESS.md](docs/COMMERCIAL_READINESS.md)

### 2. Subir o backend

```bash
cd backend
./mvnw quarkus:dev
```

Backend disponível em `http://localhost:8080`
- Swagger UI: `http://localhost:8080/q/swagger-ui`
- Health: `http://localhost:8080/q/health`
- Metrics: `http://localhost:8080/q/metrics`

### 3. Subir o frontend web

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Frontend em `http://localhost:3000`

### 4. Subir simuladores (opcional)

```bash
# Em terminais separados:
cd simulators/machine-simulator && npm install && npm start
cd simulators/payment-simulator && npm install && npm start confirm
```

### 5. App mobile (opcional)

Pré-requisitos: stack Docker local saudável (`backend` :8080, `keycloak` :8180).

```bash
cd mobile
cp .env.example .env   # ajuste IPs se for device físico
npm install
npx expo start
```

Variáveis `EXPO_PUBLIC_*` (também documentadas em `mobile/.env.example`):

| Variável | Default local | Nota |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8080` | No **device físico**, use o IP da máquina (`http://192.168.x.x:8080`) |
| `EXPO_PUBLIC_KEYCLOAK_URL` | `http://localhost:8180` | Mesmo host alcançável pelo telefone; issuer público do realm |
| `EXPO_PUBLIC_KEYCLOAK_REALM` | `gruahub` | |
| `EXPO_PUBLIC_KEYCLOAK_CLIENT_ID` | `gruahub-mobile` | Client público PKCE |

Login demo do operador: `operador@diversao.demo` / `gruahub@2025`.

Jornada: login SSO → rota do dia → iniciar visita (GPS real; se negar permissão, confirma sem coordenadas) → checklist → sangria e/ou reposição de estoque (QR → itens → `STOCK_IN` na fila) → concluir → aba **Fila** (sync). Visitas e movimentos aparecem no web em **Visitas** / **Estoque**.

QR demo: UUID da máquina, `gruahub://machine/<uuid>`, patrimônio (`MAQUINA-001`) ou `qr_code` seed (`GH-MAQUINA-001`) — os dois últimos exigem rede para resolver.

```bash
cd mobile && npm test && npm run typecheck
```

---

## Usuários de demo

Todos com senha `gruahub@2025`:

| Email | Papel |
|---|---|
| `admin@gruahub.local` | PLATFORM_ADMIN |
| `gestor@diversao.demo` | TENANT_ADMIN |
| `operador@diversao.demo` | FIELD_OPERATOR |
| `tecnico@diversao.demo` | TECHNICIAN |
| `financeiro@diversao.demo` | FINANCE |
| `parceiro@shoppingbv.demo` | ESTABLISHMENT_VIEWER |

---

## Jornada completa demonstrável

1. **Login web** → `gestor@diversao.demo`
2. **Dashboard** → ver status online/offline das 5 máquinas seed
3. **Simulador de máquina** → envia heartbeats; MAQUINA-001 fica online
4. **Simulador de pagamento** → `npm start full-flow` → `sandbox/initiate` + `sandbox/confirm` (header `X-Sandbox-Secret`)
5. **Backend** → crédito concedido e comando MQTT publicado
6. **Simulador de máquina** → recebe GRANT_CREDIT → ACK → PLAY_STARTED → PLAY_COMPLETED
7. **Dashboard → Conciliação** → caso MATCHED aparece automaticamente
8. **App mobile** → login → rota do dia → iniciar visita → checklist → sangria → concluir
9. **Dashboard → Visitas** → visita sincronizada aparece
10. **Dashboard → Alertas** → MACHINE_OFFLINE para MAQUINA-002 (seed sem heartbeat)

---

## Estrutura do monorepo

```
gruahub/
├── backend/                    # Quarkus 3 (Java 21)
│   └── src/main/java/com/gruahub/
│       ├── shared/             # TenantContext, Money, filtros, outbox
│       ├── identity/           # Tenant, ExternalUser
│       ├── fleet/              # Machine, MachineModel, Controller
│       ├── iot/                # MQTT, IotEventService, HeartbeatTimeoutScheduler
│       ├── payments/           # PaymentTransaction, SandboxProvider, webhook
│       ├── plays/              # CreditGrant, PlaySession, CreditService
│       ├── reconciliation/     # ReconciliationCase, ReconciliationScheduler
│       ├── inventory/          # Prize, StockMovement, StockBalance
│       ├── fieldops/           # FieldVisit, CashCollection
│       ├── maintenance/        # MaintenanceTicket
│       ├── alerts/             # Alert
│       ├── locations/          # Establishment, OperatingPoint
│       ├── finance/            # Settlement, CommissionPolicy
│       └── audit/              # AuditEvent (append-only)
│
├── web/                        # Next.js 14
│   └── src/app/dashboard/
│       ├── page.tsx            # Dashboard principal
│       ├── machines/           # Frota
│       ├── locations/          # Estabelecimentos e pontos
│       ├── payments/           # Transações (sandbox controls)
│       ├── reconciliation/     # Casos de conciliação
│       ├── inventory/          # Saldo e movimentações
│       ├── visits/             # Visitas de campo
│       ├── maintenance/        # Chamados de manutenção
│       ├── alerts/             # Alertas operacionais
│       ├── finance/            # Liquidações
│       ├── routes/             # Rotas do operador
│       ├── reports/            # Geração de PDF
│       └── audit/              # Log de auditoria
│
├── mobile/                     # Expo 51 / React Native
│   └── app/
│       ├── login/              # OIDC PKCE via Keycloak
│       ├── (tabs)/
│       │   ├── index.tsx       # Rota do dia
│       │   ├── queue.tsx       # Fila offline
│       │   └── profile.tsx     # Perfil e sync
│       ├── visits/             # Fluxo de visita (start → checklist → complete)
│       └── qr-scan.tsx         # Scanner de QR Code
│
├── simulators/
│   ├── machine-simulator/      # Node/TS — simula heartbeat, jogadas, ACK
│   └── payment-simulator/      # Node/TS — simula webhooks de pagamento
│
├── infra/
│   ├── docker-compose.yml      # Serviços + profiles tls/backup/prod-like/simulators
│   ├── caddy/Caddyfile         # HTTPS local
│   ├── scripts/pg-backup*.sh   # Backup Postgres
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   ├── keycloak/realm-gruahub.json
│   └── emqx/acl.conf
│
├── contracts/
│   ├── mqtt/                   # schema-v1, broker-policy, examples/
│   └── openapi/                # openapi.yaml + openapi.json (export Quarkus)
│
└── docs/
    ├── ARCHITECTURE.md         # Diagrama de sistema, módulos, fluxos
    ├── DECISIONS.md            # 10 ADRs
    ├── DEPLOYMENT.md           # Pré-requisitos, variáveis, comandos
    ├── SECURITY.md             # Princípios, autenticação, autorização
    ├── THREAT_MODEL.md         # STRIDE por componente
    ├── OBSERVABILITY.md        # Logs, métricas, tracing
    ├── MQTT_CONTRACT.md        # Referência do contrato IoT
    ├── KNOWN_LIMITATIONS.md    # Limitações honestas por componente
    ├── MVP_READINESS.md        # Classificação MVP DEMONSTRÁVEL por componente
    ├── DEMO_SCRIPT.md          # Roteiro executável de demonstração
    ├── COMMERCIAL_READINESS.md # Gaps para go-live comercial
    └── TASKS.md                # Backlog e histórico de tarefas
```

---

## Decisões de arquitetura

Ver [docs/DECISIONS.md](docs/DECISIONS.md) para os 10 ADRs completos.

Principais decisões:
- **Modular monolith** (Quarkus) — fronteiras de módulo claras, extractável para microserviços
- **Outbox via Quarkus Scheduler** — MVP sem Kafka, extensível via Debezium
- **Inbox/idempotency** — `device_message_inbox` e `payment_event_inbox` com `unique(message_id, tenant_id)`
- **Multi-tenant row-level** — `tenant_id` em todas as tabelas; derivado do JWT, nunca do cliente
- **Offline-first mobile** — SQLite local + `clientOperationId` + retry com backoff exponencial

## Limitações conhecidas

Ver [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

TL;DR: sem hardware real, pagamentos sandbox apenas, sem nota fiscal, sem Kubernetes, sem Kafka, push só stub (sem FCM Google).

---

## Segurança

- Secrets somente por variáveis de ambiente — nunca em código / Compose sem senhas literais
- `.env.example` / `infra/.env.example` com placeholders; produção → Vault/SM
- Rate-limit global em `/api/*` + limites mais estritos em webhook/sandbox
- Webhooks com HMAC-SHA256 e replay protection via inbox
- ACL MQTT por dispositivo
- `tenant_id` derivado do JWT (nunca aceito do cliente)
- Logs sem tokens, credenciais ou dados financeiros completos
- Audit log imutável (append-only) para todas as ações sensíveis

## Licença

Proprietário — uso interno GruaHub Ltda. Não distribuir.
