# GruaHub — Roteiro de Demonstração

## Preparação (5 min)

```bash
# 1. Clonar e configurar
cp .env.example .env

# 2. Subir toda a stack
docker compose up -d
# aguardar ~60 s para Keycloak e Postgres inicializarem

# 3. Backend (aba separada)
cd backend && ./mvnw quarkus:dev

# 4. Web (aba separada)
cd web && npm run dev

# 5. Simuladores (aba separada)
cd simulators && npm run simulate
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
Login: `operator@tenant1.com` / `op123`

Dashboard carrega com KPIs da frota.

---

### Etapa 2 — Ver frota ao vivo

Menu → **Máquinas**.
As máquinas do seed aparecem. Os simuladores publicam heartbeats a cada 30 s,
então o status fica `ACTIVE` (ponto verde pulsante).

Clicar em qualquer máquina → página de detalhe com abas Informações / Chamados / Alertas / Estoque / Jogadas.

---

### Etapa 3 — Simular pagamento sandbox

Menu → **Pagamentos**.
Clicar no botão **✓ Confirmar** de uma transação `PENDING` (gerada pelo simulador).
O backend processa o webhook simulado, libera crédito na máquina via MQTT,
e o status muda para `CONFIRMED`.

---

### Etapa 4 — Visita de campo no mobile

Abrir Expo Go → escanear QR do `npx expo start`.
Login com `field@tenant1.com` / `field123`.

Fluxo:
1. Tela Rota → selecionar ponto operacional
2. Iniciar visita → checklist (8 itens, toggle)
3. Completar → informar valor da sangria
4. Escanear QR Code da máquina (ou digitar)

A visita é salva localmente (SQLite) e sincronizada com o backend.

---

### Etapa 5 — Ver fila offline

Tela **Fila** no mobile.
Mostrar operações PENDING/SYNCED/FAILED.
Puxar para baixo (pull-to-refresh) para forçar sincronização.

---

### Etapa 6 — Alerta automático

Parar os simuladores (`Ctrl+C`).
Aguardar ~90 s.
Menu → **Alertas** no web dashboard.
Alertas `MACHINE_OFFLINE` aparecem (um por máquina).

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

Logout → login como `parceiro@estabelec1.com` / `parceiro123`.
Acessar `http://localhost:3000/portal`.
Ver apenas as máquinas e visitas do próprio estabelecimento.

---

## Pontos de Demonstração (Investidores / Clientes)

| Ponto                    | O que mostrar                                    |
|--------------------------|--------------------------------------------------|
| Multi-tenant             | Login com dois operadores diferentes, dados isolados |
| Offline-first            | Desligar Wi-Fi → criar visita → religar → ver sync |
| IoT em tempo real        | Heartbeat MQTT → status atualiza em 30 s         |
| Pagamento sandbox        | Confirmar/falhar transação → crédito liberado     |
| Audit trail              | Menu Auditoria → log de todas as ações com correlationId |
| PDF report               | Gerar e baixar relatório em 1 clique              |

## Dados de Seed

Tenant de demonstração: `11111111-0000-0000-0000-000000000001`

Pontos operacionais: 3 estabelecimentos, 5 pontos operacionais.
Máquinas: 5 máquinas (GRUA-001 a GRUA-005).
Simuladores: publicam heartbeat das máquinas 001, 003, 005.
