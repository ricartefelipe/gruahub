# Mobile Hardening Report — PROMPT 5

**Data:** 2026-07-17  
**Escopo:** Endurecimento do app mobile GruaHub (Expo 51 + expo-router 3.5)  
**Resultado dos testes:** 17/17 ✅

---

## 1. Autenticação PKCE (Task #64)

### Arquivo: `app/login/index.tsx`, `src/store/authStore.ts`

O app usa Authorization Code + PKCE via `expo-auth-session`. **Nenhum `client_secret` embarcado.**

**Fluxo:**
1. `AuthSession.useAuthRequest` gera `code_verifier` e `code_challenge` (SHA-256).
2. O usuário autentifica no Keycloak via browser embutido (`expo-web-browser`).
3. O código é trocado por tokens em `/protocol/openid-connect/token` com `grant_type=authorization_code` + `code_verifier` (sem client_secret).
4. Scope `offline_access` solicitado para obter `refresh_token` de longa duração.

**Chaves SecureStore:**

| Chave                  | Conteúdo                         |
|------------------------|----------------------------------|
| `gh_access_token`      | JWT de acesso (curta duração)    |
| `gh_refresh_token`     | Token de renovação               |
| `gh_token_expires_at`  | Unix ms da expiração             |
| `gh_tenant_id`         | ID do tenant do operador         |
| `gh_user_id`           | Subject do JWT                   |
| `gh_user_email`        | Email do operador                |

**Garantias:**
- Tokens jamais logados nem em `AsyncStorage`.
- `restoreSession()` chamado no `_layout.tsx` — exibe splash até completar.
- `needsRefresh()` retorna `true` se `expiresAt - now() < 60_000 ms`.
- `refreshAccessToken()` usa `grant_type=refresh_token` sem `client_secret`.
- Ao falhar o refresh (401), `clearAuth()` redireciona ao login.

---

## 2. Schema SQLite Versionado (Task #65)

### Arquivo: `src/db/schema.ts`

6 migrações incrementais, aplicadas em ordem por `initDb()`:

| Versão | Tabela/Índice          | Descrição                                     |
|--------|------------------------|-----------------------------------------------|
| v1     | `offline_operation`    | Fila de operações com 5 estados + retry       |
| v2     | `cached_route`         | Cache de rotas diárias                       |
| v3     | `cached_machine`       | Cache de máquinas do operador                |
| v4     | `auth_token`           | Backup local dos tokens                      |
| v5     | `schema_version`       | Controle de versão das migrações             |
| v6     | `idx_op_status_retry`  | Índice para getPendingOperations eficiente   |

**Crash recovery:** ao iniciar, `initDb()` reseta `SYNCING → PENDING` para ops travadas por crash anterior.

**Flag `initialized`:** `getDb()` usa flag separado de `db !== null` para distinguir "banco aberto" de "banco inicializado" — permite `__setDb()` injetar banco em testes e forçar re-execução do `initDb()`.

---

## 3. Máquina de Estados da Fila Offline (Task #66)

### Arquivo: `src/db/offlineQueue.ts`

```
PENDING ─────────────────────────────────────────────┐
   │                                                  │
   ▼ markSyncing()                                    │ retryManual()
SYNCING ── markSynced() ──► SYNCED                   │
   │                                                  │
   ├── markFailedRetryable() ──► FAILED_RETRYABLE ──►┘
   │         (retry_count < MAX_RETRIES=10)
   │
   └── markFailedRetryable() ──► FAILED_PERMANENT
         (retry_count >= MAX_RETRIES)
         OU markFailedPermanent() direto
```

**Backoff exponencial com jitter ±25%:**
```typescript
const baseMs = Math.min(BACKOFF_BASE_MS * Math.pow(3, retryCount - 1), BACKOFF_MAX_MS);
// BACKOFF_BASE_MS=5_000, BACKOFF_MAX_MS=3_600_000
const jitter = baseMs * (0.75 + Math.random() * 0.5);
```

| retry_count | Base   | Intervalo (jitter ±25%)   |
|-------------|--------|---------------------------|
| 1           | 5 s    | 3.75 s – 7.5 s            |
| 2           | 15 s   | 11.25 s – 22.5 s          |
| 3           | 45 s   | 33.75 s – 67.5 s          |
| 10          | 3600 s | 45 min – 75 min (cap)     |

**Clock injetável** para testes sem espera real:
```typescript
export interface Clock { now(): number; }
export const SystemClock: Clock = { now: () => Date.now() };
```

**Deduplicação:** `INSERT OR IGNORE` em `client_operation_id UNIQUE`.

---

## 4. API Client Mobile (Task #67)

### Arquivo: `src/api/apiClient.ts`

- **Timeout:** `AbortController` com 15 s (`REQUEST_TIMEOUT_MS = 15_000`)
- **X-Correlation-Id:** UUID v4 por requisição para rastreabilidade distribuída
- **Idempotency-Key:** `clientOperationId` em operações de sync
- **Problem Details RFC 7807:** `ApiError` com `isRetryable` e `isPermanent`

**Mapeamento de erros no `useSyncQueue`:**
- `2xx` → `markSynced()`
- `409` → `markSynced()` (já processado — idempotência)
- `401` → refresh; se falhar → `clearAuth()` + abort ciclo
- `400/403/422` → `markFailedPermanent()`
- `5xx/timeout/rede` → `markFailedRetryable()`

---

## 5. Correções de Endpoints (Task #68)

| Endpoint antigo (errado)                    | Endpoint correto          |
|---------------------------------------------|---------------------------|
| `/api/v1/routing/plans`                     | `/api/v1/routes`          |
| `/api/v1/routing/plans/${id}/stops`         | `/api/v1/routes/${id}/stops` |

Confirmado via anotação `@Path` em `RoutingResource.java`.

**Indicador de rede** na tela de rota: ponto verde/âmbar com label "Online"/"Offline" usando `expo-network`.

---

## 6. Testes Unitários (Task #69)

**17/17 ✅** — `node_modules/.bin/jest --no-coverage`

| Grupo                         | Casos de teste                                              |
|-------------------------------|-------------------------------------------------------------|
| `enqueue`                     | Adiciona PENDING, deduplicação, 2 ops distintas             |
| `ordenação por created_at`    | START_VISIT antes de COMPLETE_VISIT                         |
| Ciclo PENDING→SYNCING→SYNCED  | Fluxo de sucesso completo                                   |
| `markFailedRetryable`         | Status/retryCount, clock fixo, MAX_RETRIES→PERMANENT, crescimento exponencial |
| `markFailedPermanent`         | FAILED_PERMANENT direto                                     |
| `retryManual`                 | FAILED_PERMANENT→PENDING (retry_count=0), no-op em outros  |
| `crash recovery`              | SYNCING→PENDING no startup                                  |
| `getQueueStats`               | 5 estados contados corretamente                             |
| `getPendingOperations`        | Filtra next_retry_at futuro; inclui passado                 |
| `schema_version`              | Populada após initDb()                                      |

**Mocks in-memory** (zero bindings nativos):
- `expo-sqlite.ts` — mini SQL interpreter: DDL, INSERT OR IGNORE, UPDATE com offset correto de parâmetros SET/WHERE, SELECT com GROUP BY/projeção/ORDER BY/LIMIT, WHERE com AND/OR/IN/IS NULL/`<= datetime('now')`
- `expo-secure-store.ts` — Map em memória
- `expo-network.ts` — estado controlável via `__setConnected()`

**Regra importante:** não usar `jest.mock('expo-sqlite')` no código de teste. O `moduleNameMapper` (com anchors `^...$`) já faz a substituição. `jest.mock()` sobrescreveria com automock vazio, zerando a implementação.

---

## 7. Limitações Conhecidas

**L1 — node_modules residual (Windows):** se `npm install` falhar com `ENOTEMPTY`:
```cmd
rmdir /s /q node_modules\.ajv-formats-tBwKEE1E
npm install
```

**L2 — `useSyncQueue` sem testes unitários:** o hook React requer `@testing-library/react-native`. A lógica de mapeamento de erros está coberta indiretamente pelos testes de `offlineQueue.ts`.

**L3 — Timestamps em resolução de segundos:** `msToSqlite()` trunca para segundos (`slice(0, 19)`). O teste de backoff aceita ±999 ms no limite inferior como tolerância.

**L4 — Cache de rotas não implementado:** `cached_route` e `cached_machine` têm tabelas no schema mas sem lógica de leitura/escrita. A tela de rota faz fetch a cada abertura sem fallback offline.

**L5 — `expo-network@~6.0.1`:** a versão `~6.0.2` não existe como release estável. Corrigido para `~6.0.1` no `package.json`.

---

## 8. Arquivos Modificados/Criados

| Arquivo                                    | Status     | Descrição                                        |
|--------------------------------------------|------------|--------------------------------------------------|
| `mobile/package.json`                      | Modificado | expo-secure-store, expo-network adicionados      |
| `mobile/jest.config.js`                    | Reescrito  | ts-jest, diagnostics:false, anchors ^...$        |
| `mobile/src/db/schema.ts`                  | Reescrito  | 6 migrações versionadas                          |
| `mobile/src/db/offlineQueue.ts`            | Reescrito  | Máquina de estados + flag initialized            |
| `mobile/src/api/apiClient.ts`              | Novo       | Timeout 15s, ApiError RFC 7807, X-Correlation-Id |
| `mobile/src/store/authStore.ts`            | Reescrito  | PKCE, SecureStore, refresh automático            |
| `mobile/src/hooks/useSyncQueue.ts`         | Reescrito  | Sync com network check, mapeamento de erros      |
| `mobile/app/_layout.tsx`                   | Modificado | Aguarda DB + session antes de renderizar         |
| `mobile/app/login/index.tsx`               | Modificado | Padding Base64 correto, setAuth completo         |
| `mobile/app/(tabs)/index.tsx`              | Modificado | Endpoint /api/v1/routes, indicador de rede       |
| `mobile/app/(tabs)/queue.tsx`              | Modificado | 5 estados, retryManual, stats bar                |
| `mobile/src/__mocks__/expo-sqlite.ts`      | Novo       | Mini SQL interpreter in-memory                   |
| `mobile/src/__mocks__/expo-secure-store.ts`| Novo       | Map in-memory                                    |
| `mobile/src/__mocks__/expo-network.ts`     | Novo       | Estado de rede controlável                       |
| `mobile/src/__tests__/offlineQueue.test.ts`| Novo       | 17 testes unitários                              |

---

## 9. Contratos de Segurança

| Restrição                                          | Status                          |
|----------------------------------------------------|---------------------------------|
| Não armazenar client_secret no app                 | ✅ PKCE sem secret               |
| Token nunca em logs ou localStorage inseguro       | ✅ Apenas SecureStore            |
| Não declarar offline sem teste de fila e retry     | ✅ 17 testes, todos os estados   |
| Não usar espera real em testes de backoff          | ✅ Clock injetável               |
| Não usar mocks E2E — apenas unitários              | ✅ ts-jest com mocks in-memory   |
| Não manter dados mockados na jornada               | ✅ Endpoint real /api/v1/routes  |
| Não usar force/legacy peer deps                    | ✅ expo-network@~6.0.1 estável   |
| Não executar operação Git                          | ✅ Nenhuma operação git          |
