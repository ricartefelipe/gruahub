# GruaHub — Contrato MQTT v1

O contrato completo em JSON Schema está em `contracts/mqtt/schema-v1.json`.
A política de tópicos e ACL está em `contracts/mqtt/broker-policy-v1.json`.
Exemplos validados pelo CI: `contracts/mqtt/examples/`.
Comportamento de referência do device: `simulators/machine-simulator/`.

## Broker

| Ambiente | Host | Porta | TLS |
|----------|------|-------|-----|
| Local (dev) | localhost | 1883 | não |
| Produção / piloto público | broker do tenant | 8883 | sim |

Autenticação: username/password por cliente MQTT. Em produção, ACL por `machineId`.

## Estrutura de tópicos

Prefixo canônico: **`v1/`** (não usar o prefixo legado `gruahub/`).

```
v1/{tenantId}/machines/{machineId}/commands          ← backend → device
v1/{tenantId}/machines/{machineId}/telemetry         ← device → backend
v1/{tenantId}/machines/{machineId}/events            ← device → backend
v1/{tenantId}/machines/{machineId}/status            ← device → backend
v1/{tenantId}/machines/{machineId}/command-acks      ← device → backend
```

| Sufixo | Quem publica | Conteúdo típico |
|--------|--------------|-----------------|
| `commands` | Backend | `GRANT_CREDIT`, `REBOOT`, `LOCK`, `UNLOCK`, `UPDATE_CONFIG` |
| `telemetry` | Device | `heartbeat` |
| `events` | Device | início/fim de jogada |
| `status` | Device | mudanças de estado |
| `command-acks` | Device | ACK de comando |

`clientId` do device: padrão `machine-{machineId}` (ver `broker-policy-v1.json`).

## Envelope padrão (device → backend)

```json
{
  "messageId": "uuid",
  "schemaVersion": 1,
  "tenantId": "uuid",
  "machineId": "uuid",
  "sequence": 1,
  "type": "heartbeat",
  "occurredAt": "2026-07-27T12:00:00.000Z",
  "payload": { }
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `messageId` | UUID | Id da mensagem |
| `schemaVersion` | int | Sempre `1` |
| `tenantId` | UUID | Tenant do device |
| `machineId` | UUID | Máquina associada |
| `sequence` | int ≥ 0 | Sequência monotônica do device |
| `type` | string | Tipo da mensagem |
| `occurredAt` | ISO 8601 | Timestamp UTC |
| `payload` | object | Corpo específico do tipo |
| `controllerId` | string | Opcional; usado pelo simulador |

## Tipos device → backend

### `heartbeat` (tópico `telemetry`, QoS 0)

```json
{
  "online": true,
  "uptimeSeconds": 3600,
  "firmwareVersion": "0.1.0-pulse",
  "creditsAvailable": 0,
  "doorOpen": false,
  "motorFault": false
}
```

Sem heartbeat em `HEARTBEAT_TIMEOUT_SECONDS` (padrão 90 s), o backend marca a máquina OFFLINE.

### `play_started` / `PLAY_STARTED` (tópico `events`, QoS 1)

Payload mínimo alinhado ao schema: `creditGrantId`, `playSessionId` (quando aplicável).
O backend normaliza aliases via `ControllerAdapter`.

### `play_completed` / `PLAY_COMPLETED` (tópico `events`, QoS 1)

Campos: `playSessionId`, `prizeDelivered`, opcionalmente `creditGrantId`, `durationSeconds`.

### `error_report` (QoS 1)

```json
{
  "errorCode": "MOTOR_FAULT",
  "errorMessage": "opcional",
  "doorOpen": false,
  "motorFault": true
}
```

### `command_ack` (tópico `command-acks`, QoS 1)

```json
{
  "commandId": "uuid",
  "commandType": "GRANT_CREDIT",
  "creditGrantId": "uuid",
  "success": true,
  "failureReason": null
}
```

`commandType`: `GRANT_CREDIT` | `REBOOT` | `LOCK` | `UNLOCK` | `UPDATE_CONFIG`.

O simulador também emite formas legacy (`CREDIT_RECEIVED`, `COMMAND_ACK`); o processador inbound normaliza. Firmware novo deve preferir `command_ack` + `success` boolean conforme schema/exemplos.

## Comando backend → device (`GRANT_CREDIT`)

Publicado em `.../commands` pelo `GenericMqttAdapter`:

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "tenantId": "uuid",
  "machineId": "uuid",
  "type": "GRANT_CREDIT",
  "occurredAt": "2026-07-27T12:00:00Z",
  "payload": {
    "commandId": "uuid",
    "creditGrantId": "uuid",
    "playsGranted": 1,
    "amountCents": 200,
    "ttlSeconds": 120
  }
}
```

O device:

1. Ignora se `ttlSeconds` expirou.
2. Trata `commandId` como chave de idempotência.
3. Aplica `playsGranted` créditos/pulsos.
4. Responde em `command-acks`.

Exemplo flat (schema `grant_credit_command`) também existe em `contracts/mqtt/examples/grant_credit_command.json` para validação; o payload **publicado em runtime** é o envelope do adapter acima.

## QoS

| Mensagem | QoS | Nota |
|----------|-----|------|
| heartbeat | 0 | Próximo heartbeat corrige perda |
| events financeiros / jogada | 1 | Idempotência na aplicação |
| error_report | 1 | |
| commands | 1 | |
| command-acks | 1 | |

## ACL (produção)

Conforme `broker-policy-v1.json`:

- Backend: subscribe/publish em `v1/#` (client dedicado).
- Device: subscribe só em `v1/{tenantId}/machines/{machineId}/commands`; publish só nos sufixos da própria máquina.
- Device não publica/subscreve tópicos de outras máquinas.

Dev local: ACL permissiva no Compose (ver `infra/emqx/`).

## Relação com o Adaptador Fino

O adaptador físico é um cliente MQTT igual ao simulador, com GPIO no lugar da simulação de crédito. Não introduz tópicos novos no v0.
