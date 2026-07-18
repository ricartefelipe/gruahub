# PROMPT 4 — Relatório de Hardening do Frontend Web

Data: 2026-07-17  
Escopo: `web/` — Next.js 14 App Router, NextAuth, TanStack Query, Playwright E2E

---

## 1. Diagnóstico inicial — estado das telas

| Tela | Antes | Depois |
|------|-------|--------|
| `/login` | OK — SSO button funcional | +guard credenciais demo só em `!production` |
| `/dashboard` | Conectado a API real (machinesApi, alertsApi) | Sem mudança estrutural necessária |
| `/dashboard/payments` | `.catch(()=>[])` silenciava erro; sem sandbox guard; sem `.content` | Corrigido: isError banner, sandbox guard, `.content` |
| `/dashboard/alerts` | `.then(r=>r.data)` sem `.content`; sem isError | Corrigido |
| `/dashboard/audit` | `.catch(()=>[])` silenciava erro; sem `.content` | Corrigido |
| `/dashboard/finance` | `.catch(()=>[])` silenciava erro; sem `.content` | Corrigido |
| `/dashboard/inventory` | Duas queries com `.catch(()=>[])` | Corrigido: isError em ambas |
| `/dashboard/locations` | Sem `.content` em establishments e operating-points | Corrigido |
| `/dashboard/maintenance` | `.then(r=>r.data)` sem `.content`; sem isError | Corrigido |
| `/dashboard/reconciliation` | `.then(r=>r.data)` sem `.content`; sem isError | Corrigido |
| `/dashboard/routes` | React importado no final do arquivo; `.catch(()=>[])` em 2 queries; sem `.content` | Corrigido: import movido para topo, ambas as queries corrigidas |
| `/dashboard/visits` | `.then(r=>r.data)` sem `.content`; sem isError | Corrigido |
| `/portal` | `r.data` sem `.content` em visits e alerts | Corrigido: `r.data?.content ?? r.data ?? []` |

---

## 2. Auth — Keycloak / NextAuth

### Antes (problemas)

- Roles nunca populadas na sessão: `jwt` callback copiava só `accessToken`
- Sem refresh automático de token
- Credenciais de demo expostas em produção
- `signOut` em loop ao receber 401 repetidos

### Depois (contratos implementados)

**`web/src/app/api/auth/[...nextauth]/route.ts`**

```
decodeKeycloakRoles(accessToken: string): string[]
  ↳ split('.')[1] → base64 → JSON.parse
  ↳ realm_access.roles ∪ resource_access.<clientId>.roles
  ↳ retorna Set<string> para evitar duplicatas

refreshAccessToken(token: JWT): Promise<JWT>
  ↳ POST Keycloak /protocol/openid-connect/token (grant_type=refresh_token)
  ↳ margem de 60s antes de expiresAt
  ↳ falha → { ...token, error: 'RefreshAccessTokenError' }

jwt callback:
  ↳ primeiro login: popula accessToken, refreshToken, expiresAt, roles
  ↳ chamadas subsequentes: verifica expiresAt - 60s, chama refreshAccessToken se expirado

session callback:
  ↳ session.roles = token.roles
  ↳ session.error = token.error (frontend pode exibir aviso de sessão expirada)

Configurações:
  ↳ maxAge: 8h (jornada operacional)
  ↳ scope: openid email profile roles offline_access
  ↳ pages.signIn = /login, pages.error = /login
```

---

## 3. API Client — `web/src/lib/api.ts`

### Garantias implementadas

| Garantia | Implementação |
|----------|---------------|
| Timeout 15s | `axios.create({ timeout: 15_000 })` |
| Bearer automático | request interceptor → `getSession()` → `Authorization: Bearer` |
| correlationId | `X-Correlation-Id: crypto.randomUUID()` em todo request |
| RFC 7807 Problem Details | response interceptor detecta `{ type/title, status }` → `throw ApiError` |
| 401 → signOut | `_signingOut` flag previne loop infinito; timeout 3s para reset |
| Sem silenciamento | Nenhum `.catch(()=>[])` no cliente — todos os erros sobem como `ApiError` |

### `ApiError.userMessage` por status

- 403 → "Você não tem permissão para esta ação."
- 404 → "Recurso não encontrado."
- 409 → "Conflito: registro já existe."
- 5xx → "Erro interno do servidor. Tente novamente."

### Módulos tipados (todos exportam `PageResponse<T>` ou tipo direto)

`machinesApi`, `alertsApi`, `establishmentsApi`, `operatingPointsApi`, `visitsApi`,
`maintenanceApi`, `inventoryApi`, `paymentsApi`, `reconciliationApi`, `financeApi`,
`routesApi`, `reportsApi`, `auditApi`

---

## 4. Padrão de correção — extração de `.content`

O backend retorna `PageResponse<T>` para todos os endpoints de listagem:

```json
{ "content": [...], "page": 0, "size": 20, "totalElements": N, ... }
```

Antes, as queries faziam `.then(r => r.data)` recebendo o objeto `PageResponse` inteiro
como array, resultando em arrays vazios ou erros silenciosos.

**Padrão correto adotado em todas as páginas:**

```typescript
queryFn: () =>
  api.get('/recurso').then(r => r.data?.content ?? r.data ?? [])
```

- `r.data?.content` — extrai array paginado (caso normal)
- `?? r.data` — fallback se API retornar array direto (endpoints não paginados)
- `?? []` — fallback defensivo final

---

## 5. Sandbox guard — `/dashboard/payments`

```typescript
const isSandbox = process.env.NEXT_PUBLIC_SANDBOX_ENABLED === 'true';

// Botões sandbox só aparecem em sandbox E se status === 'PENDING'
{isSandbox && p.status === 'PENDING' && (
  <button
    disabled={sandboxConfirm.isPending}
    onClick={() => sandboxConfirm.mutate(p.id)}
  >
    ✓ Confirmar
  </button>
)}
```

**Segurança:** a autorização real está no backend (`SandboxPaymentProvider` só existe em `%dev`).
O frontend apenas omite os botões em produção (`NEXT_PUBLIC_SANDBOX_ENABLED !== 'true'`).
Nunca confia no frontend para autorização.

---

## 6. Error UI — padrão de banner

Todas as páginas agora expõem erros de API ao usuário:

```tsx
{isError && (
  <div
    className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm"
    role="alert"
  >
    Erro ao carregar [recurso]: {(error as Error)?.message ?? 'falha de comunicação'}
  </div>
)}
```

- `role="alert"` para acessibilidade (screen readers anunciam imediatamente)
- Mensagem inclui detalhe do `ApiError.message` (vindo do Problem Details `detail` ou `title`)
- Não substitui dados existentes em cache (TanStack Query mantém `data` stale)

---

## 7. E2E Playwright — arquivos criados/atualizados

### Projetos no `playwright.config.ts`

| Projeto | Auth | Testes |
|---------|------|--------|
| `setup` | TENANT_ADMIN → `.auth/user.json` | `auth.setup.ts` |
| `setup-partner` | ESTABLISHMENT_VIEWER → `.auth/partner.json` | `auth.partner.setup.ts` |
| `chromium` | TENANT_ADMIN | todos os specs |
| `chromium-partner` | ESTABLISHMENT_VIEWER | `security.spec.ts`, `portal.spec.ts` |

### Specs novos

| Arquivo | Cenários |
|---------|----------|
| `e2e/auth.partner.setup.ts` | Login como ESTABLISHMENT_VIEWER, salva sessão |
| `e2e/payment-flow.spec.ts` | Lista de pagamentos, filtros, sandbox guard, initiate→confirm via API+botão |
| `e2e/reconciliation.spec.ts` | Tabela, filtros, cards de resumo, modal de resolução manual |
| `e2e/security.spec.ts` | Sem sessão→redirect, role insuficiente→bloqueado, cross-tenant→403, token inválido→401, submissão dupla |

### Cenários negativos cobertos

1. **Sem sessão** — `/dashboard`, `/portal`, `/dashboard/payments` redirecionam (contexto limpo)
2. **Role insuficiente** — ESTABLISHMENT_VIEWER não acessa `/dashboard/payments` ou `/dashboard/reconciliation` via URL direta
3. **Cross-tenant forjado** — header `X-Tenant-Id` diferente do JWT é ignorado pelo backend; dados retornados pertencem apenas ao tenant do token
4. **Token inválido** — `Authorization: Bearer token.invalido` retorna 401
5. **Sem Authorization** — retorna 401

### Restrições respeitadas

- **Sem mocks no E2E** — todos os testes chamam backend real (Keycloak, PostgreSQL, API)
- **Sem dados fictícios** — nenhum número hard-coded como "dados operacionais reais"
- **Sem secrets em `NEXT_PUBLIC_*`** — apenas `NEXT_PUBLIC_SANDBOX_ENABLED` e `NEXT_PUBLIC_API_URL` (URLs, não credentials)
- **Frontend não autoriza** — sandbox guard é UI-only; autorização real fica no backend

---

## 8. Comandos para executar E2E (Windows)

```powershell
# Pré-requisito: stack local rodando
cd web

# Criar diretório de auth state
mkdir e2e\.auth -ErrorAction SilentlyContinue

# Rodar setup + testes com TENANT_ADMIN
npx playwright test --project=setup --project=chromium

# Rodar apenas testes de segurança com parceiro
$env:E2E_IS_PARTNER="true"; npx playwright test --project=setup-partner --project=chromium-partner

# Rodar fluxo de pagamento (sandbox ativo)
$env:NEXT_PUBLIC_SANDBOX_ENABLED="true"; $env:E2E_SANDBOX="true"; `
npx playwright test e2e/payment-flow.spec.ts --project=chromium

# Relatório HTML
npx playwright show-report
```

---

## 9. Variáveis de ambiente E2E

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `E2E_BASE_URL` | `http://localhost:3000` | URL do Next.js |
| `E2E_API_URL` | `http://localhost:8080` | URL do backend |
| `E2E_KEYCLOAK_URL` | `http://localhost:8180` | URL do Keycloak |
| `E2E_KEYCLOAK_REALM` | `gruahub` | Realm |
| `E2E_KEYCLOAK_CLIENT` | `gruahub-web` | Client ID |
| `E2E_TEST_USER` | `operator@tenant1.com` | TENANT_ADMIN de teste |
| `E2E_TEST_PASS` | `op123` | Senha do TENANT_ADMIN |
| `E2E_PARTNER_USER` | `parceiro@shoppingbv.demo` | ESTABLISHMENT_VIEWER |
| `E2E_PARTNER_PASS` | `gruahub@2025` | Senha do parceiro |
| `E2E_TENANT_ID` | `00000000-...0001` | tenant_id do seed |
| `E2E_MACHINE_ID` | `` | UUID de máquina ACTIVE para teste de pagamento |
| `E2E_SANDBOX` | `false` | Ativa testes sandbox no E2E |
| `E2E_IS_PARTNER` | `false` | Sinaliza projeto partner para os specs |

---

## 10. Limitações conhecidas

1. **`chromium-partner` project** — o Playwright não suporta `env` por projeto nativamente (v1.44). O `E2E_IS_PARTNER=true` precisa ser setado no shell antes de rodar o projeto partner.

2. **payment-flow.spec.ts — initiate via API** — requer `E2E_MACHINE_ID` configurado com um UUID de máquina ACTIVE real do seed. Sem isso o teste é skipped gracefully.

3. **Token na sessão NextAuth** — o `accessToken` não é exposto por padrão via `/api/auth/session` por segurança. Os specs que precisam dele fazem uma chamada especulativa e skipam se não disponível.

4. **Reconciliação determinística** — o ReconciliationScheduler roda a cada 5 minutos. Testes E2E que verificam o estado MATCHED após um pagamento CONFIRMED precisam aguardar o ciclo ou chamar o endpoint de trigger manual (não implementado no E2E, apenas no backend de teste).

5. **Portal com ESTABLISHMENT_VIEWER** — depende do seed ter um usuário com role `ESTABLISHMENT_VIEWER` cadastrado no Keycloak. Validar com `docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r gruahub`.
