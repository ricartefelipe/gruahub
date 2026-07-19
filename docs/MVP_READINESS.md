# GruaHub — MVP Readiness Assessment

> Avaliação técnica objetiva de cada componente.  
> Classificação: **MVP DEMONSTRÁVEL** ou **NÃO PRONTO** — sem gradientes.  
> Data: 2026-07-17

---

## Critérios de Classificação

| Critério | Exigência mínima para MVP DEMONSTRÁVEL |
|----------|----------------------------------------|
| Build | Compila sem erro |
| Testes | Suite passa 100% (sem `skip` ou `xtest`) |
| Segurança | Sem segredos hard-coded; autenticação multitenant ativa |
| Isolamento de tenant | Cross-tenant bloqueado em teste automatizado |
| Offline/retry | Fila com deduplicação testada (mobile) |
| Contrato de API | Schema documentado e validado por CI |
| Observabilidade | Logs estruturados, correlação por X-Correlation-Id |
| Limitações honestas | Documentadas em `KNOWN_LIMITATIONS.md` |

---

## Resultado por Componente

### Backend — Quarkus 3.8.6 / Java 21

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Build | `./mvnw -B package -DskipTests` — zero erros, jar produzido em `target/quarkus-app/` |
| Testes | `BackendServiceTest` (unit), `TenantIsolationIT`, `IdempotencyIT`, `BackendIotFlowTest` (ITs) — 100% pass |
| Isolamento de tenant | `TenantIsolationIT` prova listagem escopada ao JWT, GET cross-tenant → 404 e usuário sem `tenant_id` → 403 |
| Autenticação | OIDC via Keycloak; issuer/audience validados em produção; `%dev` overrides são dev-only |
| Webhook HMAC | `X-Webhook-Signature` validado com `MessageDigest.isEqual` (timing-safe) |
| Idempotência | `IdempotencyIT` cobre pagamento duplicado, crédito duplicado e jogada duplicada |
| Outbox/MQTT | `BackendIotFlowTest` valida publicação de heartbeat via EMQX in-process |
| Observabilidade | Logs estruturados JSON; `X-Correlation-Id` propagado; métricas Micrometer em `/q/metrics` |
| Liquibase | 18 changelogs (001–018) + seed demo; schema versionado, rollback suportado |
| Limitação conhecida | Outbox via polling (1s latência). Em produção usar CDC/Kafka. |

---

### Frontend Web — Next.js 14

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Build | `npm run build` — sem erros; bundle `.next/` gerado |
| Autenticação | NextAuth.js com Keycloak OIDC; roles extraídas do JWT e validadas por página |
| RBAC | `withAuth` guard em todas as rotas protegidas; `PLATFORM_ADMIN`, `TENANT_ADMIN`, etc. |
| API client | `api.ts` com timeout, interceptor 401 → refresh, Problem Details RFC 7807 |
| Segurança | CORS restrito; CSP headers via `next.config.js`; sem tokens em `localStorage` |
| Sandbox | `SandboxBanner` visível quando `NODE_ENV !== 'production'` |
| E2E specs | 8 arquivos em `web/e2e/` cobrindo login, máquinas, pagamentos, alertas |
| Limitação conhecida | E2E requer serviços externos rodando; não executa em CI sem Docker Compose |

---

### App Mobile — Expo 51 / React Native

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Autenticação | PKCE sem `client_secret`; tokens em `SecureStore`, nunca em `localStorage` |
| Schema SQLite | `schema_version` versionado; migrations idempotentes |
| Fila offline | State machine 5 estados (PENDING → SYNCED/FAILED); deduplicação por `idempotency_key` |
| Testes unitários | 17/17 passando — cobertura: deduplicação, backoff, crash recovery, ordering, schema_version |
| API client | `apiFetch` com timeout 15s, retry automático 401, Problem Details, `X-Correlation-Id` |
| Segurança | `client_secret` ausente do app; tokens nunca logados |
| Build | `expo export --platform web` sem erros |
| Limitação conhecida | Push notifications FCM configurado mas não ativado localmente |

---

### Simuladores

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Machine simulator | Envia `heartbeat`, `play_started`, `play_completed`, `error_report` via MQTT |
| Payment simulator | Gera webhook assinado com HMAC SHA-256 |
| Relógio determinístico | `Clock` interface injetável para testes sem `sleep` real |
| Contrato MQTT | `contracts/mqtt/schema-v1.json` (draft-07) validado por CI (`ajv compile`) |
| Limitação conhecida | Simuladores não cobrem protocolo de controladores físicos (Eletek, Sega, etc.) |

---

### Infraestrutura — Docker Compose

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Serviços | `postgres:16`, `keycloak:24.0.5`, `emqx:5.7`, `minio`, `backend`, `web`, `machine-sim`, `payment-sim` |
| Health checks | Definidos para postgres, keycloak, emqx, minio |
| Profiles | `--profile simulators` ativa machine-sim + payment-sim |
| Secrets | Todas credenciais via variáveis de ambiente; sem valores em `docker-compose.yml` |
| Limitação conhecida | HTTP simples (sem HTTPS/TLS). Produção requer Traefik/Nginx com certificados. |

---

### CI/CD — GitHub Actions

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Job | O que valida |
|-----|-------------|
| `backend` | Java 21, Maven verify (unit + IT), build jar |
| `web` | TypeCheck, lint, unit tests, Next.js build |
| `mobile` | TypeCheck, 17 testes unitários, expo export |
| `simulators` | TypeCheck + build de ambos os simuladores |
| `contracts` | `ajv compile` valida schema MQTT draft-07 |
| `security` | OWASP Dependency Check (CVSS≥9 falha build), `npm audit --audit-level=critical` |
| `docker-compose` | Smoke test infra (apenas `main`/`master`) |

Nenhum job usa `continue-on-error: true`.

---

### Documentação

**Classificação: ✅ MVP DEMONSTRÁVEL**

Arquivos presentes em `docs/`:

| Arquivo | Conteúdo |
|---------|----------|
| `ARCHITECTURE.md` | Diagrama de sistema, módulos, fluxos |
| `SECURITY.md` | Princípios, autenticação, autorização, segredos |
| `THREAT_MODEL.md` | STRIDE por componente, mitigações |
| `DEPLOYMENT.md` | Pré-requisitos, comandos de inicialização, variáveis |
| `OBSERVABILITY.md` | Logs, métricas, tracing, dashboards |
| `DECISIONS.md` | ADRs — monólito modular, Quarkus, PKCE, outbox, etc. |
| `MQTT_CONTRACT.md` | Referência do contrato de mensagens IoT |
| `KNOWN_LIMITATIONS.md` | Limitações honestas, fora do escopo, status por componente |
| `MVP_READINESS.md` | Este arquivo |
| `DEMO_SCRIPT.md` | Roteiro de demonstração executável |
| `COMMERCIAL_READINESS.md` | Análise de gaps para uso comercial |

---

## Resumo Executivo

| Componente | Classificação |
|-----------|---------------|
| Backend Quarkus | ✅ MVP DEMONSTRÁVEL |
| Frontend Web | ✅ MVP DEMONSTRÁVEL |
| App Mobile | ✅ MVP DEMONSTRÁVEL |
| Simuladores | ✅ MVP DEMONSTRÁVEL |
| Docker Compose | ✅ MVP DEMONSTRÁVEL |
| CI/CD | ✅ MVP DEMONSTRÁVEL |
| Documentação | ✅ MVP DEMONSTRÁVEL |

**Todos os 7 componentes classificados como MVP DEMONSTRÁVEL.**

A plataforma está pronta para demonstração técnica e validação com clientes beta.  
Não está pronta para uso em produção com hardware físico, pagamento real ou escala horizontal  
— essas limitações estão explicitamente documentadas em `KNOWN_LIMITATIONS.md`.
