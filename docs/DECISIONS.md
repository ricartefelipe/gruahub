# GruaHub — Decisões Arquiteturais (ADRs)

## ADR-001: Monólito Modular em vez de Microsserviços

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** O produto é um MVP com equipe pequena. Microsserviços trazem overhead operacional elevado.

**Decisão:** Monólito modular com fronteiras claras por domínio em `com.gruahub.<módulo>`. O módulo IoT (MQTT) é parte do monólito mas com fronteira definida para extração futura.

**Consequências:** Implantação simples, refatoração fácil, sem latência inter-serviços. Extração de módulos é possível quando houver necessidade demonstrada.

---

## ADR-002: Quarkus 3 como Framework Backend

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Stack mandatória conforme requisito do produto.

**Decisão:** Quarkus 3 em versão estável (3.8.x LTS). Java 21 virtual threads (Loom) para operações bloqueantes.

**Consequências:** Startup rápido, imagem Docker nativa disponível futuramente, boa integração com Keycloak OIDC, Hibernate Panache, Micrometer e OpenTelemetry.

---

## ADR-003: Outbox Transacional com Scheduler Quarkus

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Precisamos de consistência entre escrita no banco e publicação de mensagens (MQTT, eventos).

**Decisão:** Usar tabela `outbox_event` com scheduler Quarkus (`@Scheduled`) em vez de Debezium no MVP. Polling a cada 1s em produção demo.

**Consequências:** Sem dependência de Kafka ou CDC no MVP. Latência de até 1s aceitável. Extração futura para Kafka é isolada no módulo `shared.outbox`.

---

## ADR-004: Inbox + Idempotency Record para Webhooks e MQTT

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Webhooks de pagamento e mensagens MQTT QoS 1 podem ser entregues mais de uma vez.

**Decisão:** Toda mensagem externa é registrada em `device_message_inbox` ou `payment_event_inbox` com chave de idempotência. Processamento real só ocorre na primeira entrega; reentregas retornam 200 OK sem efeito.

**Consequências:** QoS MQTT não é tratado como exactly-once de negócio. A garantia de negócio vem da idempotência da camada de aplicação.

---

## ADR-005: Keycloak como Identity Provider

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Precisamos de OIDC robusto com suporte a papéis e multi-tenant.

**Decisão:** Keycloak 24 com realm `gruahub` importado automaticamente no Docker Compose. Papéis mapeados como realm roles e client roles.

**Consequências:** Usuários e papéis gerenciados no Keycloak. Backend valida JWT. `tenant_id` é um claim customizado no token.

---

## ADR-006: EMQX como Broker MQTT

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Precisamos de broker MQTT gerenciável localmente.

**Decisão:** EMQX 5.x via Docker. ACL por dispositivo em produção. ACL demonstrativa local com regras por prefixo de tópico.

**Consequências:** EMQX tem UI em :18083 para inspeção de mensagens. Facilita desenvolvimento e demonstração.

---

## ADR-007: Next.js com App Router para Frontend Web

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Stack mandatória.

**Decisão:** Next.js 14 App Router com TypeScript estrito, React Query para estado remoto, Zod para validação, shadcn/ui para componentes acessíveis.

**Consequências:** SSR disponível para páginas públicas/SEO. Client components para dados dinâmicos. Playwright para E2E.

---

## ADR-008: React Native + Expo para Mobile

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Stack mandatória. Operadores precisam trabalhar offline.

**Decisão:** Expo 51 com Expo Router. SQLite via expo-sqlite. Fila offline gerenciada localmente com `clientOperationId` UUID e estado (PENDING/SYNCING/SYNCED/FAILED).

**Consequências:** Operações offline são deduplicadas no servidor por `clientOperationId`. Sem perda de dados ao fechar o app.

---

## ADR-009: PDF via Flying Saucer (XHTML→PDF) com Templates Qute

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** Precisamos gerar recibos e relatórios em PDF sem serviços externos.

**Decisão:** Templates HTML/Qute renderizados no servidor e convertidos em PDF com Flying Saucer (OpenPDF). Armazenados em MinIO com URL pré-assinada.

**Consequências:** PDFs são gerados localmente sem dependências externas. Qualidade adequada para recibos operacionais.

---

## ADR-010: SandboxPaymentProvider sem Integração Real

**Status:** Aceita  
**Data:** 2025-07-16

**Contexto:** MVP não deve ter credenciais reais de pagamento. A abstração permite evolução sem reescrita.

**Decisão:** `PaymentProvider` como interface. `SandboxPaymentProvider` implementa o contrato completo com dados fictícios. Integração Mercado Pago/PagSeguro/Stone é implementada como adaptador separado quando houver credenciais reais e validação contra sandbox oficial.

**Consequências:** Não afirmar integração real. Claramente identificado como sandbox em todos os logs e UIs.
