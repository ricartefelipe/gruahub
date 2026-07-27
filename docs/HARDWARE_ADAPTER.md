# GruaHub — Adaptador Fino (Hardware)

Guia operacional do hardware mínimo. Spec completa: `docs/superpowers/specs/2026-07-27-adaptador-fino-v0-design.md`. Plano/backlog: `docs/superpowers/plans/2026-07-27-adaptador-fino-v0.md`. Contrato MQTT: `docs/MQTT_CONTRACT.md`.

## Tese

O GruaHub centraliza operação no sistema (cloud). O device só executa crédito e reporta estado. Não competimos com placas all-in-one que amarram o cliente ao hardware do fornecedor.

## O que é o Adaptador Fino v0

| É | Não é |
|---|--------|
| ESP32 DevKit + harness plugável | PCB proprietária densa |
| 1 canal de crédito (pulse/opto/relé) | Display + USB host + multi-I/O |
| Cliente MQTT do contrato `v1/...` | Dono de preço/promoção/estoque |
| Trocável em minutos | Instalação por 12 bornes permanentes |

## Modos

| Modo | Uso | Status |
|------|-----|--------|
| **Pulse** | Contato seco / opto na entrada de crédito da grua | Piloto v0 |
| **Vendor** | UART/TTL do fabricante (ex.: Eletek) | P1 após pulse estável |

## BOM (lab / piloto)

| Item | Função |
|------|--------|
| ESP32-C3 ou ESP32-WROOM DevKit | MCU + Wi‑Fi |
| Módulo relé 5 V **ou** opto PC817 + driver | Saída de crédito |
| Conector JST-XH / Molex 2–4 vias | Harness máquina ↔ adaptador |
| Cabo harness por modelo de grua | Evita bornes como interface principal |
| Fonte 5 V ≥ 1 A (ou buck 12→5 externo) | Alimentação |
| LED (onboard ok) | Status |

Fora do HMV: display, USB-A host, multi-relé reserva, fonte industrial soldada na mesma lógica, buzzer dedicado.

## Pinout do harness

| Pino | Nome | Direção | Descrição |
|------|------|---------|-----------|
| 1 | `GND` | — | Comum |
| 2 | `CREDIT_OUT` | Adaptador → máquina | Pulso / contato seco |
| 3 | `PLAY_IN` | Máquina → adaptador | Opcional (ciclo de jogada) |
| 4 | `+5V` | Máquina → adaptador | Opcional (se 5 V limpo) |

Sem `PLAY_IN`, o fluxo financeiro fecha com `command_ack`; telemetria de jogada fica limitada (aceitável no primeiro piloto).

## Instalação alvo (≤ 15 min)

1. Associar `controller` + `machine` no dashboard GruaHub.
2. Obter credenciais MQTT do device.
3. Flash firmware + gravar NVS (`tenantId`, `machineId`, Wi‑Fi, MQTT, `pulseMs`).
4. Conectar harness (GND + CREDIT_OUT; demais se existirem).
5. Energizar → conferir ONLINE (heartbeat).
6. Testar 1 crédito (sandbox/Pix) → pulso → ACK.

Troca de adaptador: desplug harness → plug no novo DevKit provisionado → ONLINE.

## MQTT (resumo)

- Subscribe: `v1/{tenantId}/machines/{machineId}/commands`
- Publish: `telemetry`, `events`, `status`, `command-acks`
- Comando crítico: `GRANT_CREDIT` com idempotência por `commandId`
- Detalhes: `docs/MQTT_CONTRACT.md` e `contracts/mqtt/`

## Firmware

Pasta: `firmware/adaptador-fino/` (PlatformIO + Arduino).

```bash
cd firmware/adaptador-fino
pio run -e esp32dev
pio run -t upload
# provisionar: scripts/provision-adaptador-nvs.sh /caminho/lab.env
```

Oráculo de comportamento sem hardware: `simulators/machine-simulator/`.

## Esquema do harness (ASCII)

```
 ESP32 DevKit                 Harness 4 vias              Máquina
 ┌──────────┐                ┌────────────┐             ┌────────┐
 │ GPIO26 ──┼── CREDIT_OUT ──┤ 2          ├─────────────┤ crédito│
 │ GND    ──┼── GND ─────────┤ 1          ├─────────────┤ GND    │
 │ GPIOx  ──┼── PLAY_IN ─────┤ 3 (opc.)   ├─────────────┤ ciclo  │
 │ 5V     ──┼── +5V ─────────┤ 4 (opc.)   ├─────────────┤ 5V     │
 └──────────┘                └────────────┘             └────────┘
```

Um SKU de cabo por fabricante; o DevKit permanece genérico.

## Critérios de aceite do piloto

Ver spec §12 e seção Hardware em `docs/PILOT_CHECKLIST.md`.
