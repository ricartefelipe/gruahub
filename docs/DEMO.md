# GruaHub — Roteiro de Demonstração

## Preparação (5 min)

```bash
# 1. Clonar e configurar (segredos só via .env — ver infra/.env.example)
cp infra/.env.example infra/.env
cp .env.example .env   # opcional: apps locais fora do compose

# 2. Subir infra + backend + web + simuladores MQTT/pagamento
cd infra
docker compose --profile simulators up -d
# aguardar serviços healthy (~60–90 s)

# Alternativa: infra via compose e apps locais
# docker compose up -d   # sem profile simulators
# cd ../backend && ./mvnw quarkus:dev
# cd ../web && npm run dev
# cd ../simulators/machine-simulator && npm run dev
```

Verificar que tudo está saudável:
```bash
curl -s http://localhost:8080/q/health/live | jq .status
# "UP"
```

## Jornada Completa (10 etapas)

### Etapa 1 — Login como Operador

Abrir `http://localhost:3000`.
Clicar em **Entrar** → redireciona para Keycloak.
Login: `gestor@diversao.demo` / `gruahub@2025`

Dashboard carrega com KPIs da frota.

---

### Etapa 2 — Ver frota ao vivo

Menu → **Máquinas**.
As máquinas do seed aparecem. Os simuladores publicam heartbeats a cada 30 s
para MAQUINA-001 e MAQUINA-003 (UUIDs no `.env` / compose), mantendo status `ACTIVE`.

Clicar em qualquer máquina → página de detalhe com abas Informações / Chamados / Alertas / Estoque / Jogadas.

---

### Etapa 3 — Simular pagamento sandbox

Menu → **Pagamentos**.
Clicar no botão **✓ Confirmar** de uma transação `PENDING` (gerada pelo simulador).
O backend processa o webhook simulado, libera crédito na máquina via MQTT,
e o status muda para `CONFIRMED`.

---

### Etapa 3b — Jogada do jogador (PWA)

QR do adesivo deve apontar para a URL da página pública, por exemplo:
`http://localhost:3000/play/GH-MAQUINA-001`

1. Abrir a URL no celular (sem login).
2. Clicar **Pagar e jogar** → gera Pix sandbox.
3. Em demo, clicar **Simular confirmação (sandbox)**.
4. Status vira `CONFIRMED` e o crédito vai para a máquina via MQTT.

No detalhe da máquina (dashboard) há o link da página do jogador e o botão para
copiar a URL do adesivo.

---

### Etapa 4 — Operação de campo no celular (sem Play Store)

Canal recomendado no piloto: **web HTTPS no Chrome**.

1. No Android, abrir  
   `https://gruahub.54.94.163.136.sslip.io/mobile.html`
2. Toque em **Abrir login HTTPS**.
3. **Entrar com SSO** → `operador@diversao.demo` / `gruahub@2025`
4. Menu → **Rotas** e **Visitas**.

O seed demo cria rota do dia (`CURRENT_DATE`) com 2 paradas.
Para GPS/câmera/offline do app nativo, use Expo Go (`cd mobile && npx expo start --tunnel`) — ver `mobile/README.md`.
Não use o APK HTTP experimental (cleartext bloqueado no Android).

### Etapa 4b — Visita completa no Expo (opcional)

O app chama `GET /api/v1/routes?date=YYYY-MM-DD` e usa `operatingPointId` na visita.

Abrir Expo Go → escanear QR do `npx expo start --tunnel`.
Login com `operador@diversao.demo` / `gruahub@2025`.

Fluxo:
1. Tela Rota → selecionar ponto operacional
2. Iniciar visita → checklist (8 itens, toggle)
3. Completar → informar valor da sangria
4. Escanear QR Code da máquina (ou digitar)

A visita é salva localmente (SQLite) e sincronizada com o backend.
Se a rota estiver vazia: no web, **Rotas → Gerar rota de hoje**, ou reinicie o backend com `QUARKUS_LIQUIBASE_CONTEXTS=demo`.

---

### Etapa 5 — Ver fila offline

Tela **Fila** no mobile.
Mostrar operações PENDING/SYNCED/FAILED.
Puxar para baixo (pull-to-refresh) para forçar sincronização.

---

### Etapa 6 — Alerta automático

Parar o simulador de máquinas (`docker compose --profile simulators stop machine-simulator`
ou `Ctrl+C` se rodando local).
Aguardar ~2–2,5 min (timeout padrão 120 s + job a cada 30 s).
Menu → **Alertas** no web dashboard.
Alertas `MACHINE_OFFLINE` aparecem para as máquinas que estavam enviando heartbeat (001 e 003).

Clicar em **Reconhecer** → adicionar nota → confirmar.
O alerta move para status `ACKNOWLEDGED`.

---

### Etapa 7 — Chamado de manutenção

Menu → **Manutenção** → **Novo chamado** (ou via mobile).
Preencher: máquina, título, prioridade CRITICAL.
O backend atualiza o status da máquina para `MAINTENANCE`.

---

### Etapa 8 — Gerar rota do dia

Menu → **Rotas** → **Gerar rota de hoje**.
O backend ordena os pontos por `priority_score` e cria o plano.
Ver painel lateral com as paradas em ordem.

---

### Etapa 9 — Relatório em PDF

Menu → **Relatórios** → **Status da Frota** → **Gerar**.
O browser faz download automático do PDF gerado pelo backend
(Flying Saucer via Qute template).

---

### Etapa 10 — Portal do parceiro

Logout → login como `parceiro@shoppingbv.demo` / `gruahub@2025`.
Acessar `http://localhost:3000/portal`.
Ver apenas as máquinas e visitas do próprio estabelecimento.

---

## Pontos de Demonstração (Investidores / Clientes)

| Ponto                    | O que mostrar                                    |
|--------------------------|--------------------------------------------------|
| Multi-tenant             | Login com dois operadores diferentes, dados isolados |
| Offline-first            | Desligar Wi-Fi → criar visita → religar → ver sync |
| IoT em tempo real        | Heartbeat MQTT → status atualiza em ~30 s         |
| Pagamento sandbox        | Confirmar/falhar transação → crédito liberado     |
| Audit trail              | Menu Auditoria → log de todas as ações com correlationId |
| PDF report               | Gerar e baixar relatório em 1 clique              |

## Dados de Seed

Tenant de demonstração: `11111111-0000-0000-0000-000000000001`

Pontos operacionais: 2 estabelecimentos, 2 pontos (com `priority_score` 90 e 70).
Máquinas: 5 máquinas (MAQUINA-001 a MAQUINA-005).
Simuladores: publicam heartbeat das máquinas 001 e 003.
Liquidações: 2 settlements de demonstração (PENDING e APPROVED) para o módulo Financeiro.
