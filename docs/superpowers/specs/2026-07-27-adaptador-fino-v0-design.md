# GruaHub — Design: Adaptador Fino v0

**Data:** 2026-07-27  
**Status:** aprovado (decisão de produto pós-análise PagPlush)  
**Escopo:** especificação de hardware mínimo + firmware fino + backlog de piloto  
**Fora de escopo nesta rodada:** PCB própria em volume, display, USB host, OTA, lógica de preço/promoção no device

---

## 1. Contexto e objetivo

A PagPlush concentra operação numa PCB all-in-one (ESP32 + fonte + relé + optos + display + USB + bornes). Isso eleva custo, dificulta troca em campo e amarra o cliente ao hardware e à operação do fornecedor.

O GruaHub já centraliza negócio na nuvem (crédito, conciliação, frota, field ops) e trata a máquina como cliente MQTT. O simulador prova o fluxo. Falta o elo físico **mínimo, portável e substituível**.

**Objetivo do Adaptador Fino v0:** um device que só executa e reporta — nunca decide negócio.

**Critério de sucesso do piloto:** pagamento Pix (ou sandbox em lab) → `GRANT_CREDIT` → pulso/crédito na máquina física → `command_ack` + eventos de jogada → conciliação no backend, com instalação ≤ 15 minutos e troca de adaptador sem rewiring da grua.

---

## 2. Princípios (não negociáveis)

1. **Sistema no centro** — preço, crédito, tenant, conciliação e políticas vivem no backend.
2. **Device fino** — MQTT in/out + um atuador de crédito + telemetria mínima.
3. **Portável** — harness com conector plugável; sem bornes permanentes como interface principal.
4. **Escalável** — SKU único pulse-first; vendor adapters como plug-ins de firmware/protocolo, não novas “caixas monstro”.
5. **Substituível** — field-swap em minutos; identidade no cloud (`controller` + credenciais MQTT).
6. **Não copiar PagPlush** — sem display, USB host, multi-I/O “por precaução” no HMV.

---

## 3. Decisões fechadas

| Tema | Escolha |
|------|---------|
| Forma do v0 | Módulo comercial (ESP32 DevKit / ESP32-C3) + harness, **sem PCB custom** |
| Modo piloto | **Pulse Adapter** (contato seco / opto para entrada de crédito da máquina) |
| Modo seguinte | **Vendor Adapter** (UART/TTL Eletek ou equivalente da frota-alvo) |
| Protocolo | Contrato MQTT real do repo: prefixo `v1/...` + envelope do `GenericMqttAdapter` / `schema-v1.json` |
| Broker | EMQX; TLS obrigatório em piloto público; user/pass por device |
| Relé | 1 canal suficiente no v0 (crédito); 2º canal só se a frota-alvo exigir |
| Alimentação | 5 V USB do DevKit em lab; no campo, buck 12 V→5 V **externo** ou cabo da máquina — fora da “placa monstro” |
| Firmware stack | ESP-IDF ou PlatformIO (Arduino-ESP32) — escolher na Task 1 do plano; critério: MQTT QoS1 estável + NVS |
| OTA | Fora do v0; flash serial + `firmwareVersion` no heartbeat |
| Pagamento no device | Proibido |
| Identidade | `tenantId` + `machineId` + `controllerId` provisionados; clientId MQTT `machine-{machineId}` |

---

## 4. Arquitetura

```
Jogador / Pix  →  Backend GruaHub  →  EMQX  →  Adaptador Fino
                      ↑                              │
                      └──── ack / telemetry / events ┘
                                                     │
                                              Pulse / Vendor I/O
                                                     │
                                              Placa da grua
```

| Camada | Responsabilidade |
|--------|------------------|
| Cloud | Pagamento, `CreditGrant`, outbox `GRANT_CREDIT`, conciliação, frota |
| Adaptador | Assina `commands`, aplica crédito, ACK, heartbeat, eventos de jogada se houver sinal |
| Máquina | Mecânica da grua; entrada de crédito já existente do fabricante |

O adaptador **não** substitui a placa da grua. Só injeta crédito e reporta estado.

---

## 5. Contrato MQTT (fonte da verdade)

Documentos canônicos (código/CI):

- `contracts/mqtt/schema-v1.json`
- `contracts/mqtt/broker-policy-v1.json`
- `contracts/mqtt/examples/`
- Implementação outbound: `GenericMqttAdapter`
- Comportamento de referência: `simulators/machine-simulator/`

### Tópicos

| Direção | Tópico |
|---------|--------|
| Backend → device | `v1/{tenantId}/machines/{machineId}/commands` |
| Device → backend | `v1/{tenantId}/machines/{machineId}/telemetry` |
| Device → backend | `v1/{tenantId}/machines/{machineId}/events` |
| Device → backend | `v1/{tenantId}/machines/{machineId}/status` |
| Device → backend | `v1/{tenantId}/machines/{machineId}/command-acks` |

> `docs/MQTT_CONTRACT.md` ainda cita prefixo legado `gruahub/...`. O firmware e o piloto **devem** seguir `v1/...`. Corrigir o doc em tarefa do plano.

### Comando `GRANT_CREDIT` (formato GenericMqttAdapter)

Envelope com `type: "GRANT_CREDIT"` e `payload`:

| Campo | Tipo | Uso no adaptador |
|-------|------|------------------|
| `commandId` | UUID | Idempotência; ACK |
| `creditGrantId` | UUID | Correlação |
| `playsGranted` | int ≥ 1 | Nº de pulsos / créditos |
| `amountCents` | int | Log local opcional; não decide preço |
| `ttlSeconds` | 1–300 | Descarta comando expirado |

### Respostas obrigatórias no v0

| Tipo | Quando | QoS |
|------|--------|-----|
| `command_ack` | Após tentar executar (success true/false) | 1 |
| `heartbeat` | A cada 30 s (configurável) | 0 |
| `play_started` / `play_completed` | Se houver sinal de ciclo; senão opcional no pulse-only | 1 |
| `error_report` | Falha de atuador / config / motor se sensor existir | 1 |

Idempotência: mesmo `commandId` não gera segundo pulso; reenvia ACK anterior se necessário.

---

## 6. Hardware — BOM alvo (Pulse Adapter)

Custo-alvo de lab: o mais baixo possível com peças de prateleira.

| Item | Função | Notas |
|------|--------|-------|
| ESP32-C3 ou ESP32-WROOM DevKit | MCU + Wi‑Fi | Preferir C3 se antena/espaço ok |
| Módulo relé 5 V **ou** opto PC817 + transistor | Contato seco para crédito | Opto preferível se a entrada da máquina for lógica; relé se exigir isolamento mecânico |
| Conector JST-XH / Molex Micro-Fit 2–4 vias | Harness máquina ↔ adaptador | Padronizar pinout abaixo |
| Cabo harness por fabricante | Adapta pino a pino sem bornes | Um SKU de cabo por modelo de grua |
| Fonte 5 V ≥ 1 A | Lab / campo | Buck 12→5 separado se necessário |
| LED status (onboard ok) | Online / crédito / erro | Sem display |

### Pinout lógico do harness (v0)

| Pino | Nome | Direção | Descrição |
|------|------|---------|-----------|
| 1 | `GND` | — | Comum |
| 2 | `CREDIT_OUT` | Adaptador → máquina | Pulso / contato seco |
| 3 | `PLAY_IN` (opc.) | Máquina → adaptador | Início/fim de ciclo se disponível |
| 4 | `+5V` (opc.) | Máquina → adaptador | Só se a máquina fornecer 5 V limpo |

Sem `PLAY_IN`, o adaptador ainda completa o fluxo financeiro via ACK; conciliação de “jogada física” fica limitada — aceitável no primeiro piloto pulse-only, documentado.

### Explicitamente fora do HMV

- Display I2C/SPI
- USB-A host
- Multi-relé “reserva”
- Bornes de parafuso como interface principal
- Buzzer dedicado (LED basta)
- Fonte industrial completa soldada na mesma PCB lógica

---

## 7. Firmware — comportamento

### Boot

1. Lê NVS: `tenantId`, `machineId`, `wifi`, `mqtt` (host, user, pass), `pulseMs`, `pulseGapMs`, `adapterMode=PULSE|VENDOR`.
2. Conecta Wi‑Fi → MQTT com `clientId=machine-{machineId}`, `clean=false`.
3. Subscribe QoS1 em `.../commands`.
4. Publica heartbeat imediato.

### `GRANT_CREDIT`

1. Valida envelope + TTL.
2. Se `commandId` já executado → ACK success (idempotente).
3. Para `i in 1..playsGranted`: pulso `pulseMs` (default 100 ms), gap `pulseGapMs` (default 200 ms).
4. ACK `success=true` com `commandType=GRANT_CREDIT`, `creditGrantId`.
5. Em falha de GPIO/config → ACK `success=false` + `failureReason` + opcional `error_report`.

### Heartbeat (mínimo)

`online`, `uptimeSeconds`, `firmwareVersion`, `creditsAvailable` (créditos locais pendentes se houver), `motorFault`/`doorOpen` se sensores existirem (senão omitir ou false).

### Segurança

- Credenciais só em NVS; sem hardcode de produção.
- Device não assina tópicos de outras máquinas (ACL EMQX).
- TLS no piloto público.
- Sem servidor HTTP de admin aberto na LAN no v0 (provisionamento via serial/USB no lab; app de provisionamento = fase seguinte).

---

## 8. Provisionamento (piloto)

Fluxo lab/piloto v0:

1. Operador cria/associa `controller` + `machine` no GruaHub.
2. Gera credencial MQTT (user/pass ou token) scoped à máquina.
3. Flash firmware + grava NVS via script `idf.py` / PlatformIO / ferramenta serial.
4. Power-on → heartbeat → máquina ONLINE no dashboard.
5. Teste: sandbox/Pix → crédito → verifica pulso com LED/multímetro → ACK.

Fluxo desejado pós-piloto (não bloqueia v0): QR na carcaça → app mobile bind → NVS via BLE/softAP efêmero.

---

## 9. Posicionamento vs PagPlush

| | PagPlush | GruaHub Adaptador Fino |
|--|----------|------------------------|
| Onde mora a operação | Na caixa | No sistema cloud |
| Troca de hardware | Troca o cérebro | Troca o adaptador |
| Display / USB / multi-I/O | Embarcado | Fora do HMV |
| Lock-in | Hardware + operação | Contrato SaaS; hardware intercambiável |
| Escala | SKU complexo | SKU fino + cabos por fabricante |

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Entrada de crédito da máquina incompatível | Harness por modelo; medir pulso no lab antes do campo |
| Wi‑Fi ruim no ponto | Heartbeat timeout já existe; documentar antena / posição; 4G só se piloto exigir (dongle externo, não na PCB) |
| Sem sinal de fim de jogada | Aceitar ACK-only no v0; sensor depois |
| Tentação de “só mais um componente” | Gate de design: qualquer add-on vira issue separada e justifica ROI |
| Doc MQTT desatualizado | Tarefa explícita no plano |

---

## 11. Entregáveis desta iniciativa

1. Este design (spec).
2. Plano/backlog em `docs/superpowers/plans/2026-07-27-adaptador-fino-v0.md`.
3. Atualização de `docs/TASKS.md` e `docs/COMMERCIAL_READINESS.md`.
4. (Implementação posterior) pasta `firmware/adaptador-fino/` + harness docs + 1 fabricante pulse validado.

---

## 12. Critérios de aceite do piloto

- [ ] Instalação com harness ≤ 15 min em máquina real (ou bancada com entrada de crédito real).
- [ ] Heartbeat → ONLINE no dashboard.
- [ ] `GRANT_CREDIT` → N pulsos → ACK success → crédito jogável.
- [ ] Idempotência de `commandId` verificada.
- [ ] Troca de adaptador (mesmo harness) restaura operação após reflash/NVS.
- [ ] Nenhum display/USB host/PCB monstro no BOM do piloto.
