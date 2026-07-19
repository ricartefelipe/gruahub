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
- CI/CD com 7 jobs, sem `continue-on-error`

---

## Gaps para Produção Comercial

### Críticos — bloqueiam go-live

| Gap | Risco | Esforço estimado |
|-----|-------|-----------------|
| TLS/HTTPS ausente (Docker Compose usa HTTP) | Dados em trânsito sem criptografia | 1–2 dias (Traefik + Let's Encrypt) |
| Secrets em variáveis de ambiente (sem Vault) | Rotação manual; risco de exposure em CI logs | 3–5 dias (Vault ou AWS Secrets Manager) |
| Sem rate limiting global (há webhook + sandbox; sem WAF/login) | DDoS e enumeração de tenants | 1–2 dias (proxy/WAF ou SmallRye) |
| Backup automatizado do PostgreSQL ausente | Perda de dados em falha de volume | 1 dia (pg_dump agendado + S3) |
| Sem auditoria de penetração | Vulnerabilidades desconhecidas | Externo — 2–4 semanas |

### Importantes — degradam a experiência

| Gap | Risco | Esforço estimado |
|-----|-------|-----------------|
| Push notifications FCM não ativado | Operadores não recebem alertas em tempo real | 2–3 dias (configuração FCM + Expo Notifications) |
| SMS/e-mail não implementados | Alertas críticos não chegam fora do app | 3–5 dias (SendGrid/Twilio) |
| Internacionalização ausente (somente pt-BR) | Clientes fora do Brasil bloqueados | 5–10 dias |
| Escalonamento horizontal não testado | Falha silenciosa em multi-instância (outbox, locks) | 5–10 dias (CDC/Debezium ou Kafka) |
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

## Roadmap Sugerido para Go-Live

```
Mês 1 (Hardening de infra):
  ├── HTTPS/TLS com Traefik ou Nginx
  ├── Vault para secrets
  ├── Backup PostgreSQL automatizado
  └── Rate limiting global

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
