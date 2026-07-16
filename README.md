# GruaHub MVP

Plataforma B2B multi-tenant para gestão de máquinas de pelúcia e gruas: telemetria IoT, pagamentos, jogadas, estoque, visitas de campo e portal de parceiros.

## Componentes

| Componente | Stack | Porta |
|---|---|---|
| **Backend** | Quarkus 3.8 + Java 21 | 8080 |
| **Frontend Web** | Next.js 14 App Router | 3000 |
| **App Mobile** | Expo 51 / React Native | — |
| **Keycloak** | v24 (auth) | 8180 |
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
cd infra
docker compose up -d
```

Aguarde todos os serviços ficarem `healthy` (30–60 s):
```bash
docker compose ps
```

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

```bash
cd mobile
npm install
npx expo start
```

Aponte o Expo Go para o QR Code.

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
4. **Simulador de pagamento** → `npm start confirm` → pagamento confirmado via webhook
5. **Backend** → `POST /api/v1/payments/sandbox/confirm/{id}` → crédito concedido via MQTT
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
│       ├── iot/                # MQTT, IotEventService, HeartbeatScheduler
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
│   ├── docker-compose.yml      # Todos os serviços
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   ├── keycloak/realm-gruahub.json
│   └── emqx/acl.conf
│
├── contracts/
│   └── mqtt/schema-v1.json     # Contrato MQTT completo
│
└── docs/
    ├── IMPLEMENTATION_PLAN.md
    ├── DECISIONS.md
    ├── TASKS.md
    └── KNOWN_LIMITATIONS.md
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

TL;DR: sem hardware real, pagamentos sandbox apenas, sem nota fiscal, sem Kubernetes, sem Kafka, sem push notifications reais.

---

## Segurança

- Secrets somente por variáveis de ambiente — nunca em código
- `.env.example` sem segredos reais
- Webhooks com HMAC-SHA256 e replay protection via inbox
- ACL MQTT por dispositivo
- `tenant_id` derivado do JWT (nunca aceito do cliente)
- Logs sem tokens, credenciais ou dados financeiros completos
- Audit log imutável (append-only) para todas as ações sensíveis

## Licença

Proprietário — uso interno GruaHub Ltda. Não distribuir.
