# GruaHub — Diagnóstico Executivo

**Data:** 27 de julho de 2026  
**Referência git:** master/develop @ 43493c7 (release Adaptador Fino v0)  
**Audiência:** sócios / direção  
**Objetivo:** visão única do que temos, o que falta, o que não precisamos, hardware, integrações e próximos passos.

---

## 1. Sumário executivo

O **GruaHub** é uma plataforma **B2B multi-tenant** para operadores de máquinas de pelúcia/gruas: frota, pagamento → crédito → jogada, conciliação, estoque, visitas de campo, finanças e portal do parceiro.

**Tese de produto:** o **sistema** (cloud) é o centro operacional; o hardware é um **Adaptador Fino** substituível (ESP32 + harness), não uma “caixa preta” all-in-one que amarra o cliente (modelo PagPlush).

**Estado atual (jul/2026):**
- Software MVP demonstrável E2E com simuladores (pagamento + máquina).
- Firmware Pulse Adapter v0.1.0 compilando (`firmware/adaptador-fino/`).
- Integrado em `develop` e `master` via gitflow (PRs #81 e #82).
- Falta: bancada física, piloto 3–10 máquinas, Pix real, DNS/TLS público, billing do GitHub Actions.

---

## 2. Posicionamento vs PagPlush

| | PagPlush | GruaHub |
|--|----------|---------|
| Onde mora a operação | Na placa proprietária | No cloud / SaaS |
| Hardware | All-in-one (ESP32 + fonte + relé + optos + display + USB + bornes) | DevKit + 1 canal crédito + harness |
| Lock-in | Hardware + operação + fornecedor | Contrato SaaS; adaptador trocável |
| Troca em campo | Troca o cérebro | Desplug harness → outro DevKit |
| Escala | SKU complexo e caro | SKU fino + cabos por fabricante |

**Não copiar PagPlush.** Complexidade na placa aumenta custo, suporte e aprisionamento — sem necessidade para o problema de negócio (crédito confiável + telemetria + operação de frota).

---

## 3. O que TEMOS (ativos)

### 3.1 Software
- Backend Quarkus 3.8 / Java 21 (monólito modular)
- Web Next.js 14 (ops + PWA jogador + portal parceiro)
- Mobile Expo (operador offline-first)
- Keycloak 24 (OIDC multi-tenant)
- EMQX (MQTT), PostgreSQL, MinIO
- Simuladores: máquina + pagamento
- Contratos MQTT (`v1/...`) + OpenAPI versionados
- Fluxos: frota, IoT, pagamentos sandbox, jogadas, conciliação, estoque, visitas, sangria, comissão, alertas, anexos, push Expo

### 3.2 Hardware (software/firmware)
- Spec Adaptador Fino v0
- Firmware Pulse (heartbeat, GRANT_CREDIT idempotente, ACK, PLAY_IN opcional)
- Script de provisionamento NVS + checklist de bancada
- Build verificado: `pio run -e esp32dev` SUCCESS

### 3.3 Operação / engenharia
- Docker Compose + profiles prod-like / tls / backup / monitoring
- `./scripts/ci-local.sh` (contracts + simulators + firmware) — útil com Actions bloqueado por billing
- Gitflow: feature → develop → release → master

---

## 4. O que NÃO precisamos (agora)

- PCB all-in-one com display, USB host, multi-relé, dezenas de optos
- Lógica de preço/promoção/estoque no firmware
- Bornes de parafuso como interface principal de instalação
- Microsserviços / Kubernetes / Kafka (antes de evidência de escala)
- Carteira digital B2C, NF-e SEFAZ, IA/ML preditivo (comercial longo)
- Fabricar PCB própria no piloto (DevKit basta)

---

## 5. O que FALTA (honestidade)

### P0 — bloqueia fruto comercial
1. Bancada E2E com ESP32 físico + LED/relé
2. 1 adquirente Pix real (ex.: Mercado Pago) em tenant piloto
3. Piloto 3–10 máquinas com harness
4. DNS + TLS público (Let's Encrypt) em host real
5. Regular billing GitHub Actions (ou continuar só com `ci-local.sh`)

### P1 — portabilidade / escala
- Cabos harness por fabricante
- Vendor adapter (Eletek/Sega) com protocolo real
- Provisionamento QR + bind mobile
- TLS MQTT + ACL por device
- Dashboard crédito/mismatch operacional
- E-mail/SMS; WAF comercial; Vault/SM; PITR

---

## 6. Hardware — o que comprar e como usar

### BOM piloto
| Item | Função | Nota |
|------|--------|------|
| ESP32-WROOM DevKit **ou** ESP32-C3 DevKit | MCU + Wi-Fi | Preferir o que tiver em mãos; firmware tem envs `esp32dev` e `esp32c3` |
| Módulo relé 5 V **ou** opto PC817 + transistor | Pulso de crédito | Opto se entrada lógica; relé se isolamento mecânico |
| Conector JST-XH / Molex 2–4 vias + cabo | Harness | Um cabo por modelo de grua |
| Fonte 5 V ≥ 1 A | Alimentação | Buck 12→5 externo se a máquina só tiver 12 V |
| LED | Prova de pulso | Onboard do DevKit ok |

**GPIO padrão:** CREDIT_OUT = GPIO 26; PLAY_IN = desligado (−1) até haver sensor.

### Pinout harness
1 GND · 2 CREDIT_OUT · 3 PLAY_IN (opc.) · 4 +5V (opc.)

### Instalação ≤ 15 min
1. Criar machine/controller no dashboard  
2. Flash + NVS (`scripts/provision-adaptador-nvs.sh`)  
3. Plug harness  
4. Heartbeat → ONLINE  
5. Crédito teste → pulso → ACK  

---

## 7. Integrações

| Integração | Estado | Próximo passo |
|------------|--------|---------------|
| MQTT EMQX contrato `v1/` | Pronto (sim + firmware) | ACL/TLS em produção |
| Pix sandbox | Pronto | Contratar adquirente real |
| Mercado Pago (código parcial) | Stub/parcial | Token + tenant piloto |
| Eletek / Sega adapters | Stubs Java | Protocolo real após pulse |
| Expo Push | Pronto (caminho Expo) | Opcional FCM Google |
| MinIO/S3 anexos | Pronto | Bucket produção |
| Keycloak OIDC | Pronto | Realm sem usuários demo no piloto |

Fluxo canônico: Jogador/Pix → Backend → Outbox GRANT_CREDIT → MQTT → Adaptador → pulso → CREDIT_RECEIVED → conciliação.

---

## 8. Instruções rápidas do sistema

### Subir demo local
```bash
cp infra/.env.example infra/.env
cd infra && ./run.sh up
# backend: cd backend && ./mvnw quarkus:dev
# web: cd web && npm i && npm run dev
# simuladores: machine-simulator + payment-simulator
```

### Firmware
```bash
cd firmware/adaptador-fino
pio run -e esp32dev
pio run -t upload
# provisionar NVS via Serial ou scripts/provision-adaptador-nvs.sh
```

### Validação sem GitHub Actions
```bash
./scripts/ci-local.sh
# opcional: CI_LOCAL_JOBS=all ./scripts/ci-local.sh
```

Docs-chave: `README.md`, `docs/HARDWARE_ADAPTER.md`, `docs/MQTT_CONTRACT.md`, `docs/DEPLOYMENT.md`, `docs/COMMERCIAL_READINESS.md`, `docs/PILOT_CHECKLIST.md`.

---

## 9. Arquitetura (visão)

Clientes (Web / Mobile / PWA) → Keycloak → Quarkus API  
Devices / Simulador → EMQX MQTT → Quarkus IoT  
Quarkus → PostgreSQL + MinIO + Outbox → comandos MQTT  

Domínios: fleet, iot, payments, plays, reconciliation, inventory, fieldops, finance, routing, maintenance, alerts, audit, reports.

---

## 10. Roadmap sugerido (sócios)

| Quando | Ação | Dono típico |
|--------|------|-------------|
| Semana 1 | Comprar 2–3 DevKits + relés; montar bancada | Sócio técnico / ops |
| Semana 1–2 | Fechar contrato Pix (Mercado Pago ou similar) | Sócio comercial |
| Semana 2–3 | E2E bancada + 1 máquina real | Técnico |
| Semana 3–6 | Piloto 3–10 máquinas; feedback | Ambos |
| Paralelo | DNS + HTTPS público; segredos produção | Técnico |
| Depois | Vendor adapter se frota exigir | Técnico + fabricante |
| Evitar | PCB monstro / feature creep no device | Ambos |

---

## 11. Diagnóstico de riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Sem hardware em campo | Alta (receita) | Bancada + piloto já especificados |
| Sem Pix real | Alta | Priorizar 1 adquirente |
| CI Actions bloqueado (billing) | Média | `ci-local.sh`; retomar Actions quando possível |
| Tentação de copiar PagPlush | Alta (estratégia) | Spec anti all-in-one; gate de design |
| Wi-Fi ruim no ponto | Média | Antena/posição; 4G só depois |
| develop/master sem green CI | Média | Aceito temporariamente; validar local |

---

## 12. Conclusão

Temos uma **base de software sólida e uma tese de hardware correta**. O caminho para “dar frutos” não é mais placa — é **ligar o elo físico mínimo + Pix real + piloto**, mantendo o sistema no centro.

Este documento deve ser atualizado após cada marco (bancada OK, primeiro piloto, primeiro Pix real).
