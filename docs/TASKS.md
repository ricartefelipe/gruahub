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
- [ ] E2E Playwright em CI (specs em `web/e2e/`; smoke ainda não no pipeline)
- [ ] Rate limiting global / WAF / login (só webhook+sandbox hoje)
- [ ] TLS/HTTPS no compose (HTTP local de propósito)
- [ ] Push FCM ativo, SMS/e-mail
- [ ] Backup automatizado Postgres, Vault/Secrets Manager
- [ ] Pagamento real / hardware físico / adaptadores de controlador
- [ ] Escala horizontal (outbox polling, locks in-memory)

## Fora do MVP (comercial longo)

Ver `docs/COMMERCIAL_READINESS.md` e `docs/KNOWN_LIMITATIONS.md`:
adquirente real, NF-e, Kafka/K8s, roteirização geoespacial, PCI/pen-test, SLA.
