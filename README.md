# GruaHub

Plataforma B2B multi-tenant para operação de máquinas de pelúcia e gruas.

O GruaHub centraliza telemetria, pagamentos, jogadas, estoque, visitas de campo e gestão de parceiros. A solução integra os equipamentos via MQTT a um backend Quarkus, portal web e aplicação móvel usada pela operação em campo.

O processamento principal permanece na nuvem. Na máquina, o device funciona como um **Adaptador Fino**, responsável pela comunicação MQTT e liberação de crédito, sem concentrar as regras de negócio da plataforma.

Documentação relacionada:

- [Adaptador de hardware](docs/HARDWARE_ADAPTER.md)
- [Contrato MQTT](docs/MQTT_CONTRACT.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Decisões arquiteturais](docs/DECISIONS.md)

## Arquitetura da solução

| Componente | Stack | Porta |
|---|---|---|
| **Backend** | Quarkus 3.8 + Java 21 | 8080 |
| **Frontend Web** | Next.js 14 App Router | 3000 |
| **App Mobile** | Expo 51 / React Native | — |
| **Keycloak** | v24 | 8180 (demo) / `https://auth.localhost` (prod-like) |
| **PostgreSQL** | v16 | 5432 |
| **EMQX** | v5.7 (MQTT) | 1883 / 8083 |
| **MinIO** | S3-compatible | 9000 |

Principais decisões:

- backend organizado como **modular monolith**, com fronteiras de domínio explícitas;
- comunicação com dispositivos via MQTT;
- `tenant_id` derivado da identidade autenticada;
- outbox para publicação confiável de eventos;
- inbox/idempotência para mensagens de device e eventos de pagamento;
- aplicativo de campo offline-first, com fila local e reprocessamento;
- pagamentos reais fora do escopo atual; o ambiente de demonstração utiliza sandbox e simuladores.

## Demo no portfólio

No host `portfolio-apps`, ou localmente com as mesmas portas:

```bash
cd infra
cp -n .env.example .env
../scripts/portfolio-up.sh
```

| Recurso | URL |
|---|---|
| Web (HTTPS) | https://gruahub.54.94.163.136.sslip.io/login |
| Teste no celular | https://gruahub.54.94.163.136.sslip.io/mobile.html |
| Web (HTTP legado) | http://54.94.163.136:9083 |
| Swagger | http://54.94.163.136:8084/q/swagger-ui |
| Health | http://54.94.163.136:8084/q/health |
| Keycloak | http://54.94.163.136:8182 |

Usuários principais para demonstração:

- Gestor: `gestor@diversao.demo`
- Operação de campo: `operador@diversao.demo`
- Senha: `gruahub@2025`

No celular, use Chrome + HTTPS em `mobile.html`.

A interface do portfólio chama a API por proxy same-origin em `/api/gh`, evitando dependência de CORS no navegador. O Swagger permanece disponível diretamente na porta `8084`.

## Documentação e operação

- Checks locais quando o GitHub Actions estiver indisponível: `./scripts/ci-local.sh`
- [Diagnóstico executivo](docs/diagnostico/GruaHub-Diagnostico-Executivo.pdf)
- Regeneração do diagnóstico: `python3 scripts/generate-diagnostico-pdf.py`
- [Deployment](docs/DEPLOYMENT.md)
- [Commercial readiness](docs/COMMERCIAL_READINESS.md)
- [Segurança](docs/SECURITY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Observabilidade](docs/OBSERVABILITY.md)
- [Limitações conhecidas](docs/KNOWN_LIMITATIONS.md)

## Início rápido

### Pré-requisitos

- Docker Desktop ≥ 4.28 com Compose V2
- Node.js 20+ para web e mobile
- Java 21+ para execução local do backend

### 1. Subir infraestrutura

```bash
cp infra/.env.example infra/.env
cd infra
./run.sh up
```

O script libera as portas usadas pela stack local e sobe os serviços necessários.

Para apenas liberar as portas:

```bash
./run.sh free-ports
```

Aguarde os serviços ficarem `healthy`:

```bash
docker compose ps
```

### Profiles opcionais

```bash
# Prod-like: HTTPS + backup, sem publicar portas de administração no host
./scripts/up-prod-like.sh up -d --build

# TLS
docker compose --profile tls up -d --build

# Backup
docker compose --profile backup up -d

# Monitoramento
docker compose --profile monitoring up -d
```

Recursos adicionais:

- HTTPS local: `https://localhost`
- OIDC: `https://auth.localhost`
- `KEYCLOAK_EDGE_ISSUER`: `https://auth.localhost/realms/gruahub`
- Backup em volume `postgres_backups`
- Backup offsite opcional via `BACKUP_S3_*`
- Drill de restore: `pg-restore-drill.sh`
- Uptime Kuma: `http://localhost:3002`
- Push: `GRUAHUB_PUSH_PROVIDER=noop|http-stub`
- Segredos locais: `infra/.env`
- Produção: suporte a `VAR_FILE`

### 2. Subir o backend

```bash
cd backend
./mvnw quarkus:dev
```

Endpoints locais:

- API: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/q/swagger-ui`
- Health: `http://localhost:8080/q/health`
- Metrics: `http://localhost:8080/q/metrics`

### 3. Subir o frontend web

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Frontend:

```text
http://localhost:3000
```

### 4. Subir os simuladores

Em terminais separados:

```bash
cd simulators/machine-simulator
npm install
npm start
```

```bash
cd simulators/payment-simulator
npm install
npm start confirm
```

### 5. App mobile

Com backend e Keycloak disponíveis:

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

Variáveis principais:

| Variável | Default local | Nota |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8080` | Em device físico, use o IP da máquina |
| `EXPO_PUBLIC_KEYCLOAK_URL` | `http://localhost:8180` | Deve ser alcançável pelo telefone |
| `EXPO_PUBLIC_KEYCLOAK_REALM` | `gruahub` | Realm do Keycloak |
| `EXPO_PUBLIC_KEYCLOAK_CLIENT_ID` | `gruahub-mobile` | Client público PKCE |

Jornada de campo:

```text
login SSO
→ rota do dia
→ iniciar visita
→ checklist
→ sangria e/ou reposição de estoque
→ concluir visita
→ fila offline
→ sincronização
```

As visitas e movimentações sincronizadas aparecem no portal web em **Visitas** e **Estoque**.

QRs aceitos na demonstração do operador:

- UUID da máquina;
- `gruahub://machine/<uuid>`;
- patrimônio, como `MAQUINA-001`;
- `qr_code` seed, como `GH-MAQUINA-001`.

Fluxo do jogador:

```text
QR da máquina
→ PWA
→ Pix sandbox
→ confirmação
→ crédito
→ comando MQTT
→ jogada
```

Testes do mobile:

```bash
cd mobile
npm test
npm run typecheck
```

## Usuários de demo

Todos usam a senha `gruahub@2025`.

| Email | Papel |
|---|---|
| `admin@gruahub.local` | PLATFORM_ADMIN |
| `gestor@diversao.demo` | TENANT_ADMIN |
| `operador@diversao.demo` | FIELD_OPERATOR |
| `tecnico@diversao.demo` | TECHNICIAN |
| `financeiro@diversao.demo` | FINANCE |
| `parceiro@shoppingbv.demo` | ESTABLISHMENT_VIEWER |

## Jornada demonstrável

1. Login web com `gestor@diversao.demo`
2. Dashboard exibe o estado das máquinas seed
3. Simulador de máquina envia heartbeats
4. Simulador de pagamento executa o fluxo sandbox
5. Backend concede o crédito e publica o comando MQTT
6. Simulador recebe `GRANT_CREDIT`, envia ACK e registra início/fim da jogada
7. Conciliação registra o caso correspondente
8. Operador executa a visita pelo aplicativo móvel
9. Visita sincronizada aparece no portal
10. Alertas operacionais registram máquinas sem heartbeat

Para executar o fluxo completo de pagamento:

```bash
cd simulators/payment-simulator
npm start full-flow
```

O fluxo utiliza `sandbox/initiate` + `sandbox/confirm` com o header `X-Sandbox-Secret`.

## Estrutura do monorepo

```text
gruahub/
├── backend/                    # Quarkus 3 / Java 21
│   └── src/main/java/com/gruahub/
│       ├── shared/             # TenantContext, Money, filtros, outbox
│       ├── identity/           # Tenant, ExternalUser
│       ├── fleet/              # Machine, MachineModel, Controller
│       ├── iot/                # MQTT, eventos e heartbeat
│       ├── payments/           # Transações, sandbox e webhook
│       ├── plays/              # Crédito e sessões de jogada
│       ├── reconciliation/     # Conciliação
│       ├── inventory/          # Prêmios e estoque
│       ├── fieldops/           # Visitas e sangria
│       ├── maintenance/        # Chamados
│       ├── alerts/             # Alertas
│       ├── locations/          # Estabelecimentos e pontos
│       ├── finance/            # Liquidações e comissão
│       └── audit/              # Auditoria append-only
│
├── web/                        # Next.js 14
│   └── src/app/dashboard/
│       ├── machines/
│       ├── locations/
│       ├── payments/
│       ├── reconciliation/
│       ├── inventory/
│       ├── visits/
│       ├── maintenance/
│       ├── alerts/
│       ├── finance/
│       ├── routes/
│       ├── reports/
│       └── audit/
│
├── mobile/                     # Expo 51 / React Native
│   └── app/
│       ├── login/
│       ├── (tabs)/
│       ├── visits/
│       └── qr-scan.tsx
│
├── simulators/
│   ├── machine-simulator/
│   └── payment-simulator/
│
├── firmware/
│   └── adaptador-fino/
│
├── infra/
│   ├── docker-compose.yml
│   ├── caddy/Caddyfile
│   ├── scripts/
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   ├── keycloak/realm-gruahub.json
│   └── emqx/acl.conf
│
├── contracts/
│   ├── mqtt/
│   └── openapi/
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DECISIONS.md
    ├── DEPLOYMENT.md
    ├── SECURITY.md
    ├── THREAT_MODEL.md
    ├── OBSERVABILITY.md
    ├── MQTT_CONTRACT.md
    ├── KNOWN_LIMITATIONS.md
    ├── MVP_READINESS.md
    ├── DEMO_SCRIPT.md
    ├── COMMERCIAL_READINESS.md
    └── TASKS.md
```

## Decisões de arquitetura

Os ADRs completos estão em [docs/DECISIONS.md](docs/DECISIONS.md).

Principais decisões:

- **Modular monolith em Quarkus**: módulos separados por domínio, mantendo possibilidade de extração futura
- **Outbox com Quarkus Scheduler**: evita introduzir Kafka no MVP sem necessidade
- **Inbox/idempotência**: `device_message_inbox` e `payment_event_inbox` evitam reprocessamento duplicado
- **Multi-tenancy por linha**: `tenant_id` presente nas tabelas e derivado do JWT
- **Offline-first mobile**: SQLite local, `clientOperationId` e retry com backoff exponencial

## Limitações conhecidas

A lista completa está em [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

No estado atual:

- sem hardware real integrado;
- pagamentos apenas em sandbox;
- sem emissão fiscal;
- sem Kubernetes;
- sem Kafka;
- push disponível apenas como stub, sem integração FCM completa.

## Segurança

- segredos somente por variáveis de ambiente;
- `.env.example` e `infra/.env.example` contêm placeholders;
- rate limiting global em `/api/*` e políticas mais restritas para webhook e sandbox;
- webhooks com HMAC-SHA256 e proteção contra replay;
- ACL MQTT por dispositivo;
- `tenant_id` derivado do JWT;
- logs sem tokens, credenciais ou dados financeiros completos;
- audit log append-only para ações sensíveis.

## Licença

Proprietário — uso interno GruaHub Ltda. Não distribuir.
