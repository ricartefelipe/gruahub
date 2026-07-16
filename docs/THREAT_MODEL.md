# GruaHub — Modelo de Ameaças (MVP)

Metodologia: STRIDE simplificado. Escopo: MVP em ambiente Docker Compose local
com exposição planejada para internet em produção.

## Ativos e Fronteiras de Confiança

```
[Internet]
    │
    ▼
[Proxy Reverso / CDN]  ─── TLS ───►  [Next.js Web :3000]
    │                                       │
    │  TLS                                  │ NextAuth session
    ▼                                       ▼
[Keycloak :8180]  ◄── OIDC ──────  [Quarkus Backend :8080]
                                           │
                              JWT          │ JDBC
                        (Bearer token)     ▼
[Expo Mobile]  ────────────────►  [PostgreSQL :5432]
                                           │
[Simuladores / Dispositivos]               │ S3 API
    │  MQTT                                ▼
    ▼                               [MinIO :9000]
[EMQX :1883/8883]  ◄──────────────────────┘
    │  MQTT listener
    ▼
[Quarkus Backend]
```

## Ameaças Identificadas

### T-001 — Spoofing (Identidade)
**Ameaça:** Atacante falsifica `tenant_id` no corpo da requisição para acessar dados de outro tenant.
**Mitigação:** `tenant_id` nunca aceito do cliente. Derivado exclusivamente do JWT validado.
**Status:** Mitigado.

### T-002 — Spoofing (Dispositivo MQTT)
**Ameaça:** Dispositivo malicioso publica mensagens fingindo ser outro `machineId`.
**Mitigação:** ACL MQTT por dispositivo em produção. Cada controlador tem credenciais únicas com permissão restrita ao próprio tópico.
**Status:** Mitigado em produção. Risco residual em dev (sem ACL local).

### T-003 — Tampering (Webhook)
**Ameaça:** Atacante forja um evento de pagamento confirmado.
**Mitigação:** HMAC-SHA256 no header `X-Signature`. Replay protection via `Idempotency-Key` com unique constraint no banco.
**Status:** Mitigado.

### T-004 — Tampering (SQL Injection)
**Ameaça:** Payload malicioso em parâmetro de query altera o SQL executado.
**Mitigação:** Todas as queries usam parâmetros nomeados. Bean Validation em todos os DTOs de entrada.
**Status:** Mitigado.

### T-005 — Repudiation (Audit Trail)
**Ameaça:** Operador nega ter realizado uma ação (ex: sangria excessiva).
**Mitigação:** Tabela `audit_log` imutável com `actor_user_id`, `actor_email`, `correlation_id`, `ip_address`. Logs estruturados em stdout com correlação ao trace.
**Status:** Mitigado.

### T-006 — Information Disclosure (Logs)
**Ameaça:** Token de acesso, senha ou PAN vaza em log.
**Mitigação:** Regras de logging documentadas (SECURITY.md). Revisão de código obrigatória. CI com grep para `Authorization:` ou `password` em strings de log.
**Status:** Mitigado (controle procedural + revisão).

### T-007 — Information Disclosure (Tenant Leakage)
**Ameaça:** Requisição de Tenant A retorna dados do Tenant B.
**Mitigação:** Todas as queries filtram por `tenant_id = :tid` derivado do JWT. Testes de isolamento em `TenantIsolationIT`.
**Status:** Mitigado.

### T-008 — Denial of Service (Webhook Flood)
**Ameaça:** Atacante envia milhares de requisições ao endpoint de webhook, esgotando threads.
**Mitigação:** `WebhookRateLimitFilter` — sliding window 30 req/60s por IP+provider. Retorna 429.
**Status:** Mitigado (MVP). Para produção: adicionar WAF / CDN rate limiting na camada de rede.

### T-009 — Elevation of Privilege (JWT Forgery)
**Ameaça:** Atacante forja um JWT com role `PLATFORM_ADMIN`.
**Mitigação:** Quarkus OIDC valida assinatura via JWKS do Keycloak. Sem validação apenas local (offline JWT).
**Status:** Mitigado.

### T-010 — Elevation of Privilege (IDOR)
**Ameaça:** Usuário A altera o ID na URL para acessar recurso do usuário B.
**Mitigação:** Todas as queries de leitura e escrita incluem `AND tenant_id = :tid`. UUID v4 como IDs (não sequenciais, difíceis de enumerar).
**Status:** Mitigado.

### T-011 — Path Traversal
**Ameaça:** Payload com `../../../etc/passwd` no campo de arquivo.
**Mitigação:** Regra: nunca aceitar caminho de arquivo do cliente. Uploads salvos com chave S3 gerada pelo servidor (UUID), não pelo cliente.
**Status:** Mitigado.

## Riscos Residuais (Aceitáveis para MVP)

| Risco                              | Justificativa de aceitação            |
|------------------------------------|---------------------------------------|
| Rate limiting apenas em memória    | MVP instância única; escalar com Redis|
| TLS ausente no EMQX local          | Desenvolvimento local apenas          |
| Força bruta no Keycloak            | Keycloak tem proteção de brute-force nativa; configurar em produção |
| XSS no portal web                  | Next.js escapa HTML por padrão; CSP a adicionar em produção |
| Secrets em `.env` no dev           | Documentado; produção usa Secrets Manager |

## Próximos Passos (Pós-MVP)

- Pen test externo antes de lançamento em produção
- Implementar CSP e HSTS no Next.js
- WAF na CDN (CloudFlare / AWS WAF) na frente do backend
- Certificação SOC 2 / LGPD DPA se escalar para dados pessoais de jogadores
- Revisão periódica deste modelo (a cada release major)
