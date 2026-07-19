# GruaHub — MVP Readiness Assessment

> Avaliação técnica objetiva.  
> Classificação: **MVP DEMONSTRÁVEL** ou **NÃO PRONTO**.  
> Data: 2026-07-19

---

## Critérios

| Critério | Exigência mínima |
|----------|------------------|
| Build | Compila sem erro |
| Testes | Suites principais passam (sem pular o essencial) |
| Segurança | Auth multitenant; segredos via env (não embutidos no compose) |
| Isolamento de tenant | Cross-tenant bloqueado em IT |
| Offline/retry | Fila mobile com dedup testada |
| Contrato MQTT | Schema validado por CI |
| Observabilidade | Logs + `X-Correlation-Id` |
| Limitações honestas | Em `KNOWN_LIMITATIONS.md` / `TASKS.md` |

---

## Resultado por componente

### Backend — Quarkus 3 / Java 21

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Build / testes | `./mvnw verify` (unit + ITs: `TenantIsolationIT`, `IdempotencyIT`, IoT flow) |
| Isolamento | JWT com dois tenants; listagem escopada; GET cross-tenant → 404 |
| Webhook HMAC | Timing-safe + inbox idempotente |
| Rate-limit | Webhook + sandbox (in-memory; não é WAF global) |
| Schedulers | Heartbeat offline, command TTL, outbox, reconciliação |
| Limitação | Outbox por polling; rate-limit não multi-instância |

### Frontend Web — Next.js 14

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Build / lint / tsc | Jobs no CI |
| Auth + RBAC | NextAuth/Keycloak; guards por rota |
| API | Cliente com timeout / Problem Details / `PageResponse` |
| E2E | Smoke no CI (`--project=smoke`: login + redirect); specs autenticados locais |
| Limitação | E2E autenticado/demo completa dependem do compose + Keycloak + seed |

### App Mobile — Expo 51

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Offline queue | 17 testes unitários (dedup, backoff, ordering) |
| Rota do dia | `GET /routes?date=` + `operatingPointId` na visita |
| Auth | PKCE; tokens em SecureStore |
| Limitação | Push FCM não ativado localmente; Expo export no CI tolera falha (`\|\| true`) |

### Simuladores / contratos

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Machine + payment sims | Build TS no CI; secrets via env |
| MQTT schema | `schema-v1.json` + exemplos em `contracts/mqtt/examples/` (ajv no CI) |
| OpenAPI | `contracts/openapi/` versionado; lint Redocly no CI |
| Limitação | Sem adaptadores de fabricante; OpenAPI é snapshot do build Quarkus |

### Infra — Docker Compose

**Classificação: ✅ MVP DEMONSTRÁVEL**

| Aspecto | Evidência |
|---------|-----------|
| Serviços | postgres, keycloak, emqx, minio, backend, web; profile `simulators` |
| Secrets | Passwords/secrets **obrigatórios** via `infra/.env` (ver `.env.example`) |
| Limitação | HTTP sem TLS; defaults de demo só no `.env.example` |

### CI/CD — GitHub Actions

**Classificação: ✅ MVP DEMONSTRÁVEL (com ressalvas)**

| Job | Nota honesta |
|-----|--------------|
| `backend` / `web` / `mobile` / `simulators` / `contracts` | Gates principais |
| `e2e-smoke` | Playwright smoke (Next.js only; sem Keycloak/stack) |
| `docker-compose` | Smoke infra em push/PR para `develop` e `main` (timeout 12m) |
| `security` | Steps nomeados `*(soft-fail)`: OWASP e `npm audit --audit-level=critical` com `\|\| true` (hoje há critical no Next 14.2.5) |
| Expo export | Step `Export static bundle (soft-fail)` — não bloqueia o job mobile |

Soft-fails são deliberados e visíveis no nome do step; upgrade de Next/`npm audit` gate fica como follow-up.

### Documentação

**Classificação: ✅ MVP DEMONSTRÁVEL**

`TASKS.md` e este arquivo descrevem o estado atual.  
Gaps comerciais: `COMMERCIAL_READINESS.md`.

---

## Resumo

| Componente | Classificação |
|-----------|---------------|
| Backend | ✅ MVP DEMONSTRÁVEL |
| Web | ✅ MVP DEMONSTRÁVEL |
| Mobile | ✅ MVP DEMONSTRÁVEL |
| Simuladores / contratos | ✅ MVP DEMONSTRÁVEL |
| Docker Compose | ✅ MVP DEMONSTRÁVEL |
| CI/CD | ✅ MVP DEMONSTRÁVEL (security soft-fail) |
| Documentação | ✅ MVP DEMONSTRÁVEL |

Pronto para **demo técnica** em ambiente controlado.  
**Não** pronto para produção com hardware real, pagamento real ou escala horizontal — ver `KNOWN_LIMITATIONS.md`.
