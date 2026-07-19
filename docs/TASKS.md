# GruaHub — Tasks de Implementação

Atualizado automaticamente durante a execução. Use checkboxes para rastrear o progresso real.

## Fase 0 — Fundação

- [x] Inspecionar repositório e ambiente
- [x] Criar estrutura de pastas do monorepo
- [x] Criar `.gitignore`
- [x] Criar `docs/IMPLEMENTATION_PLAN.md`
- [x] Criar `docs/TASKS.md`
- [x] Criar `docs/DECISIONS.md`
- [x] Criar `docs/KNOWN_LIMITATIONS.md`
- [ ] Criar `README.md` com visão e execução rápida
- [ ] `infra/docker-compose.yml` (PostgreSQL, Keycloak, EMQX, MinIO, Backend, Web)
- [ ] `infra/keycloak/realm-gruahub.json` (realm importado)
- [ ] `infra/.env.example`
- [ ] GitHub Actions CI esqueleto
- [ ] `contracts/mqtt/schema-v1.json`
- [ ] `contracts/openapi/` (gerado do backend)

## Fase 1 — Identity, Tenant, Pontos, Máquinas

### Backend

- [ ] Projeto Quarkus 3 com Maven Wrapper em `backend/`
- [ ] `backend/pom.xml` com todas as dependências fixadas
- [ ] Módulo `shared`: UUID, Money, Pagination, ProblemJson, Outbox, Inbox, Idempotency
- [ ] Módulo `audit`: AuditEvent, AuditService, AuditResource
- [ ] Módulo `tenant`: Tenant, TenantService, TenantResource + Liquibase migrations
- [ ] Módulo `identity`: ExternalUser, Role, SecurityContext + Keycloak OIDC
- [ ] Módulo `locations`: Establishment, OperatingPoint + REST + migrations
- [ ] Módulo `fleet`: Machine, MachineModel, Controller + state machine + REST + migrations
- [ ] Testes unitários: state machine de máquina
- [ ] Testes de integração: Testcontainers PostgreSQL + Keycloak
- [x] Isolamento de tenant (testes negativos)
- [ ] OpenAPI disponível em `/q/openapi`

### Frontend Web

- [ ] Projeto Next.js 14 em `web/`
- [ ] Auth OIDC com NextAuth.js ou similar
- [ ] Layout base + navegação
- [ ] Página de Login
- [ ] Dashboard com métricas fictícias
- [ ] Lista e detalhe de Máquinas
- [ ] Lista de Estabelecimentos/Pontos
- [ ] Alertas (componente base)

## Fase 2 — IoT

- [ ] Módulo `iot` no backend
- [ ] Contratos MQTT versionados em `contracts/mqtt/`
- [ ] EMQX configurado no Docker Compose com ACL demonstrativa
- [ ] Processamento de heartbeat e atualização de estado
- [ ] Inbox com deduplicação por `messageId`
- [ ] Detecção de gap de `sequence`
- [ ] Scheduler de timeout de heartbeat (máquina → OFFLINE)
- [ ] Comandos com `commandId`, TTL, ACK, auditoria
- [ ] REST: enviar comando, listar telemetria, estado online/offline
- [ ] `simulators/machine-simulator/` (Node/TS): heartbeat, crédito, ACK, jogada, erros
- [ ] Painel web: máquina online/offline em tempo real (polling)
- [ ] Testes: deduplicação de messageId, timeout de heartbeat

## Fase 3 — Pagamento, Crédito, Jogada, Conciliação

- [ ] Módulo `payments`: PaymentTransaction, PaymentProvider, SandboxProvider
- [ ] Endpoint sandbox para confirmar/falhar pagamento
- [ ] Webhook inbox + deduplicação + assinatura verificável
- [ ] Módulo `plays`: CreditGrant (state machine), PlaySession (state machine)
- [ ] Garantia: um único crédito por confirmação de pagamento
- [ ] Comando MQTT gerado ao confirmar crédito
- [ ] Módulo `reconciliation`: ReconciliationCase + job scheduler
- [ ] Status: MATCHED, PAYMENT_WITHOUT_CREDIT, CREDIT_NOT_ACKNOWLEDGED, etc.
- [ ] Tela de conciliação (web)
- [ ] Simulador de pagamento em `simulators/payment-simulator/`
- [ ] Testes: idempotência, evento duplicado, concorrência

## Fase 4 — Estoque, Visitas, Sangria, Comissão, PDF

- [ ] Módulo `inventory`: Prize, StockLocation, StockMovement (ledger imutável), MachineStockBalance
- [ ] Invariantes de estoque (testes de concorrência)
- [ ] Módulo `fieldops`: FieldVisit, VisitChecklistItem, VisitAttachment, CashCollection
- [ ] Operações offline com `clientOperationId` (idempotência no servidor)
- [ ] Upload de fotos via URL pré-assinada MinIO
- [ ] Módulo `finance`: CommissionPolicy (versionada), Settlement, CashCollection
- [ ] Geração de recibo PDF (Qute + OpenPDF/Flying Saucer)
- [ ] Telas web: visitas, sangria, comissão
- [ ] Testes: ledger, idempotência de visita offline, cálculo de comissão

## Fase 5 — Rotas, Manutenção, Alertas

- [ ] Módulo `routing`: RoutePlan, RouteStop, score com explicação
- [ ] Montagem manual de rota a partir de prioridades
- [ ] Módulo `maintenance`: MaintenanceTicket, state machine, SLA
- [ ] Módulo `alerts`: regras configuráveis, Alert, Notification
- [ ] Alertas: offline, heartbeat tardio, porta aberta, pagamento sem crédito, estoque mínimo, visita atrasada
- [ ] Telas web: rotas, manutenção, alertas

## Fase 6 — Mobile

- [ ] Projeto Expo 51 em `mobile/`
- [ ] Auth OIDC (Expo AuthSession)
- [ ] SQLite local com Expo SQLite
- [ ] Fila offline: clientOperationId, status PENDING/SYNCING/SYNCED/FAILED
- [ ] Retry com backoff exponencial
- [ ] Rota do dia
- [ ] Leitura de QR Code
- [ ] Fluxo completo de visita
- [ ] Upload de fotos offline
- [ ] Sincronização ao reconectar
- [ ] Testes: fila offline, retry, deduplicação

## Fase 7 — Portal Parceiro, Relatórios, Seed

- [ ] Portal `ESTABLISHMENT_VIEWER` no frontend web
- [ ] Relatórios financeiros por ponto/período
- [ ] Exportação CSV
- [ ] Seed idempotente: `Diversão Nordeste Demo`
- [ ] 3 estabelecimentos, 5 máquinas, catálogo, histórico
- [ ] 1 conciliação pendente, 1 máquina offline, 1 manutenção aberta

## Fase 8 — Hardening

- [ ] Headers de segurança (HSTS, CSP, X-Frame-Options)
- [ ] CORS restritivo
- [ ] Rate limiting em webhooks e endpoints sensíveis
- [ ] `docs/THREAT_MODEL.md`
- [ ] Logs JSON estruturado com `correlationId`
- [ ] Health/readiness (`/q/health`)
- [ ] Métricas Micrometer + OpenTelemetry opcional
- [ ] Playwright E2E: jornada completa
- [ ] Testes: autorização por papel, isolamento de tenant, E2E
- [ ] Documentação completa (ARCHITECTURE, DOMAIN_MODEL, MQTT_CONTRACT, SECURITY, DEMO, etc.)
- [ ] Quality gates: todos os checkboxes da seção 24 do prompt mestre
