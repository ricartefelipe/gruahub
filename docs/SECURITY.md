# GruaHub — Segurança

## Princípios

1. **Zero trust interno:** nenhum recurso de domínio confia em `tenant_id` vindo do cliente.
   O tenant é sempre derivado do JWT validado pelo Keycloak.
2. **Segredos apenas por variáveis de ambiente / secret store.** `.env.example` não contém valores reais.
3. **Sem PAN/CVV.** A plataforma nunca manipula dados brutos de cartão.
4. **Logs sem dados sensíveis.** Tokens, credenciais, payloads financeiros integrais e dados pessoais desnecessários nunca aparecem em logs.
5. **Mocks e fakes apenas em testes e sandbox.** Produção usa adaptadores reais. Endpoints `/api/v1/payments/sandbox/*` só existem com `GRUAHUB_SANDBOX_ENABLED=true` e exigem JWT (roles `PLATFORM_ADMIN` / `TENANT_ADMIN` / `FINANCE`) ou header `X-Sandbox-Secret`.

## Autenticação e Autorização

### Keycloak 24 (OIDC Provider)

- Realm `gruahub` com clientes:
  - `gruahub-backend` (confidential, client credentials)
  - `gruahub-web` (confidential, authorization code)
  - `gruahub-mobile` (public, PKCE)

### Roles (mapeadas como claim `roles` no JWT)

| Role                  | Acesso                                          |
|-----------------------|-------------------------------------------------|
| `PLATFORM_ADMIN`      | Tudo, todos os tenants (super-admin)            |
| `TENANT_ADMIN`        | Tudo dentro do próprio tenant                   |
| `OPERATIONS_MANAGER`  | Frota, rotas, relatórios                        |
| `FIELD_OPERATOR`      | Visitas, checklist, alertas (leitura/escrita)   |
| `TECHNICIAN`          | Manutenção, alertas                             |
| `FINANCE`             | Pagamentos, liquidações, relatórios financeiros |
| `ESTABLISHMENT_VIEWER`| Portal parceiro (somente leitura do próprio)    |

### Extração do tenant

```java
// TenantContext.java — populado por TenantContextFilter
@ServerRequestFilter
public class TenantContextFilter {
    @Inject JsonWebToken jwt;

    public void filter(ContainerRequestContext ctx) {
        String tenantId = jwt.getClaim("tenant_id");
        TenantContext.set(UUID.fromString(tenantId));
    }
}
```

Todos os recursos de domínio chamam `TenantContext.getTenantId()` nas queries SQL.
**Nunca** `ctx.getQueryParameter("tenantId")` ou campo de body.

## Webhooks

- **Assinatura HMAC-SHA256:** header `X-Signature` = `HMAC-SHA256(body, GRUAHUB_SANDBOX_WEBHOOK_SECRET)`
- **Replay protection:** `Idempotency-Key` header verificado contra tabela `webhook_event` (unique constraint)
- **Rate limiting:** sliding window in-memory configurável (`gruahub.rate-limit.*`):
  - `GlobalRateLimitFilter` — `/api/*` (default 300/60s por IP; `GRUAHUB_RATE_LIMIT_GLOBAL_*`)
  - `WebhookRateLimitFilter` — webhook 30/60s por IP+provider; sandbox 60/60s por IP
  - Retorna 429 com `Retry-After`. Não é WAF nem store distribuído (multi-instância ainda aberto).

## MQTT (EMQX)

- **ACL por dispositivo** em produção: cada controlador usa credenciais únicas com permissão apenas para seu tópico (`gruahub/{tenantId}/machines/{machineId}/#`)
- **Backend usa credencial separada** com acesso de leitura ao wildcard do tenant
- **TLS obrigatório** em produção (porta 8883). Modo local usa porta 1883 sem TLS
- Segredo do dispositivo: `EMQX_DEVICE_PASSWORD` por variável de ambiente (não hard-coded)

## Proteção contra Injeção

- Todas as queries SQL usam parâmetros nomeados (`:param`) — nunca concatenação de string
- Caminhos de arquivo nunca aceitos do cliente (regra: `"Nunca aceitar caminho de arquivo do cliente"`)
- Validação de entrada via Bean Validation (`@NotNull`, `@Size`, `@Valid`) em todos os DTOs

## Segredos e Configuração

| Segredo                         | Local          | Produção          |
|---------------------------------|----------------|-------------------|
| `POSTGRES_PASSWORD`             | `.env` (local) | Secret Manager    |
| `KEYCLOAK_ADMIN_PASSWORD`       | `.env` (local) | Secret Manager    |
| `EMQX_BACKEND_PASSWORD`         | `.env` (local) | Secret Manager    |
| `EMQX_DEVICE_PASSWORD`          | `.env` (local) | Secret Manager    |
| `GRUAHUB_SANDBOX_WEBHOOK_SECRET`| `.env` (local) | Secret Manager    |
| `NEXTAUTH_SECRET`               | `.env` (local) | Secret Manager    |
| `AWS_SECRET_ACCESS_KEY`         | `.env` (local) | IAM Role          |

## Auditoria

Todo evento sensível é registrado na tabela `audit_log` com:
- `actor_user_id` / `actor_email`
- `action` (ex: `MACHINE_STATUS_CHANGED`)
- `resource_type` / `resource_id`
- `outcome` (SUCCESS / FAILURE)
- `correlation_id` (rastreabilidade entre logs, traces e audit)
- `ip_address`

## Checklist de Hardening para Produção

- [ ] Habilitar TLS no EMQX (porta 8883)
- [ ] Configurar ACL MQTT por dispositivo (emqx_acl.conf)
- [ ] Revogar credenciais de demonstração (seed)
- [x] Ativar `quarkus.http.proxy.proxy-address-forwarding=true` atrás de proxy reverso
- [ ] Mover todos os segredos para AWS Secrets Manager / Vault (hoje: só `.env` / `${VAR}`)
- [x] Configurar CORS com origens explícitas (`GRUAHUB_CORS_ORIGINS` / default inclui `https://localhost`)
- [ ] Habilitar Content-Security-Policy no Next.js (`next.config.js`)
- [x] Rate limiting global da API (`GlobalRateLimitFilter`)
- [ ] Ativar rate limiting também no endpoint de login (via Keycloak ou proxy)
- [ ] TLS público (Let's Encrypt); local já coberto pelo profile `tls`
- [ ] Revisar e reduzir TTL dos tokens de acesso (padrão Keycloak: 5 min)
- [ ] Configurar alertas de falha de autenticação no SIEM
