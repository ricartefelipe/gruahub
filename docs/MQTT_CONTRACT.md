# GruaHub — Contrato MQTT v1

O contrato completo em JSON Schema está em `contracts/mqtt/schema-v1.json`.
Este documento é a referência em prosa.

## Broker

| Ambiente    | Host          | Porta     | TLS  |
|-------------|---------------|-----------|------|
| Local (dev) | localhost     | 1883      | não  |
| Produção    | emqx.gruahub  | 8883      | sim  |

## Estrutura de Tópicos

```
gruahub/{tenantId}/machines/{machineId}/telemetry/heartbeat
gruahub/{tenantId}/machines/{machineId}/telemetry/play_started
gruahub/{tenantId}/machines/{machineId}/telemetry/play_completed
gruahub/{tenantId}/machines/{machineId}/telemetry/error_report
gruahub/{tenantId}/machines/{machineId}/commands/grant_credit
gruahub/{tenantId}/machines/{machineId}/commands/ack
```

**Convenção:**
- Tópicos `telemetry/*` → publicados pelo dispositivo, consumidos pelo backend
- Tópicos `commands/*` → publicados pelo backend, consumidos pelo dispositivo

## Envelope Padrão

Todo payload segue o envelope:

```json
{
  "v": 1,
  "ts": "2026-07-16T12:00:00Z",
  "machineId": "uuid-da-maquina",
  "tenantId":  "uuid-do-tenant",
  "type":      "heartbeat",
  "payload":   { ... }
}
```

| Campo      | Tipo     | Descrição                                 |
|------------|----------|-------------------------------------------|
| `v`        | integer  | Versão do protocolo (atualmente 1)        |
| `ts`       | ISO 8601 | Timestamp UTC do dispositivo              |
| `machineId`| UUID     | ID da máquina (deve pertencer ao tenant)  |
| `tenantId` | UUID     | Tenant do dispositivo                     |
| `type`     | string   | Tipo da mensagem (ver abaixo)             |
| `payload`  | object   | Payload específico do tipo                |

## Tipos de Mensagem

### `heartbeat`

Publicado pelo dispositivo a cada `HEARTBEAT_INTERVAL_MS` (padrão: 30 s).

```json
{
  "online": true,
  "uptimeSeconds": 3600,
  "firmwareVersion": "1.2.3",
  "coinBoxFull": false,
  "motorFault": false,
  "prizeDetected": true,
  "prizeLevelPct": 65,
  "signalStrength": -72
}
```

O backend atualiza `machine_reported_state` e marca a máquina como ACTIVE.
Se nenhum heartbeat for recebido em `HEARTBEAT_TIMEOUT_SECONDS` (padrão: 90 s),
o `HeartbeatTimeoutScheduler` marca a máquina como OFFLINE e cria um alerta.

### `play_started`

Publicado quando o jogador insere crédito e inicia uma jogada.

```json
{
  "playId":          "uuid-local",
  "amountPaidCents": 200,
  "currency":        "BRL",
  "paymentMethod":   "CREDIT_SANDBOX"
}
```

### `play_completed`

Publicado quando a garra pousa (fim da jogada).

```json
{
  "playId":   "uuid-local",
  "outcome":  "WIN",
  "prizeId":  "uuid-do-premio"
}
```

`outcome`: `WIN`, `LOSE`, `TIMEOUT`, `ERROR`

### `error_report`

Falha de hardware/firmware.

```json
{
  "errorCode":    "MOTOR_FAULT",
  "errorMessage": "Motor X não respondeu",
  "severity":     "HIGH"
}
```

O backend cria automaticamente um `alert` e possivelmente um `maintenance_ticket`.

### `grant_credit` (comando backend → dispositivo)

```json
{
  "commandId":       "uuid-do-comando",
  "credits":         1,
  "paymentTransactionId": "uuid-da-transacao"
}
```

O dispositivo executa o crédito e responde com `command_ack`.

### `command_ack`

```json
{
  "commandId": "uuid-do-comando",
  "status":    "EXECUTED",
  "message":   null
}
```

`status`: `EXECUTED`, `REJECTED`, `TIMEOUT`

## QoS

| Direção               | QoS | Justificativa                              |
|-----------------------|-----|--------------------------------------------|
| heartbeat             | 0   | Tolerante à perda; próximo heartbeat corrige|
| play_started          | 1   | Ao menos uma entrega; idempotente pelo playId|
| play_completed        | 1   | Ao menos uma entrega; idempotente pelo playId|
| error_report          | 1   | Ao menos uma entrega                       |
| grant_credit (cmd)    | 1   | Ao menos uma entrega; dispositivo verifica commandId|
| command_ack           | 1   | Ao menos uma entrega                       |

## ACL (Produção)

```
# Backend
allow gruahub/+/machines/+/# subscribe
allow gruahub/+/machines/+/commands/# publish

# Dispositivo (por machineId)
allow gruahub/{tenantId}/machines/{machineId}/telemetry/# publish
allow gruahub/{tenantId}/machines/{machineId}/commands/# subscribe
deny #
```

Modo local (dev): sem ACL (`emqx_acl.conf` com `{allow, all, all, [\"#\"]}`).
