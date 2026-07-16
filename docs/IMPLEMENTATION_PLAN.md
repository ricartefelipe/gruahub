# GruaHub — Plano de Implementação

## Objetivo
MVP funcional e demonstrável da plataforma B2B multitenant GruaHub, executável localmente via Docker Compose.

## Stack Definida

| Camada | Tecnologia |
|--------|-----------|
| Backend | Java 21, Quarkus 3.x, Maven Wrapper |
| ORM | Hibernate ORM/Panache, Liquibase YAML |
| Auth | Keycloak 24, OIDC Authorization Code + PKCE |
| Broker MQTT | EMQX 5.x |
| Banco | PostgreSQL 16 |
| Storage | MinIO (S3-compatible) |
| Frontend Web | Next.js 14 App Router, TypeScript, React Query, Zod, Playwright |
| Mobile | React Native + Expo 51, TypeScript, Expo Router, SQLite |
| Simuladores | Node.js 20 / TypeScript |
| Infra | Docker Compose |
| CI | GitHub Actions |

## Fases e Ordem de Implementação

```
Fase 0: Fundação (monorepo, Docker Compose, CI)
Fase 1: Identity + Tenant + Pontos + Máquinas + Web base
Fase 2: IoT (EMQX, MQTT, simulador de máquina)
Fase 3: Pagamentos + Crédito + Jogada + Conciliação
Fase 4: Estoque + Visitas + Sangria + Comissão + PDF
Fase 5: Rotas + Manutenção + Alertas
Fase 6: App Mobile offline-first
Fase 7: Portal Parceiro + Relatórios + Seed demo
Fase 8: Hardening (segurança, observabilidade, E2E, docs finais)
```

## Princípios de Implementação

- Monólito modular: cada módulo com fronteira clara (`identity`, `tenant`, `locations`, `fleet`, `iot`, `payments`, `plays`, `inventory`, `fieldops`, `routing`, `finance`, `maintenance`, `alerts`, `reports`, `audit`, `shared`)
- Domínio independente de framework (domain layer puro)
- Outbox transacional para eventos externos
- Inbox + idempotência para webhooks e mensagens MQTT
- Todas as queries respeitam `tenant_id`
- Valores monetários: `BigDecimal` + moeda explícita
- Datas: UTC interno, `pt-BR` na UI
- IDs: UUID v4
- APIs: REST JSON, `application/problem+json`, OpenAPI

## URLs Locais (após `docker compose up`)

| Serviço | URL | Credencial |
|---------|-----|-----------|
| Backend API | http://localhost:8080 | — |
| OpenAPI UI | http://localhost:8080/q/swagger-ui | — |
| Frontend Web | http://localhost:3000 | admin@gruahub.local / gruahub@2025 |
| Keycloak Admin | http://localhost:8180 | admin / admin |
| EMQX Dashboard | http://localhost:18083 | admin / public |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| PostgreSQL | localhost:5432 | gruahub / gruahub |

## Módulos do Backend (`com.gruahub`)

```
identity/      → usuário, papel, perfil, auditoria de acesso
tenant/        → organização/empresa, configurações
locations/     → estabelecimento, ponto operacional, endereço
fleet/         → máquina, modelo, controlador, status
iot/           → mensagens MQTT, comandos, telemetria, inbox
payments/      → transação, provider (sandbox), webhook inbox
plays/         → crédito, jogada
reconciliation/→ conciliação pagamento→crédito→jogada
inventory/     → catálogo, lote, ledger, movimentação, balanço
fieldops/      → visita, checklist, anexo, sangria
routing/       → rota, parada, priorização
finance/       → comissão, repasse, acerto
maintenance/   → chamado, peças, SLA
alerts/        → regras, notificações, alertas
reports/       → relatórios, PDF, CSV
audit/         → evento de auditoria imutável
shared/        → valor objeto, paginação, problem+json, outbox, inbox, idempotência
```
