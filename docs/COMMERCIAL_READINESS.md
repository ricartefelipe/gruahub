# GruaHub — Prontidão Comercial

> Análise honesta dos gaps entre o MVP atual e um produto comercialmente implantável.  
> Não é uma lista de melhorias desejáveis — é uma avaliação de riscos para cada gap.

---

## O que está pronto para clientes beta

Estes itens funcionam hoje, sem condicionantes:

- Autenticação multitenant via Keycloak OIDC
- Isolamento de tenant verificado em teste automatizado
- Backend com testes de integração passando (100%)
- App mobile com fila offline, retry e deduplicação testados
- Telemetria IoT via EMQX com schema validado
- Pagamentos sandbox com HMAC e idempotência
- Rotas, visitas, sangria, comissão, alertas funcionais
- CI/CD com 7 jobs (security/export com soft-fail; smoke compose em PR/develop)
- Rate limiting global da API + limites mais estritos em webhook/sandbox
- HTTPS local via Caddy (Compose profiles `tls` / `prod-like`) com headers de segurança
- Overlay `docker-compose.prod-like.yml`: app/admin sem portas no host (tráfego via Caddy)
- Keycloak brute-force protection no realm demo (`failureFactor=5`)
- Backup agendado do PostgreSQL (`pg_dump` no profile `backup` / `prod-like`)
- Segredos do Compose apenas via `${VAR}` / `infra/.env` (sem literais no YAML)

---

## Gaps para Produção Comercial

### Críticos — bloqueiam go-live

| Gap | Risco | Esforço estimado | Estado |
|-----|-------|------------------|--------|
| TLS/HTTPS em deploy real (Let's Encrypt / cert gerenciado) | Dados em trânsito sem criptografia em produção pública | 1–2 dias (Caddy/Traefik + DNS) | Parcial — HTTPS local com `tls internal` pronto; produção pública ainda aberta |
| Secrets em Vault / AWS Secrets Manager | Rotação manual; risco de exposure em CI logs | 3–5 dias | Parcial — Compose 100% `${VAR}`; Vault/SM ainda necessário para produção |
| Rate limiting global / WAF / login | DDoS e enumeração de tenants | 1 dia restante (WAF / Keycloak atrás do edge) | Parcial — API global + Keycloak brute-force; sem WAF nem proxy Keycloak |
| Backup Postgres com offsite (S3) | Perda de dados se o volume local falhar | 0,5–1 dia (upload S3 + restore drill) | Parcial — `pg_dump` local agendado; offsite/restore drill abertos |
| Sem auditoria de penetração | Vulnerabilidades desconhecidas | Externo — 2–4 semanas | Aberto |

### Importantes — degradam a experiência

| Gap | Risco | Esforço estimado |
|-----|-------|-----------------|
| Push notifications FCM não ativado | Operadores não recebem alertas em tempo real | 2–3 dias (configuração FCM + Expo Notifications) |
| SMS/e-mail não implementados | Alertas críticos não chegam fora do app | 3–5 dias (SendGrid/Twilio) |
| Internacionalização ausente (somente pt-BR) | Clientes fora do Brasil bloqueados | 5–10 dias |
| Escalonamento horizontal não testado | Falha silenciosa em multi-instância (outbox, locks, rate-limit in-memory) | 5–10 dias (CDC/Debezium ou Kafka + store distribuído) |
| Sem SLA/monitoramento externo | Downtime sem alerta proativo | 1–2 dias (Uptime Robot, Grafana Cloud) |

### Escopo futuro — não bloqueiam go-live

| Item | Justificativa |
|------|---------------|
| Integração com adquirentes reais | Requer contrato comercial com Mercado Pago/Stone/Pixmaq |
| Firmware OTA real | Depende de fabricante + certificação regulatória |
| Algoritmo de roteirização geoespacial (TSP/OSRM) | Melhoria de eficiência, não funcionalidade crítica |
| NF-e / NFC-e / obrigações fiscais | Requer integração com SEFAZ por UF |
| Otimização de IA/ML | Preditivo de falha, precificação dinâmica |
| Kubernetes / Kafka | Para escala acima de ~100 máquinas por instância |
| Carteira digital do jogador | Produto separado (B2C) |
| Adaptadores por controlador (Eletek, Sega) | Requere parceria técnica com fabricante |

---

## Fatia entregue: commercial hardening baseline + perímetro prod-like

Entregue no Compose / backend (ver `DEPLOYMENT.md`):

1. **TLS local** — serviço `caddy` nos profiles `tls` e `prod-like` (`https://localhost`)
2. **Rate-limit global** — `GlobalRateLimitFilter` em `/api/*` (env `GRUAHUB_RATE_LIMIT_GLOBAL_*`)
3. **Backup Postgres** — `postgres-backup` com `pg_dump` + retenção (profiles `backup` / `prod-like`)
4. **Secrets** — YAML sem senhas literais; `infra/.env.example` e raiz `.env.example` alinhados
5. **Perímetro prod-like** — overlay sem publicar 8080/3000/Postgres/MinIO/dashboards; script `up-prod-like.sh`
6. **Headers Caddy** — HSTS e headers básicos de browser hardening
7. **Login throttle** — brute-force Keycloak no realm importado

Ainda aberto nesta frente: Vault/SM (`*_FILE` path), cert público, offsite backup + restore drill, Keycloak atrás do Caddy, WAF, FCM/SMS/e-mail, pen-test, pagamento real, hardware, NF-e.

---

## Roadmap Sugerido para Go-Live

```
Mês 1 (Hardening de infra) — em andamento:
  ├── HTTPS/TLS local (Caddy) ✅ / Let's Encrypt produção ⬜
  ├── Perímetro prod-like (sem 8080/3000 no host) ✅ / Keycloak no edge ⬜
  ├── Segredos via .env no Compose ✅ / Vault ou SM / *_FILE ⬜
  ├── Backup PostgreSQL local ✅ / offsite S3 ⬜
  └── Rate limiting API + Keycloak brute-force ✅ / WAF ⬜

Mês 2 (Notificações + Monitoramento):
  ├── FCM + Expo Notifications ativo
  ├── E-mail/SMS via SendGrid/Twilio
  ├── Grafana Cloud / Uptime Robot
  └── Auditoria de penetração (externa)

Mês 3 (Piloto com cliente beta):
  ├── 1–2 clientes com hardware simulado
  ├── Coleta de feedback operacional
  └── Correções críticas de UX

Mês 4–6 (Hardware real):
  ├── Adaptador para 1 fabricante de controlador
  ├── Integração com adquirente sandbox
  └── Testes em campo
```

---

## Declaração de Escopo do MVP

Este MVP **não é** e **não deve ser anunciado como**:

- Sistema de produção com hardware físico real
- Integração com adquirente de pagamento real
- Sistema com certificações de segurança (PCI-DSS, ISO 27001)
- Produto com SLA garantido

Este MVP **é** e **pode ser demonstrado como**:

- Plataforma funcional de ponta a ponta em ambiente controlado
- Arquitetura multitenant com isolamento verificado
- Fundação técnica sólida para escalonamento comercial
- Prova de conceito validável com clientes beta
