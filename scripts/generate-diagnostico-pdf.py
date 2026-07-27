#!/usr/bin/env python3
"""Gera o PDF de diagnóstico executivo do GruaHub."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "diagnostico"
OUT_PDF = OUT_DIR / "GruaHub-Diagnostico-Executivo.pdf"
OUT_MD = OUT_DIR / "GruaHub-Diagnostico-Executivo.md"

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

GIT_REF = "master/develop @ 43493c7 (release Adaptador Fino v0)"
DOC_DATE = "27 de julho de 2026"


class Doc(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "B", 9)
        self.set_text_color(40, 60, 80)
        self.cell(0, 8, "GruaHub — Diagnóstico Executivo", align="L")
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, DOC_DATE, align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Página {self.page_no()}/{{nb}}  ·  Confidencial — uso interno sócios", align="C")

    def callout(self, title: str, text: str, kind: str = "info") -> None:
        colors = {
            "info": (230, 242, 255),
            "warn": (255, 243, 224),
            "good": (232, 245, 233),
            "bad": (255, 235, 238),
        }
        fill = colors.get(kind, colors["info"])
        self.set_x(self.l_margin)
        usable = self.w - self.l_margin - self.r_margin
        self.set_fill_color(*fill)
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(30, 30, 30)
        if self.get_y() > self.h - 40:
            self.add_page()
            self.set_x(self.l_margin)
        self.multi_cell(usable, 6, title, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.set_font("DejaVu", "", 9.5)
        self.multi_cell(usable, 5.2, text, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def bullet(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, f"•  {text}", new_x="LMARGIN", new_y="NEXT")

    def check(self, done: bool, text: str) -> None:
        mark = "[x]" if done else "[ ]"
        self.set_x(self.l_margin)
        self.set_font("DejaVu", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, f"{mark}  {text}", new_x="LMARGIN", new_y="NEXT")

    def mono(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_font("DejaVuMono", "", 8.5)
        self.set_text_color(20, 20, 20)
        self.set_fill_color(245, 247, 250)
        self.multi_cell(0, 4.8, text, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def h1(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_font("DejaVu", "B", 16)
        self.set_text_color(20, 50, 80)
        self.multi_cell(0, 9, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def h2(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_font("DejaVu", "B", 12)
        self.set_text_color(30, 70, 100)
        self.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def h3(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.ln(1)
        self.set_font("DejaVu", "B", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(0.5)

    def table(self, headers: list[str], rows: list[list[str]], col_w: list[float] | None = None) -> None:
        if col_w is None:
            usable = self.w - self.l_margin - self.r_margin
            col_w = [usable / len(headers)] * len(headers)
        line_h = 5.0

        def draw_header() -> None:
            self.set_font("DejaVu", "B", 8.5)
            self.set_fill_color(40, 70, 100)
            self.set_text_color(255, 255, 255)
            for i, h in enumerate(headers):
                self.cell(col_w[i], 7, h, border=1, fill=True)
            self.ln()
            self.set_font("DejaVu", "", 8)
            self.set_text_color(30, 30, 30)

        draw_header()
        fill = False
        for row in rows:
            if self.get_y() > self.h - 28:
                self.add_page()
                draw_header()
            self.set_fill_color(248, 248, 248) if fill else self.set_fill_color(255, 255, 255)
            # Truncate long cells for stable single-line rows
            clipped = []
            for i, cell in enumerate(row):
                max_chars = max(8, int(col_w[i] / 1.7))
                text = cell if len(cell) <= max_chars else cell[: max_chars - 1] + "…"
                clipped.append(text)
            for i, cell in enumerate(clipped):
                self.cell(col_w[i], line_h + 1.5, cell, border=1, fill=fill)
            self.ln()
            fill = not fill
        self.ln(2)


def build_markdown() -> str:
    return f"""# GruaHub — Diagnóstico Executivo

**Data:** {DOC_DATE}  
**Referência git:** {GIT_REF}  
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
"""


def build_pdf() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = Doc(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", FONT_B)
    pdf.add_font("DejaVuMono", "", FONT_M)
    pdf.set_margins(16, 16, 16)

    # Cover
    pdf.add_page()
    pdf.ln(40)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("DejaVu", "B", 28)
    pdf.set_text_color(20, 50, 80)
    pdf.cell(0, 14, "GruaHub", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "B", 16)
    pdf.cell(0, 9, "Diagnóstico Executivo do Projeto", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(
        0,
        6,
        "Visão para sócios: o que temos, o que falta, o que não precisamos,\n"
        "hardware (Adaptador Fino), integrações, instruções e próximos passos.",
        align="C",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(12)
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(0, 6, f"Data: {DOC_DATE}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Referência: {GIT_REF}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "Confidencial — uso interno", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)
    pdf.set_x(pdf.l_margin)
    pdf.callout(
        "Mensagem central",
        "O sistema cloud é o centro operacional. O hardware é um adaptador fino e "
        "substituível — não uma placa all-in-one que amarra o cliente (modelo PagPlush).",
        "good",
    )

    # 1
    pdf.add_page()
    pdf.h1("1. Sumário executivo")
    pdf.body(
        "O GruaHub é uma plataforma B2B multi-tenant para operadores de máquinas de "
        "pelúcia/gruas: frota, pagamento → crédito → jogada, conciliação, estoque, "
        "visitas de campo, finanças e portal do parceiro."
    )
    pdf.h3("Estado em julho/2026")
    pdf.bullet("Software MVP demonstrável ponta a ponta com simuladores.")
    pdf.bullet("Firmware Pulse Adapter 0.1.0 compilando (PlatformIO / ESP32).")
    pdf.bullet("Código em develop e master via gitflow (PRs #81 e #82).")
    pdf.bullet("Falta: bancada física, piloto 3–10 máquinas, Pix real, TLS público.")
    pdf.callout(
        "Como ler este documento",
        "Seções 3–5 respondem o que temos / não precisamos / falta. "
        "Seções 6–8 são instruções práticas. Seção 10 é o plano de ação dos sócios.",
        "info",
    )

    # 2
    pdf.h1("2. Posicionamento vs PagPlush")
    pdf.body(
        "A PagPlush concentra operação numa PCB densa (ESP32, fonte, relé, optos, "
        "display, USB, bornes). Isso eleva custo, dificulta troca e gera lock-in."
    )
    pdf.table(
        ["Dimensão", "PagPlush", "GruaHub"],
        [
            ["Operação", "Na placa", "No cloud / SaaS"],
            ["Hardware", "All-in-one proprietário", "DevKit + harness fino"],
            ["Lock-in", "HW + operação", "SaaS; adaptador trocável"],
            ["Field-swap", "Troca o cérebro", "Desplug → outro DevKit"],
            ["Escala", "SKU complexo", "SKU fino + cabos"],
        ],
        [38, 72, 72],
    )
    pdf.callout(
        "Decisão estratégica",
        "Não competir em complexidade de PCB. Competir em uptime da frota, "
        "conciliação, custo de troca e centralização operacional no sistema.",
        "warn",
    )

    # 3
    pdf.h1("3. O que TEMOS (ativos)")
    pdf.h2("3.1 Software")
    for t in [
        "Backend Quarkus 3.8 / Java 21 — monólito modular",
        "Web Next.js 14 — ops, PWA jogador, portal parceiro",
        "Mobile Expo — operador offline-first",
        "Keycloak 24, EMQX MQTT, PostgreSQL, MinIO",
        "Simuladores de máquina e pagamento",
        "Contratos MQTT v1/ + OpenAPI versionados",
        "Domínios: frota, IoT, pagamentos sandbox, jogadas, conciliação, estoque, visitas, sangria, comissão, alertas, anexos, push",
    ]:
        pdf.check(True, t)

    pdf.h2("3.2 Hardware (firmware / spec)")
    for t in [
        "Spec Adaptador Fino v0 documentada",
        "Firmware Pulse: heartbeat, GRANT_CREDIT idempotente, ACK, PLAY_IN opcional",
        "Provisionamento NVS (Serial + script)",
        "Build esp32dev SUCCESS",
    ]:
        pdf.check(True, t)

    pdf.h2("3.3 Engenharia e operação")
    for t in [
        "Docker Compose + profiles prod-like / tls / backup / monitoring",
        "scripts/ci-local.sh (contracts + simulators + firmware)",
        "Gitflow feature → develop → release → master",
    ]:
        pdf.check(True, t)

    # 4
    pdf.add_page()
    pdf.h1("4. O que NÃO precisamos (agora)")
    pdf.callout(
        "Anti-lista (proteger o produto)",
        "Tudo abaixo é tentador sob pressão competitiva e deve ser rejeitado no piloto.",
        "bad",
    )
    for t in [
        "PCB all-in-one com display, USB host, multi-relé e dezenas de optos",
        "Lógica de preço, promoção ou estoque no firmware",
        "Bornes de parafuso como interface principal de instalação",
        "Microsserviços / Kubernetes / Kafka sem evidência de carga",
        "Carteira B2C, NF-e SEFAZ, IA/ML preditivo nesta fase",
        "Fabricar PCB própria antes de validar DevKit em campo",
    ]:
        pdf.bullet(t)

    # 5
    pdf.h1("5. O que FALTA")
    pdf.h2("P0 — bloqueia fruto comercial")
    for t in [
        "Bancada E2E com ESP32 físico + LED/relé",
        "1 adquirente Pix real em tenant piloto",
        "Piloto 3–10 máquinas com harness",
        "DNS + TLS público (Let's Encrypt)",
        "Billing GitHub Actions (ou aceitar só ci-local)",
    ]:
        pdf.check(False, t)

    pdf.h2("P1 — portabilidade e escala")
    for t in [
        "Cabos harness por fabricante (SKU de cabo)",
        "Vendor adapter Eletek/Sega com protocolo real",
        "Provisionamento QR + bind mobile",
        "TLS MQTT + ACL por device",
        "Dashboard crédito / mismatch",
        "E-mail/SMS, WAF comercial, Vault/SM, PITR",
    ]:
        pdf.check(False, t)

    # 6
    pdf.add_page()
    pdf.h1("6. Hardware — placas e instruções")
    pdf.body(
        "Comprar peças de prateleira. Não projetar PCB custom no piloto."
    )
    pdf.h2("BOM recomendado")
    pdf.table(
        ["Item", "Função", "Nota"],
        [
            ["ESP32-WROOM ou C3 DevKit", "MCU + Wi-Fi", "envs esp32dev / esp32c3"],
            ["Relé 5V ou opto PC817", "Pulso crédito", "GPIO 26 default"],
            ["JST/Molex 2–4 vias + cabo", "Harness", "1 cabo por modelo de grua"],
            ["Fonte 5V ≥ 1A", "Alimentação", "Buck 12→5 se necessário"],
            ["LED", "Prova de pulso", "Onboard ok"],
        ],
        [55, 45, 82],
    )
    pdf.h2("Pinout do harness")
    pdf.mono("1 GND  |  2 CREDIT_OUT  |  3 PLAY_IN (opc.)  |  4 +5V (opc.)")
    pdf.h2("Instalação alvo (≤ 15 minutos)")
    for i, t in enumerate(
        [
            "Criar/associar machine + controller no dashboard",
            "Flash firmware e gravar NVS (tenant, machine, Wi-Fi, MQTT, pulseMs)",
            "Conectar harness (mínimo GND + CREDIT_OUT)",
            "Energizar → heartbeat → ONLINE",
            "Disparar 1 crédito → observar pulso → ACK no backend",
        ],
        start=1,
    ):
        pdf.bullet(f"{i}. {t}")
    pdf.h2("Build e provisionamento")
    pdf.mono(
        "cd firmware/adaptador-fino\n"
        "pio run -e esp32dev && pio run -t upload\n"
        "scripts/provision-adaptador-nvs.sh /caminho/lab.env"
    )

    # 7
    pdf.h1("7. Integrações")
    pdf.table(
        ["Integração", "Estado", "Próximo passo"],
        [
            ["MQTT EMQX v1/", "Pronto", "TLS + ACL produção"],
            ["Pix sandbox", "Pronto", "Adquirente real"],
            ["Mercado Pago", "Parcial", "Token + tenant piloto"],
            ["Eletek / Sega", "Stubs", "Após pulse estável"],
            ["Expo Push", "Pronto", "FCM Google opcional"],
            ["MinIO anexos", "Pronto", "Bucket produção"],
            ["Keycloak", "Pronto", "Sem usuários demo"],
        ],
        [45, 40, 97],
    )
    pdf.h3("Fluxo canônico")
    pdf.mono(
        "Jogador/Pix → Backend → Outbox GRANT_CREDIT → MQTT\n"
        "→ Adaptador (pulsos) → CREDIT_RECEIVED → Conciliação"
    )

    # 8
    pdf.add_page()
    pdf.h1("8. Instruções do sistema (quickstart)")
    pdf.h2("Demo local")
    pdf.mono(
        "cp infra/.env.example infra/.env\n"
        "cd infra && ./run.sh up\n"
        "cd backend && ./mvnw quarkus:dev\n"
        "cd web && npm i && npm run dev\n"
        "# + simulators/machine-simulator e payment-simulator"
    )
    pdf.h2("Validação local (sem Actions)")
    pdf.mono("./scripts/ci-local.sh\n# CI_LOCAL_JOBS=all ./scripts/ci-local.sh")
    pdf.h2("Documentos no repositório")
    for t in [
        "README.md — visão e quickstart",
        "docs/HARDWARE_ADAPTER.md — hardware fino",
        "docs/MQTT_CONTRACT.md — contrato IoT",
        "docs/DEPLOYMENT.md — deploy / DR",
        "docs/COMMERCIAL_READINESS.md — gaps comerciais",
        "docs/PILOT_CHECKLIST.md — checklist piloto + bancada",
        "docs/ARCHITECTURE.md — arquitetura",
        "docs/TASKS.md — estado real das tasks",
    ]:
        pdf.bullet(t)

    # 9
    pdf.h1("9. Arquitetura (resumo)")
    pdf.body(
        "Clientes Web/Mobile/PWA autenticam via Keycloak. O backend Quarkus expõe REST "
        "e consome/publica MQTT via EMQX. Persistência em PostgreSQL; objetos em MinIO. "
        "O Adaptador Fino (ou simulador) é cliente MQTT fino: executa crédito e reporta estado."
    )
    pdf.mono(
        "Web / Mobile / PWA  →  Keycloak  →  Quarkus API\n"
        "ESP32 / Simulador   →  EMQX MQTT →  Quarkus IoT\n"
        "Quarkus → PostgreSQL + MinIO + Outbox → comandos MQTT"
    )

    # 10
    pdf.h1("10. Plano de ação para os sócios")
    pdf.table(
        ["Quando", "Ação", "Dono"],
        [
            ["Semana 1", "Comprar 2–3 DevKits + relés; montar bancada", "Técnico/ops"],
            ["Semana 1–2", "Contrato Pix (ex. Mercado Pago)", "Comercial"],
            ["Semana 2–3", "E2E bancada + 1 máquina real", "Técnico"],
            ["Semana 3–6", "Piloto 3–10 máquinas", "Ambos"],
            ["Paralelo", "DNS + HTTPS público", "Técnico"],
            ["Depois", "Vendor adapter se frota exigir", "Técnico"],
            ["Evitar", "PCB monstro / feature creep no device", "Ambos"],
        ],
        [32, 110, 40],
    )

    # 11
    pdf.h1("11. Diagnóstico de riscos")
    pdf.table(
        ["Risco", "Sev.", "Mitigação"],
        [
            ["Sem hardware em campo", "Alta", "Bancada + piloto especificados"],
            ["Sem Pix real", "Alta", "1 adquirente prioritário"],
            ["CI Actions (billing)", "Média", "ci-local.sh"],
            ["Copiar modelo PagPlush", "Alta", "Spec anti all-in-one"],
            ["Wi-Fi ruim no ponto", "Média", "Antena; 4G só depois"],
        ],
        [70, 22, 90],
    )

    # 12
    pdf.h1("12. Conclusão")
    pdf.body(
        "A base de software está sólida e a tese de hardware está correta. "
        "Para gerar receita, o foco não é inventar placa complexa: é fechar o elo "
        "físico mínimo (DevKit + harness), ligar Pix real e rodar um piloto curto, "
        "mantendo o GruaHub como sistema central da operação."
    )
    pdf.callout(
        "Próxima revisão sugerida",
        "Atualizar este PDF após: (1) bancada E2E OK, (2) primeiro Pix real, "
        "(3) primeiro piloto com máquinas reais.",
        "info",
    )
    pdf.ln(4)
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        5,
        "Fonte regenerável: scripts/generate-diagnostico-pdf.py\n"
        f"Saídas: {OUT_PDF.relative_to(ROOT)} e {OUT_MD.relative_to(ROOT)}",
    )

    pdf.output(OUT_PDF)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(build_markdown(), encoding="utf-8")
    build_pdf()
    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
