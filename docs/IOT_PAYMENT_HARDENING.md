# IoT, Pagamento e Reconciliação — Relatório de Hardening (PROMPT 3)

> **Escopo**: endurecimento do fluxo `PaymentTransaction PENDING → CONFIRMED → CreditGrant → MQTT → ACK → PLAY_STARTED → PLAY_COMPLETED → ReconciliationCase MATCHED`

---

## 1. Contrato de Fluxo Completo

```
POST /api/v1/payments/sandbox/initiate   (X-Tenant-Id, X-Machine-Id)
  └─► payment_transaction (PENDING)
        │
POST /api/v1/payments/sandbox/confirm/{txId}
  └─► PaymentWebhookService.simulateSandboxConfirmation()
        ├─► payment_event_inbox  INSERT ON CONFLICT DO NOTHING   ← inbox idempotente
        ├─► payment_transaction  UPDATE WHERE status='PENDING'   ← atomic confirm
        └─► CreditService.grantCreditForPayment()
              ├─► credit_grant   INSERT ON CONFLICT DO NOTHING   ← exactly-once
              ├─► outbox_event   INSERT (GRANT_CREDIT, PENDING)  ← outbox atômica
              └─► device_command INSERT (PENDING)                ← rastreabilidade ACK

OutboxPublisher (scheduler 1s):
  └─► MqttClientService.publishCommand() → tópico v1/{tenant}/machines/{id}/commands
        └─► device_command  status=PUBLISHED
        └─► credit_grant    status=SENT

Máquina (machine-simulator):
  └─► CREDIT_RECEIVED → tópico command-acks
        └─► IotEventService.handleCommandAck()
              ├─► device_message_inbox  INSERT ON CONFLICT DO NOTHING
              └─► CreditService.acknowledgeCredit() → credit_grant status=ACKNOWLEDGED

  └─► PLAY_STARTED → tópico events
        └─► IotEventService.handlePlayStarted()
              └─► play_session  INSERT ON CONFLICT (credit_grant_id) DO NOTHING

  └─► PLAY_COMPLETED → tópico events
        └─► IotEventService.handlePlayCompleted()
              └─► play_session status=COMPLETED
              └─► CreditService.consumeCredit() → credit_grant status=CONSUMED

ReconciliationScheduler (scheduler 5 min):
  └─► reconciliation_case status=MATCHED
```

---

## 2. Máquina de Estados dos Domínios

### 2.1 payment_transaction.status
```
PENDING ──[confirm]──► CONFIRMED
PENDING ──[fail]────► FAILED
PENDING ──[expire]──► EXPIRED
```
Transição `CONFIRMED → *` é bloqueada: `UPDATE WHERE status='PENDING'` retorna 0 rows se já confirmado.

### 2.2 credit_grant.status
```
PENDING ──[outbox published]──► SENT
SENT ────[CREDIT_RECEIVED ACK]► ACKNOWLEDGED
ACKNOWLEDGED ──[PLAY_COMPLETED]► CONSUMED
```
Idempotência em cada transição: `UPDATE WHERE status IN (...)` — transições repetidas são no-op.

### 2.3 reconciliation_case.status
| Estado | Condição |
|---|---|
| `MATCHED` | `payment CONFIRMED` + `credit CONSUMED` + `play COMPLETED` |
| `PAYMENT_WITHOUT_CREDIT` | `payment CONFIRMED` sem `credit_grant` após janela |
| `CREDIT_NOT_ACKNOWLEDGED` | `credit SENT/PENDING` sem ACK após janela |
| `CREDIT_WITHOUT_PLAY` | `credit CONSUMED` sem `play COMPLETED` após janela |
| `PLAY_WITHOUT_PAYMENT` | `play_session` sem `credit_grant.payment_transaction_id` |
| `DUPLICATE_EVENT` | `credit_grant` com mais de uma `play COMPLETED` |
| `MANUALLY_RESOLVED` | Resolvido por operador via `POST /{id}/resolve` |

---

## 3. Constraints de Banco Críticas

| Tabela | Constraint | Efeito |
|---|---|---|
| `credit_grant` | `uq_credit_grant_payment (payment_transaction_id)` | Exactly-once credit por pagamento |
| `play_session` | `uq_play_session_credit_grant (credit_grant_id)` | Um play por crédito (migration 018) |
| `device_message_inbox` | `uq_device_inbox (message_id, tenant_id)` | Deduplicação de mensagens MQTT |
| `payment_event_inbox` | `uq_payment_event_key_tenant (event_key, tenant_id)` | Deduplicação de webhooks |

**Migration 018** (`018-iot-payment-fixes.yaml`) adiciona:
- `UNIQUE(credit_grant_id)` em `play_session`
- `status_reason TEXT` e `resolved_by VARCHAR(255)` em `reconciliation_case`
- `published_at TIMESTAMPTZ` em `device_command`
- `device_id VARCHAR(100)` em `device_message_inbox`
- `last_message_id` e `last_message_at` em `machine_reported_state`

---

## 4. Segurança

### 4.1 HMAC de Webhook (timing-safe)
```java
// SandboxPaymentProvider.verifyWebhookSignature()
byte[] expected = mac.doFinal(payload);
String expectedHex = HexFormat.of().formatHex(expected);
return MessageDigest.isEqual(
    expectedHex.getBytes(StandardCharsets.UTF_8),
    signature.getBytes(StandardCharsets.UTF_8)   // ← comparação em tempo constante
);
```
Garante resistência a timing attack: comparação sempre leva o mesmo tempo independente de quantos bytes coincidem.

### 4.2 tenant_id — Origem Exclusiva
| Contexto | Origem do tenant_id |
|---|---|
| REST endpoints | JWT claim → `TenantContext` (ThreadLocal) |
| Webhook | Header `X-Tenant-Id` (validado via `UUID.fromString`) |
| MQTT | Topic `v1/{tenantId}/machines/{machineId}/...` |

**Nunca** extraído do payload do cliente.

### 4.3 Ownership de Máquina (MQTT)
`IotEventService.machineExistsForTenant()` valida que `machineId` pertence a `tenantId` antes de processar qualquer mensagem. Violação → log de auditoria + retorno silencioso.

### 4.4 Schema Version (MQTT)
`MqttMessageProcessor` rejeita mensagens com `schemaVersion` fora de `SUPPORTED_SCHEMA_VERSIONS = {1}`. Log com `messageId`, sem logar payload (que pode conter dados sensíveis).

---

## 5. Idempotência e Anti-TOCTOU

Cada portão usa `INSERT ON CONFLICT DO NOTHING` + verificação de `rowsAffected`:

```java
int rows = em.createNativeQuery(
    "INSERT INTO device_message_inbox ... ON CONFLICT (message_id, tenant_id) DO NOTHING"
).executeUpdate();
if (rows == 0) return; // duplicata — sai sem processar
```

Padrão idêntico em:
- `device_message_inbox` (IotEventService)
- `payment_event_inbox` (PaymentWebhookService)
- `credit_grant` (CreditService — unique constraint)
- `play_session` (IotEventService — unique constraint)

---

## 6. Outbox Transacional

### Problema resolvido
`CreditService` antes chamava `mqttClientService.publishCommand()` dentro de `@Transactional`. Se o broker MQTT estivesse offline, a exceção fazia rollback da transação → crédito perdido.

### Solução
```
CreditService (TX)          OutboxPublisher (scheduler fora de TX)
     │                                │
     ├─ INSERT credit_grant           │
     ├─ INSERT outbox_event ──────────┤─► MqttClientService.publishCommand()
     └─ COMMIT                        │
                                      ├─ UPDATE device_command status=PUBLISHED
                                      └─ UPDATE credit_grant status=SENT
```
Se MQTT falhar: `outbox_event` permanece `PENDING` e o scheduler tenta novamente. O crédito não é perdido.

---

## 7. Anti-padrões Corrigidos

| Arquivo | Problema original | Correção |
|---|---|---|
| `ReconciliationResource.java:121` | `CDI.current().select(SecurityContext.class)` — anti-padrão CDI | `@Context SecurityContext secCtx` como parâmetro JAX-RS |
| `FinanceResource.java:209` | `.getSingleResult()` → `NoResultException` → 500 | `.getSingleResultOrNull()` + `NotFoundException` |
| `ReconciliationResource.java:107` | idem | idem |
| `ReportResource.java:150` | idem | idem |
| `ReconciliationScheduler` | Faltava happy-path MATCHED, DUPLICATE_EVENT, PLAY_WITHOUT_PAYMENT; clock hardcoded `Instant.now()` | Todos os estados implementados; `Clock` injetável via `setClock()` |
| `OutboxPublisher.dispatchEvent()` | Stub que só logava `"Outbox event dispatched"` sem publicar MQTT | Implementado: extrai `tenantId`/`machineId` do payload, chama `mqttClientService.publishCommand()` |
| `payment-simulator/createAndConfirmPayment()` | Gerava `transactionId` local sem criar no banco; `sandbox/confirm` encontrava 0 rows | Usa `/sandbox/initiate` primeiro; depois confirma |

---

## 8. Testes

### 8.1 Testes Unitários / @QuarkusTest

| Arquivo | Testes | Cobertura |
|---|---|---|
| `BackendServiceTest.java` | 24 testes | JsonUtil escaping, isolamento de tenant, máquina CRUD, audit, estoque |
| `BackendIotFlowTest.java` | 8 testes | Exactly-once credit, outbox, scheduler MATCHED/PAYMENT_WITHOUT_CREDIT/DUPLICATE_EVENT, idempotência scheduler, ACK/consumeCredit idempotentes |

### 8.2 Testes de Integração

| Arquivo | Tipo | Cobertura |
|---|---|---|
| `IdempotencyIT.java` | `@QuarkusIntegrationTest` | Webhook sem header → 400, sandbox confirm → 200, api root → 404, health UP |
| `TenantIsolationIT.java` | `@QuarkusTest` + `@TestSecurity`/`@OidcSecurity` | 401 sem token; 403 sem `tenant_id`; listagem escopada ao JWT; GET cross-tenant → 404 |

### 8.3 Simuladores

| Simulador | Comando | Cenário |
|---|---|---|
| `payment-simulator` | `full-flow` | `initiate` → `confirm` → crédito criado |
| `payment-simulator` | `idempotency` | confirm duplicado → no-op |
| `payment-simulator` | `duplicate-webhook` | mesmo webhook 2x → crédito único |
| `payment-simulator` | `invalid-signature` | HMAC errado → 401 |
| `payment-simulator` | `all-scenarios` | todos acima em sequência |
| `machine-simulator` | `normal` | heartbeat + responde GRANT_CREDIT |
| `machine-simulator` | `duplicate-ack` | envia CREDIT_RECEIVED duas vezes → backend deduplica |
| `machine-simulator` | `gap-sequence` | sequências 1, 2, 4 (pula 3) → alerta de gap |
| `machine-simulator` | `offline-recover` | fica offline 5s → reconecta |
| `machine-simulator` | `motor-fault` | publica ERROR_REPORT → alerta MAINTENANCE |

---

## 9. Comandos de Demo (Windows)

```powershell
# 1. Subir infraestrutura
cd C:\wks\gruahub
docker compose up -d

# 2. Subir backend
cd backend
.\mvnw quarkus:dev

# 3. Rodar payment simulator — fluxo completo
cd ..\simulators\payment-simulator
$env:TENANT_ID="11111111-0000-0000-0000-000000000001"
$env:MACHINE_ID="66666666-0000-0000-0000-000000000001"
npx ts-node src/index.ts full-flow

# 4. Rodar machine simulator — modo normal (escuta GRANT_CREDIT)
cd ..\machine-simulator
$env:TENANT_ID="11111111-0000-0000-0000-000000000001"
$env:MACHINE_IDS="66666666-0000-0000-0000-000000000001"
npx ts-node src/index.ts

# 5. Verificar reconciliação
curl -s http://localhost:8080/api/v1/reconciliation/summary ^
     -H "Authorization: Bearer <token>"

# 6. Rodar testes do backend
cd ..\..\backend
.\mvnw test -pl . -Dgroups="io.quarkus.test.junit.QuarkusTest"

# 7. Cenário: assinatura inválida
cd ..\simulators\payment-simulator
npx ts-node src/index.ts invalid-signature
# Esperado: HTTP 401

# 8. Cenário: gap de sequência (máquina)
cd ..\machine-simulator
$env:SCENARIO="gap-sequence"
npx ts-node src/index.ts
# Esperado: alerta criado no backend
```

---

## 10. Observabilidade

Todos os eventos críticos são logados com campos estruturados:

| Evento | Nível | Campos logados |
|---|---|---|
| MQTT com schemaVersion desconhecida | WARN | `messageId`, versão recebida — SEM payload |
| Ownership violation (machineId ≠ tenantId) | WARN | `machineId`, `tenantId` — SEM payload |
| Inbox duplicata (MQTT) | DEBUG | `messageId`, `tenantId` |
| Inbox duplicata (webhook) | DEBUG | `eventKey`, `tenantId` |
| Pagamento confirmado + crédito enfileirado | INFO | `providerTxId`, `paymentId`, `machineId`, `plays` |
| Outbox GRANT_CREDIT publicado | INFO | `tenantId`, `machineId`, `commandId` |
| ReconciliationCase MATCHED | INFO | count |
| ReconciliationCase DUPLICATE_EVENT | ERROR | count — requer investigação imediata |
| Webhook signature inválida | WARN | `provider`, `tenantId` |

> **Segredos**: nenhum payload financeiro, segredo HMAC ou token é registrado em log.
