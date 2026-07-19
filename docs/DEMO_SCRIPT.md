# GruaHub — Roteiro de Demonstração

> Roteiro executável para demonstrar o MVP para clientes beta ou investidores.  
> Duração estimada: 20–30 minutos.  
> Pré-requisito: ambiente local rodando conforme `DEPLOYMENT.md`.

---

## Fase 0 — Preparação (5 min, antes da demo)

```bash
# 1. Subir toda a infra + simuladores
cd infra
docker compose --profile simulators up -d

# 2. Aguardar todos os serviços ficarem healthy
docker compose ps

# 3. Verificar logs do backend (deve mostrar changelogs Liquibase aplicados)
docker compose logs backend --tail=30

# 4. Verificar que Keycloak está aceitando tokens
curl -sf http://localhost:8180/realms/gruahub/.well-known/openid-configuration \
  | python3 -m json.tool | grep '"issuer"'
```

**Critério de sucesso:** `docker compose ps` mostra todos os serviços `(healthy)`.

---

## Fase 1 — Login e Dashboard Web (3 min)

1. Abrir `http://localhost:3000` no browser.
2. Clicar em **Entrar com Keycloak**.
3. Fazer login com `gestor@diversao.demo` / `gruahub@2025`.
4. Verificar:
   - Dashboard carrega com métricas do Tenant A.
   - URL da sessão não contém token — NextAuth usa cookie seguro.
   - `SandboxBanner` visível ("Ambiente de Demonstração").

**Ponto de atenção:** Demonstra autenticação via OIDC real, isolamento de tenant, e RBAC visível na UI.

---

## Fase 2 — Frota de Máquinas (3 min)

1. Navegar para **Máquinas** → lista com máquinas seed do Tenant A.
2. Clicar em uma máquina online (heartbeat ativo pelo simulador).
3. Mostrar:
   - Status online/offline em tempo real (polling 30s).
   - Última jogada registrada.
   - Alerta de manutenção (se houver).
4. Clicar em **+ Nova Máquina** → preencher formulário → salvar.
5. Confirmar que a nova máquina aparece na lista.

**Ponto de atenção:** O simulador de máquina envia heartbeat a cada 30s; status muda automaticamente.

---

## Fase 3 — Fluxo de Pagamento Sandbox (4 min)

1. Abrir segunda aba com Keycloak Admin: `http://localhost:8180`.
2. Na tab principal, navegar para **Pagamentos** → mostrar histórico.
3. Em terminal, disparar pagamento simulado:

```bash
# Fluxo sandbox: initiate → confirm (requer GRUAHUB_SANDBOX_ENABLED=true no compose)
export SANDBOX_SECRET="${SANDBOX_SECRET:-sandbox-webhook-secret-gruahub-demo}"
export TENANT_ID=11111111-0000-0000-0000-000000000001
export MACHINE_ID=66666666-0000-0000-0000-000000000001

TX=$(curl -sf -X POST http://localhost:8080/api/v1/payments/sandbox/initiate \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "X-Machine-Id: $MACHINE_ID" \
  -H "X-Sandbox-Secret: $SANDBOX_SECRET" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionId'])")

curl -sf -X POST "http://localhost:8080/api/v1/payments/sandbox/confirm/$TX" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "X-Machine-Id: $MACHINE_ID" \
  -H "X-Sandbox-Secret: $SANDBOX_SECRET" \
  -d '{}'
```

Alternativa com o simulador (profile `simulators`):

```bash
cd simulators/payment-simulator && npm start full-flow
```

4. Voltar para o browser → **Pagamentos** → confirmar novo pagamento aparece.
5. Navegar para **Conciliação** → caso tende a `MATCHED` após ACK/play do simulador de máquina.
6. Dashboard da máquina → crédito/jogada atualizados.

**Ponto de atenção:** Sandbox exige JWT (roles TENANT_ADMIN/FINANCE/PLATFORM_ADMIN) ou header `X-Sandbox-Secret`. Em produção o flag fica desligado (`GRUAHUB_SANDBOX_ENABLED=false`).

---

## Fase 4 — Telemetria IoT (3 min)

```bash
# Verificar heartbeats chegando no backend
docker compose logs backend --tail=50 | grep heartbeat

# Disparar evento de jogada iniciada pelo simulador
docker compose logs machine-sim --tail=20
```

1. No browser, navegar para uma máquina.
2. Mostrar que `última_jogada` atualiza após `play_completed` chegar.
3. Abrir painel EMQX: `http://localhost:18083` (admin / public) → **Topics** → mostrar tópico `v1/+/machines/+/telemetry`.

**Ponto de atenção:** MQTT schema-v1.json é validado na chegada; mensagens malformadas são rejeitadas com log de erro.

---

## Fase 5 — Isolamento de Tenant (2 min — demonstração de segurança)

```bash
# Obter token do Tenant B
TOKEN_B=$(curl -s -X POST \
  http://localhost:8180/realms/gruahub/protocol/openid-connect/token \
  -d "grant_type=password&client_id=gruahub-backend&username=financeiro@diversao.demo&password=gruahub@2025" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Obter um id de máquina do Tenant A (com token A) e tentar ler com token B
MACHINE_A_ID=<uuid-da-maquina-do-tenant-a>
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN_B" \
  http://localhost:8080/api/v1/machines/$MACHINE_A_ID
```

**Resultado esperado:** `404` — recurso de outro tenant não é revelado (não 403, para não vazar existência).

**Ponto de atenção:** Tenant derivado exclusivamente do JWT; listagens só retornam dados do tenant do token.

---

## Fase 6 — App Mobile (3 min)

```bash
cd mobile
npx expo start --android
# ou: npx expo start --ios
```

1. Fazer login com PKCE (sem digitar senha — tela Keycloak).
2. Navegar para **Máquinas** → lista sincronizada do backend.
3. Ativar modo avião no dispositivo.
4. Registrar uma visita de campo → salva na fila offline.
5. Desativar modo avião.
6. Observar sincronização automática com indicador de fila.

**Ponto de atenção:** Fila com retry exponencial e deduplicação por `idempotency_key` — não duplica operações mesmo com reconexão instável.

---

## Fase 7 — Rotas e Visitas (2 min)

1. Navegar para **Rotas** → mostrar rota planejada com máquinas prioritizadas por score.
2. Navegar para **Visitas** → mostrar histórico de visitas de campo.
3. Clicar em **Nova Visita** → checklist de manutenção → confirmar sangria registrada.

---

## Fase 8 — Observabilidade (2 min)

```bash
# Métricas Micrometer
curl -s http://localhost:8080/q/metrics | grep gruahub

# Health check
curl -s http://localhost:8080/q/health | python3 -m json.tool

# Log correlacionado — copiar um X-Correlation-Id da resposta anterior
curl -v http://localhost:8080/api/v1/machines 2>&1 | grep -i correlation
```

**Ponto de atenção:** `X-Correlation-Id` presente em todas as respostas; rastreável end-to-end (frontend → backend → MQTT).

---

## Fase 9 — Encerrando

```bash
cd infra
docker compose --profile simulators down -v
```

---

## Cenários de Falha para Demonstrar (opcional, +5 min)

| Cenário | Como disparar | Resultado esperado |
|---------|---------------|-------------------|
| Token expirado | Aguardar expiração ou editar exp no JWT | Redirect automático para login |
| Webhook sem HMAC | `curl -X POST /api/v1/payments/webhook -d '{}'` | 401 Unauthorized |
| Webhook replay | Reenviar mesmo payload com mesmo `X-Nonce` | 409 Conflict |
| Schema MQTT inválido | Publicar mensagem malformada via EMQX | Log de erro; mensagem descartada |
| Cross-tenant | Ver Fase 5 acima | 403 Forbidden |
| Fila offline dupla | Criar operação offline → desligar → recriar mesma | Uma operação sincronizada (deduplicação) |

---

## Perguntas Frequentes de Investidores

**"Funciona com hardware real?"**  
> O contrato MQTT é genérico (schema-v1.json). Adaptadores por fabricante (Eletek, Sega) são o próximo passo — não estão no MVP.

**"Escala horizontalmente?"**  
> O backend é monólito modular. Escalonamento horizontal requer adaptação do outbox (CDC/Debezium) e locks distribuídos. Documentado em `KNOWN_LIMITATIONS.md`.

**"É seguro para produção?"**  
> A arquitetura de segurança está pronta (OIDC, HMAC, isolamento de tenant, sem PAN/CVV). Faltam: HTTPS/TLS, certificados, secrets manager (Vault), auditoria de penetração. Ver `COMMERCIAL_READINESS.md`.
