# GruaHub — Checklist de piloto público

Use antes de publicar DNS / Let's Encrypt / tráfego real.
Não substitui pen-test nem SEFAZ.

## Must-have (bloqueia go-live)

- [ ] Secrets fortes em `infra/.env` (Postgres, Keycloak, MQTT, MinIO, NEXTAUTH, sandbox webhook) — nunca literais do `.env.example`
- [ ] `GRUAHUB_SANDBOX_ENABLED=false`
- [ ] `GRUAHUB_PROD_ALLOW_SANDBOX=false` (não sobrescrever)
- [ ] `GRUAHUB_PROD_ENFORCE_SAFETY=true` (default do overlay prod-like)
- [ ] `QUARKUS_PROFILE=prod` (default do overlay prod-like)
- [ ] `GRUAHUB_PAYMENT_PROVIDER` = provedor real (ex. `mercadopago`) com tokens válidos
- [ ] `QUARKUS_LIQUIBASE_CONTEXTS` vazio (sem seed `demo` / senhas conhecidas)
- [ ] Trocar ou desativar usuários demo do Keycloak
- [ ] `GRUAHUB_PLAYER_PUBLIC_ENABLED=true` só se o fluxo `/play` estiver ativo no piloto; senão `false`
- [ ] Overlay prod-like: `./scripts/up-prod-like.sh` + `Caddyfile.public.example`
- [ ] DNS A/AAAA + `GRUAHUB_PUBLIC_HOST` / `GRUAHUB_AUTH_HOST` + `CADDY_ACME_EMAIL`
- [ ] CORS / `NEXTAUTH_URL` / `NEXT_PUBLIC_API_URL` / issuer OIDC no host real
- [ ] Backup offsite `BACKUP_S3_*` + drill `./scripts/pg-restore-drill.sh`
- [ ] Uptime externo em `https://<host>/q/health/ready`
- [ ] Deploy a partir de `main` (ou artefato taggeado), não de branch de feature

## Verificações rápidas

```bash
# Sandbox deve estar off
grep -E 'GRUAHUB_SANDBOX_ENABLED|GRUAHUB_PROD_ALLOW_SANDBOX|QUARKUS_LIQUIBASE_CONTEXTS|GRUAHUB_PLAYER_PUBLIC' infra/.env

# Health público
curl -sf "https://${GRUAHUB_PUBLIC_HOST}/q/health/ready"

# Swagger NÃO deve responder em piloto público
curl -s -o /dev/null -w "%{http_code}\n" "https://${GRUAHUB_PUBLIC_HOST}/q/swagger-ui"
# esperado: 404 (Caddy) ou indisponível
```

O backend em profile `prod` **recusa subir** se sandbox estiver ligado ou se o payment provider for `sandbox`, salvo `GRUAHUB_PROD_ALLOW_SANDBOX=true`.

## Nice-to-have (não bloqueia beta controlado)

- [ ] WAF comercial / rate-limit distribuído
- [ ] Vault / Secrets Manager com rotação
- [ ] FCM / e-mail / SMS
- [ ] MQTT só rede privada / sem 1883 na SG
- [ ] Pen-test
- [ ] PITR
- [ ] NF-e SEFAZ real

## Referências

- `docs/DEPLOYMENT.md` — Compose prod-like, LE, backup
- `docs/COMMERCIAL_READINESS.md` — gaps comerciais
- `docs/SECURITY.md` — sandbox e segredos
