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
- [x] HTTPS local via Caddy (Compose profiles `tls` / `prod-like`) + headers de segurança
- [x] Overlay prod-like: sem publicar 8080/3000/8180/Postgres/MinIO/dashboards no host
- [x] Keycloak no edge Caddy (`https://auth.localhost`) + brute-force no realm demo
- [x] Edge Caddy: rate-limit leve + WAF-lite; template Let's Encrypt (`Caddyfile.public.example`)
- [x] Backup Postgres agendado (`pg_dump`, profiles `backup` / `prod-like`)
- [x] Backup offsite S3-compatible opcional (`BACKUP_S3_*`) + restore drill
- [x] Hook de segredos `*_FILE` (Docker secrets style) em backend/web/backup
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
- [ ] WAF comercial / rate-limit distribuído (edge Caddy leve + API in-memory já ativos; multi-instância aberto)
- [ ] TLS público com DNS real (template LE pronto; CI só valida `tls internal`)
- [x] Push Expo (`noop` / `http-stub` / `expo`) + registry `device_token` + hook mobile com EAS projectId
- [x] Anexos de visita (MinIO/S3 + `POST /visits/{id}/attachments`) e sync mobile `UPLOAD_PHOTO`
- [x] Runbook DR de backup/restore/retenção em `DEPLOYMENT.md` (alinhado a `pg-backup*` / restore drill)
- [x] Monitoramento mínimo: profile Compose `monitoring` (Uptime Kuma) + doc de uptime externo em health
- [ ] SMS/e-mail
- [ ] FCM Google nativo (service account próprio); hoje a entrega é via Expo Push Service
- [ ] Vault / AWS Secrets Manager com rotação (hoje: `.env` + `*_FILE`)
- [ ] Pagamento real (1 adquirente Pix em tenant piloto)
- [ ] Hardware físico — Adaptador Fino v0 (pulse); ver `docs/HARDWARE_ADAPTER.md` e plano `docs/superpowers/plans/2026-07-27-adaptador-fino-v0.md`
- [ ] Firmware `firmware/adaptador-fino/` (heartbeat + GRANT_CREDIT idempotente + ACK)
- [ ] Provisionamento NVS de lab + checklist de bancada E2E
- [ ] Piloto 3–10 máquinas com harness (não PCB all-in-one)
- [ ] Adaptador vendor real (Eletek/Sega) — P1 após pulse
- [ ] Escala horizontal (outbox polling, locks in-memory, rate-limit in-memory)
- [ ] PITR / retenção S3 automatizada no job de backup; alerta Kuma pré-configurado no compose

## Hardware — backlog priorizado

### P0

- [x] Spec Adaptador Fino v0 (`docs/superpowers/specs/2026-07-27-adaptador-fino-v0-design.md`)
- [x] Plano/backlog (`docs/superpowers/plans/2026-07-27-adaptador-fino-v0.md`)
- [x] Guia operacional (`docs/HARDWARE_ADAPTER.md`) + contrato MQTT alinhado a `v1/...`
- [ ] Scaffold firmware Pulse + GRANT_CREDIT idempotente
- [ ] Provisionamento NVS lab
- [ ] E2E bancada (EMQX + backend + pulso)
- [ ] 1 Pix real (PR payments) + piloto 3–10 máquinas

### P1

- [ ] Harness por fabricante (SKU de cabo)
- [ ] Vendor adapter com protocolo real
- [ ] Provisionamento QR + bind mobile
- [ ] TLS MQTT + ACL por device em produção
- [ ] Dashboard operacional crédito/mismatch

### Rejeitado (anti all-in-one)

Display na placa GruaHub, USB host genérico, multi-relé/optos “reserva”, lógica de preço no firmware, bornes de parafuso como interface principal.

## Fora do MVP (comercial longo)

Ver `docs/COMMERCIAL_READINESS.md` e `docs/KNOWN_LIMITATIONS.md`:
adquirente real (além do piloto), NF-e, Kafka/K8s, roteirização geoespacial, PCI/pen-test, SLA, PCB própria, OTA.
