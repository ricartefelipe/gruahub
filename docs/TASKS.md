# GruaHub — Tasks (estado real)

Atualizado para refletir o código atual (não o plano inicial).  
Itens abertos = gaps reais; “comercial longo” está em `COMMERCIAL_READINESS.md`.

## Feito (MVP demonstrável)

- [x] Monorepo: backend Quarkus 3 / Java 21, web Next.js 14, mobile Expo 51, simulators, contracts MQTT, infra compose
- [x] `infra/docker-compose.yml` + Keycloak realm + `infra/.env.example` (segredos só via `.env`)
- [x] CI GitHub Actions: backend, web, mobile, simulators, contracts, security, docker-compose smoke (PR/develop)
- [x] Identity/tenant + isolamento HTTP com JWT (`TenantIsolationIT`)
- [x] Frota, locais, IoT (heartbeat/comandos/outbox), pagamentos sandbox + webhook HMAC + idempotência
- [x] Rate-limit in-memory em webhook e sandbox
- [x] Rate-limit global da API (`GlobalRateLimitFilter`, env `GRUAHUB_RATE_LIMIT_GLOBAL_*`)
- [x] HTTPS local via Caddy (Compose profiles `tls` / `prod-like`)
- [x] Backup Postgres agendado (`pg_dump`, profiles `backup` / `prod-like`)
- [x] Plays / conciliação / inventário / fieldops / finance / routing / maintenance / alerts / reports PDF
- [x] Seed demo (`Diversão Nordeste Demo`) + rota do dia (`CURRENT_DATE`)
- [x] Web dashboard + portal parceiro (RBAC por página)
- [x] Mobile: auth, fila offline testada (17), rota do dia com `?date=`, visita/sangria
- [x] Simuladores machine + payment
- [x] Docs principais em `docs/` + `README.md`
- [x] Contrato listagens `PageResponse` alinhado FE/BE
- [x] Schedulers: heartbeat timeout, command TTL, reconciliação, outbox

## Aberto / parcial (honesto)

- [x] `contracts/openapi/` versionado (`openapi.yaml`/`openapi.json`; regenerar com `scripts/export-openapi.sh`)
- [x] Exemplos MQTT em `contracts/mqtt/examples/` (CI valida contra `schema-v1.json`)
- [x] E2E Playwright smoke em CI (`web/e2e/smoke.spec.ts`; specs autenticados ainda locais com Keycloak)
- [ ] WAF / rate-limit de login (Keycloak brute-force / proxy); rate-limit in-memory não cobre multi-instância
- [ ] TLS público (Let's Encrypt / cert gerenciado); hoje só `tls internal` local
- [ ] Push FCM ativo, SMS/e-mail (stubs/prod ainda abertos)
- [ ] Backup offsite (S3) + drill de restore; Vault / Secrets Manager em produção
- [ ] Pagamento real / hardware físico / adaptadores de controlador
- [ ] Escala horizontal (outbox polling, locks in-memory, rate-limit in-memory)

## Fora do MVP (comercial longo)

Ver `docs/COMMERCIAL_READINESS.md` e `docs/KNOWN_LIMITATIONS.md`:
adquirente real, NF-e, Kafka/K8s, roteirização geoespacial, PCI/pen-test, SLA.
