# Adaptador Fino v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um adaptador físico mínimo (pulse-first) alinhado ao MQTT `v1/...` do GruaHub, validável em bancada e pronto para piloto de 3–10 máquinas, sem PCB all-in-one.

**Architecture:** Device fino (ESP32 DevKit + harness) só executa `GRANT_CREDIT` e reporta; negócio permanece no monólito Quarkus + EMQX. Firmware espelha o `machine-simulator`. PCB custom fica fora do v0.

**Tech Stack:** ESP32 (C3/WROOM) + PlatformIO ou ESP-IDF; MQTT QoS1; NVS; contrato `contracts/mqtt/*`; backend já existente (`GenericMqttAdapter`).

**Spec:** `docs/superpowers/specs/2026-07-27-adaptador-fino-v0-design.md`

## Global Constraints

- Gitflow: trabalho em `feature/*` a partir de `develop`; PR → `develop` (nunca direto em `main`/`master`).
- Sem comentários no código; nomes e estrutura devem bastar.
- Sem menções a ferramentas de IA em commits, PRs, docs ou código.
- Fonte da verdade MQTT: `contracts/mqtt/schema-v1.json` + `broker-policy-v1.json` + `GenericMqttAdapter` (não o prefixo legado de `MQTT_CONTRACT.md` até ele ser corrigido).
- Device não decide preço, promoção, estoque ou tenant.
- BOM do piloto sem display, USB host ou multi-I/O “reserva”.

---

## File map (previsto)

| Path | Responsabilidade |
|------|------------------|
| `docs/superpowers/specs/2026-07-27-adaptador-fino-v0-design.md` | Spec (já criada) |
| `docs/HARDWARE_ADAPTER.md` | Guia operacional curto (BOM, pinout, instalação 15 min) |
| `docs/MQTT_CONTRACT.md` | Alinhar prefixo/tópicos ao contrato real |
| `firmware/adaptador-fino/` | Firmware Pulse Adapter v0 |
| `firmware/adaptador-fino/README.md` | Build, flash, NVS, testes de bancada |
| `scripts/provision-adaptador-nvs.sh` (ou equivalente) | Grava credenciais/IDs no device |
| `simulators/machine-simulator/` | Manter como oráculo de comportamento; só mudar se contrato exigir |
| `docs/TASKS.md` / `docs/COMMERCIAL_READINESS.md` | Backlog e roadmap visíveis |

---

## Task 1: Documentação operacional e contrato MQTT alinhado

**Files:**
- Create: `docs/HARDWARE_ADAPTER.md`
- Modify: `docs/MQTT_CONTRACT.md`
- Modify: `docs/TASKS.md`, `docs/COMMERCIAL_READINESS.md` (se ainda não refletirem esta iniciativa)
- Modify: `README.md` (link curto para hardware adapter — 3–5 linhas)

- [x] Escrever `docs/HARDWARE_ADAPTER.md` com: princípios, BOM, pinout harness, fluxo de instalação 15 min, link para spec/plano, fora de escopo.
- [x] Reescrever `docs/MQTT_CONTRACT.md` para tópicos `v1/{tenantId}/machines/{machineId}/...`, envelope real (`messageId`, `schemaVersion`, `occurredAt`, …) e comando no formato `GenericMqttAdapter`.
- [x] Apontar exemplos em `contracts/mqtt/examples/` e política ACL.
- [x] Garantir que README linka o guia de hardware sem expandir escopo de produto.
- [x] Commit: `docs: alinhar contrato MQTT e guia do adaptador fino`

---

## Task 2: Scaffold do firmware Pulse Adapter

**Files:**
- Create: `firmware/adaptador-fino/` (PlatformIO **ou** ESP-IDF — escolher um e documentar a escolha no README do firmware)
- Create: `firmware/adaptador-fino/README.md`

- [x] Criar projeto com Wi‑Fi + MQTT client + NVS stubs.
- [x] Definir GPIO default de `CREDIT_OUT` e opcional `PLAY_IN` via `sdkconfig`/build flags/`platformio.ini`.
- [x] Implementar conexão MQTT com `clientId=machine-{machineId}`, subscribe em `.../commands`.
- [x] Publicar heartbeat no formato envelope do simulador (`type`/`payload` compatível com backend).
- [x] Sem comentários no código-fonte.
- [x] Commit: `feat: scaffold firmware do adaptador fino pulse`

---

## Task 3: Execução idempotente de GRANT_CREDIT

**Files:**
- Modify: fontes em `firmware/adaptador-fino/`
- Test: bancada com LED no lugar do relé; opcionalmente EMQX local + backend demo

- [x] Parsear comando `GRANT_CREDIT` (envelope Generic **e** payload flat do exemplo JSON — aceitar o que o backend realmente publica; espelhar parser do simulador).
- [x] Respeitar `ttlSeconds`.
- [x] Idempotência por `commandId` (NVS ou RAM com persistência mínima).
- [x] Gerar `playsGranted` pulsos (`pulseMs` / `pulseGapMs` configuráveis).
- [x] Publicar `command_ack` em `.../command-acks` com `commandType`, `creditGrantId`, `success`.
- [ ] Teste manual: publicar comando no EMQX → N pulsos → ACK (requer hardware; checklist pronto).
- [x] Commit: `feat: grant credit idempotente no adaptador fino`

---

## Task 4: Paridade mínima com o simulador (eventos e erros)

**Files:**
- Modify: `firmware/adaptador-fino/`
- Reference: `simulators/machine-simulator/src/index.ts`

- [x] Se `PLAY_IN` configurado: emitir `play_started` / `play_completed` (ou tipos que o backend já normaliza — validar em `MqttMessageProcessor`).
- [x] Se não houver `PLAY_IN`: documentar modo ACK-only; não inventar jogadas falsas.
- [x] `error_report` em falha de config/atuador.
- [x] `firmwareVersion` estável no heartbeat (semver `0.1.0-pulse`).
- [x] Commit: `feat: telemetria e erros no adaptador fino`

---

## Task 5: Provisionamento de lab

**Files:**
- Create: `scripts/provision-adaptador-nvs.sh` (ou ferramenta serial documentada)
- Modify: `firmware/adaptador-fino/README.md`

- [x] Script/procedimento que grava `tenantId`, `machineId`, Wi‑Fi, MQTT user/pass, timings de pulso.
- [x] Checklist: criar controller/machine no dashboard → flash → NVS → ONLINE.
- [x] Credenciais de exemplo só para lab; nunca commit de segredos reais.
- [x] Commit: `feat: provisionamento NVS do adaptador fino`

---

## Task 6: Harness e validação em bancada (pulse)

**Files:**
- Modify: `docs/HARDWARE_ADAPTER.md` (fotos/esquema ASCII do cabo, tabela por fabricante genérico)
- Optional: `docs/PILOT_CHECKLIST.md` (itens de hardware)

- [ ] Montar DevKit + opto/relé + LED de prova (campo / lab físico).
- [ ] Medir largura de pulso; ajustar defaults.
- [ ] Rodar fluxo E2E: sandbox Pix (ou payment simulator) → outbox → MQTT → pulso → ACK → UI ONLINE/crédito.
- [x] Registrar no checklist: idempotência, timeout TTL, reconexão Wi‑Fi.
- [x] Commit: `docs: checklist de bancada do adaptador fino`

---

## Task 7: Piloto — escolher 1 protocolo/frota e fechar gap de pagamento

**Files:**
- Modify: `docs/COMMERCIAL_READINESS.md`, `docs/TASKS.md`
- Possibly: `backend/.../EletekControllerAdapter.java` (só se o piloto for vendor, não pulse)

- [ ] Decidir frota-alvo do primeiro piloto (pulse genérico vs 1 vendor).
- [ ] Se pulse: validar 1 modelo de máquina real com harness dedicado.
- [ ] Se vendor: implementar adaptador real além do stub (task separada / PR separada se grande).
- [ ] Ativar 1 adquirente Pix real em tenant piloto (trabalho paralelo de payments — PR própria se necessário).
- [ ] Critérios de aceite da spec §12 marcados.
- [ ] Commit(s) focados; PR → `develop` com summary + test plan.

---

## Task 8: Abrir PR (gitflow)

- [ ] `git push -u origin HEAD`
- [ ] `gh pr create` base `develop`, sem menções a IA, com:
  - Summary: spec + plano + docs MQTT/hardware (+ firmware se já nesta branch)
  - Test plan: checklist bancada / simulador / aceite piloto
- [ ] Apagar branch local/remota após merge (quando o usuário pedir merge)

---

## Backlog priorizado (visão produto)

### P0 — bloqueia fruto comercial

| ID | Item |
|----|------|
| H-P0-1 | Spec + guia hardware (esta iniciativa) |
| H-P0-2 | Firmware Pulse + GRANT_CREDIT idempotente |
| H-P0-3 | Provisionamento NVS lab |
| H-P0-4 | E2E bancada com EMQX + backend |
| H-P0-5 | 1 adquirente Pix real (PR payments) |
| H-P0-6 | Piloto 3–10 máquinas com harness |

### P1 — escala portável

| ID | Item |
|----|------|
| H-P1-1 | Cabos harness por fabricante (SKU de cabo, não de PCB) |
| H-P1-2 | Vendor adapter (Eletek ou Sega) com protocolo real |
| H-P1-3 | Provisionamento QR + mobile bind |
| H-P1-4 | TLS MQTT + ACL por device em produção |
| H-P1-5 | Dashboard “crédito concedido / mismatch” operacional |

### P2 — só com ROI

| ID | Item |
|----|------|
| H-P2-1 | PCB própria do HMV (ainda fina) |
| H-P2-2 | OTA |
| H-P2-3 | 4G externo documentado |
| H-P2-4 | Sensor de ciclo / prêmio padronizado |

### Explicitamente rejeitado (anti-PagPlush)

- Display na placa GruaHub
- USB host “para tudo”
- All-in-one com fonte + multi-relé + dezenas de optos
- Lógica de preço no firmware
- Bornes de parafuso como interface principal de instalação

---

## Ordem de execução sugerida

```
Task 1 (docs) → Task 2–4 (firmware) → Task 5 (NVS) → Task 6 (bancada) → Task 7 (piloto) → Task 8 (PR)
```

Payments real (H-P0-5) pode correr em `feature/pagamento-pix-real` em paralelo após Task 1.

---

## Definition of Done (branch desta iniciativa)

- Spec e plano versionados.
- `MQTT_CONTRACT.md` alinhado a `v1/...`.
- `HARDWARE_ADAPTER.md` utilizável por técnico de campo.
- TASKS + COMMERCIAL_READINESS refletem P0/P1 hardware.
- Firmware Pulse com heartbeat + GRANT_CREDIT + ACK (se incluído nesta PR) ou issues/tasks claras se firmware for PR seguinte.
- PR para `develop` sem rastros de IA.
