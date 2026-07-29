# GruaHub — Firmware Adaptador Fino (Pulse)

ESP32 + MQTT + pulso de crédito. Stack: **PlatformIO + Arduino framework**.

Versão: `0.1.0-pulse`  
Contrato: `docs/MQTT_CONTRACT.md`

## O que faz

- Conecta Wi‑Fi e MQTT (`clientId=machine-{machineId}`)
- Assina `v1/{tenantId}/machines/{machineId}/commands`
- Heartbeat `HEARTBEAT` a cada 30 s
- `GRANT_CREDIT` → N pulsos em `CREDIT_OUT` → `CREDIT_RECEIVED` (idempotente por `commandId`)
- Opcional: `PLAY_IN` gera `PLAY_STARTED` / `PLAY_COMPLETED` (sem sensor = modo ACK-only; não inventa jogada)
- Provisionamento via Serial USB

## GPIO padrão

| Sinal | GPIO default | Override |
|-------|--------------|----------|
| `CREDIT_OUT` | 26 | `-DCREDIT_OUT_GPIO=N` ou NVS `credit_gpio` |
| `PLAY_IN` | desligado (`-1`) | `-DPLAY_IN_GPIO=N` ou NVS `play_gpio` |

## Build

Com PlatformIO local:

```bash
cd firmware/adaptador-fino
pio run -e esp32dev
pio run -e esp32c3
pio run -t upload -e esp32dev
pio device monitor
```

Com Docker (imagem comunitária; preferir PIO local):

```bash
# Preferido: PlatformIO no host
pio run -e esp32dev
```

Build verificado localmente com PlatformIO 6.x (`esp32dev` SUCCESS).

## Provisionamento Serial

Baud 115200. Comandos:

```
SHOW
SET wifi_ssid=MINHA_REDE
SET wifi_pass=segredo
SET mqtt_host=192.168.1.10
SET mqtt_port=1883
SET mqtt_user=sim-machine
SET mqtt_pass=...
SET tenant_id=11111111-0000-0000-0000-000000000001
SET machine_id=66666666-0000-0000-0000-000000000001
SET pulse_ms=100
SET pulse_gap_ms=200
SAVE
```

Ou uma linha JSON:

```
{"wifi_ssid":"...","wifi_pass":"...","mqtt_host":"...","mqtt_port":1883,"mqtt_user":"sim-machine","mqtt_pass":"...","tenant_id":"...","machine_id":"...","pulse_ms":100,"pulse_gap_ms":200}
SAVE
```

Script auxiliar: `scripts/provision-adaptador-nvs.sh`.

## Teste de bancada

1. LED ou relé no `CREDIT_OUT` (GPIO 26).
2. Subir EMQX + backend (`infra` + Quarkus).
3. Provisionar IDs do seed demo (ou máquina criada no dashboard).
4. Confirmar ONLINE no dashboard após heartbeat.
5. Disparar crédito (sandbox/payment simulator) → pulsos → ACK.
6. Reenviar o mesmo `commandId` → sem segundo pulso.
7. Sem `PLAY_IN`: não esperar eventos de jogada.

Checklist: `docs/HARDWARE_ADAPTER.md` e `docs/PILOT_CHECKLIST.md`.

## Fora de escopo neste firmware

Display, USB host, OTA, lógica de preço, multi-relé, bornes como interface principal.
