# GruaHub — Arquitetura do Sistema

## Visão Geral

GruaHub é uma plataforma B2B multi-tenant para gestão de máquinas de pelúcia e gruas.
Adota **Monólito Modular** como estilo arquitetural: um único processo Quarkus com
fronteiras de módulo bem definidas, sem comunicação inter-serviço via rede.

```
┌──────────────────────────────────────────────────────────────────┐
│                         GruaHub MVP                              │
│                                                                  │
│  [Expo Mobile]  ──OIDC PKCE──►  [Keycloak 24]                   │
│  [Next.js Web]  ──NextAuth──►   [Keycloak 24]                   │
│                                        │                         │
│  [Simuladores]  ──MQTT──►  [EMQX]  ─►─┘                         │
│  [Hardware]     ──MQTT──►  [EMQX]      │                         │
│                                        ▼                         │
│                             ┌─────────────────┐                  │
│                             │  Quarkus 3.8.6  │                  │
│                             │  Java 21 / JVM  │                  │
│                             │                 │                  │
│  Módulos do domínio:        │  ┌───────────┐  │                  │
│  • shared           ────────┼─►│ REST API  │  │                  │
│  • tenant-identity  ────────┼─►│ /api/v1   │  │                  │
│  • fleet            ────────┼─►│           │  │                  │
│  • iot              ────────┼─►│ MQTT      │  │                  │
│  • payments         ────────┼─►│ Listener  │  │                  │
│  • plays            ────────┼─►│           │  │                  │
│  • fieldops         ────────┼─►│ Schedulers│  │                  │
│  • inventory        ────────┼─►│           │  │                  │
│  • finance          ────────┼─►│ Outbox    │  │                  │
│  • routing          ────────┼─►│           │  │                  │
│  • maintenance      ────────┼─►│ ───────── │  │                  │
│  • alerts           ────────┼─►│ Hibernate │  │                  │
│  • audit            ────────┼─►│ ORM       │  │                  │
│  • reconciliation   ────────┼─►│ Liquibase │  │                  │
│  • reports          ────────┼─►│           │  │                  │
│                             └─────┬───────┘  │                  │
│                                   │           │                  │
│                             ┌─────▼───────┐  │                  │
│                             │  PostgreSQL  │  │                  │
│                             │  15          │  │                  │
│                             └─────────────┘  │                  │
│                                              │                  │
│  [MinIO S3]  ◄── fotos/PDFs                 │                  │
│  [Prometheus]  ◄── /q/metrics               │                  │
│  [Jaeger/OTLP] ◄── traces                   │                  │
└──────────────────────────────────────────────────────────────────┘
```

## Decisões Arquiteturais

### ADR-001 — Monólito Modular (não microserviços)

**Contexto:** MVP com equipe pequena, domínio em evolução.
**Decisão:** Módulo Java por domínio dentro de um único processo Quarkus.
**Consequências:** Deploy simples, sem latência de rede intra-serviço. Migração para serviços independentes possível se necessário sem reescrever a lógica de domínio.

### ADR-002 — Multi-tenancy por coluna

**Contexto:** Vários operadores de máquinas na mesma instalação.
**Decisão:** `tenant_id UUID NOT NULL` em todas as tabelas de negócio. `TenantContext` ThreadLocal populado a partir da claim JWT `tenant_id`. Nunca aceito do body do cliente.
**Consequências:** Row-level isolation simples. Escalonamento para schema-per-tenant possível sem mudança de API.

### ADR-003 — Offline-first no mobile

**Contexto:** Operadores de campo em locais com cobertura instável.
**Decisão:** SQLite local via `expo-sqlite`. Fila de operações (`offline_operation`) com backoff exponencial (5s·3ⁿ, máx 3600s). Idempotência via `client_operation_id` UUID.
**Consequências:** HTTP 409 tratado como sucesso. Dados visíveis ao operador imediatamente, sincronizados em background.

### ADR-004 — Outbox via polling

**Contexto:** Necessidade de publicar eventos MQTT após commit de transação.
**Decisão:** Tabela `domain_event` (outbox) inserida na mesma transação. Scheduler Quarkus faz poll a cada 1 s e publica no EMQX.
**Consequências:** Latência de até 1 s para eventos IoT. Sem perda de mensagem em caso de falha antes da publicação. Para produção de alta escala: substituir por CDC (Debezium) ou Transactional Outbox com Kafka.

### ADR-005 — PDF via Flying Saucer + Qute

**Contexto:** Relatórios operacionais em PDF.
**Decisão:** Qute template → HTML → JTidy (XHTML) → Flying Saucer (ITextRenderer/OpenPDF).
**Consequências:** Sem dependência de serviço externo. Templates editáveis sem recompilação.

## Estrutura de Módulos

```
backend/src/main/java/com/gruahub/
  shared/               ← TenantContext, AuditService, PageResponse, etc.
  tenant/               ← Tenant entity, TenantResource
  fleet/                ← Machine, MachineService, MachineResource
  iot/                  ← MqttClientService, HeartbeatTimeoutScheduler, CommandTtlScheduler
  payments/             ← PaymentWebhookResource, SandboxPaymentProvider
  plays/                ← PlayEvent, PlayResource
  fieldops/             ← FieldVisit, FieldVisitResource
  inventory/            ← StockBalance, StockMovement, InventoryResource
  finance/              ← Settlement, CommissionPolicy, FinanceResource
  routing/              ← RoutePlan, RouteStop, RoutingResource
  maintenance/          ← MaintenanceTicket, MaintenanceResource
  alerts/               ← Alert, AlertResource
  audit/                ← AuditLog, AuditResource, AuditService
  reconciliation/       ← ReconciliationCase, ReconciliationResource
  reports/              ← ReportResource, Qute templates
  locations/            ← Establishment, OperatingPoint
```

## Fluxo de Autenticação

```
Mobile (Expo)                Keycloak 24              Backend (Quarkus)
     │                           │                          │
     │── PKCE Authorization ────►│                          │
     │◄─ code ──────────────────│                          │
     │── token exchange ────────►│                          │
     │◄─ access_token ──────────│                          │
     │                           │                          │
     │── GET /api/v1/machines ───────────────────────────►│
     │   Authorization: Bearer <token>                      │
     │                           │◄─ JWKS validation ──────│
     │                           │── OK ───────────────────►│
     │                           │                     extracts tenant_id
     │◄── 200 JSON ─────────────────────────────────────────│
```

## Banco de Dados

- **PostgreSQL 15** via JDBC (Quarkus `quarkus-jdbc-postgresql`)
- **Migrações:** Liquibase YAML (`db/changelog/`)
  - 001-015: schema base (init → audit)
  - 016: adições fieldops (checklist, cash_collected_cents)
  - 017: alinhamento de schema (colunas alias REST)
  - 099: seed demonstrativo
- **ORM:** Hibernate ORM + Panache (entidades simples) + native queries para relatórios e aggregations complexas

## Observabilidade

| Sinal   | Tecnologia            | Endpoint          |
|---------|-----------------------|-------------------|
| Métricas | Micrometer + Prometheus | `/q/metrics`    |
| Tracing  | OpenTelemetry OTLP    | Jaeger (porta 4317) |
| Health   | SmallRye Health       | `/q/health`       |
| Logs     | JBoss Logging (JSON)  | stdout → ELK/Loki |

Métricas customizadas de domínio: `FleetMetrics` bean (ver `OBSERVABILITY.md`).
