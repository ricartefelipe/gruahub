# GruaHub Mobile — Design: polish Expo (Fase 1+)

**Data:** 2026-07-23  
**Status:** aprovado em brainstorming  
**Escopo:** app mobile existente (`mobile/`, Expo / React Native) — iOS e Android  
**Fora de escopo:** Flutter rewrite; mudanças no portal web nesta rodada

---

## 1. Contexto e objetivo

O GruaHub já possui app de campo em Expo (auth PKCE, fila offline SQLite, rota do dia, visitas, checklist, estoque/QR). É MVP demonstrável, mas a UI é básica (ícones literais, StyleSheets soltos, pouca hierarquia de campo).

**Objetivo:** caprichar o app mobile em fases, sem reescrever regras de negócio nem contratos com o backend.

**Critério de sucesso da Fase 1:** fluxo de visita completo polido (login → rota → check-in → checklist → estoque/QR → concluir) + tabs Fila e Perfil aceitáveis, com identidade GruaHub e UX otimizada para uso em campo (alto contraste, CTAs grandes, poucas ações por tela).

---

## 2. Decisões fechadas

| Tema | Escolha |
|------|---------|
| Stack | Manter Expo / React Native (não Flutter) |
| Entrega | Em fases: UX → offline/sync → builds piloto |
| Superfície | Somente mobile nesta rodada |
| Visual | Híbrido: identidade GruaHub + UI de campo |
| Fase 1 | Fluxo de visita completo + Fila/Perfil ok |
| Abordagem técnica | Design system interno (`src/ui`) + polish por tela |
| Home (Rota) | Layout **B** — foco na próxima parada; lista secundária + acesso à lista completa |
| Fluxo de visita | **Wizard** com barra de 4 passos |
| Offline / sync | Banner persistente leve + badge na tab Fila |

---

## 3. Arquitetura de UI

### O que não muda

- Auth OIDC PKCE (`expo-auth-session`), tokens em SecureStore
- SQLite: `offlineQueue`, `routeCache`, schema versionado, state machine de sync
- `apiClient` / contratos REST existentes
- Hooks `useSyncQueue`, `usePushNotifications`
- Rotas Expo Router em `app/` (podem ganhar params/headers de progresso, sem novo backend)

### O que entra

Camada `mobile/src/ui/`:

| Camada | Responsabilidade |
|--------|------------------|
| Tokens | Extensão de `theme/tokens.ts`: spacing, radius, tipografia, touch target ≥44pt, cores de status (online/offline/sync) |
| Primitives | `AppButton`, `AppText`, `AppHeader`, `Screen`, `Card` (só interação), `StatusChip`, `EmptyState`, `ErrorBanner`, `LoadingBlock`, `Icon` |
| Compostos | `StopCard`, `NextStopHero`, `VisitStepHeader`, `SyncQueueRow`, `OfflineBanner` |
| Telas | Continuam em `app/`; orquestram dados/navegação e compõem `src/ui` |

**Regra:** telas não inventam StyleSheet ad hoc para padrões repetidos; visual vem de `src/ui`. Light/dark via `ThemeProvider` existente.

---

## 4. Home — layout B

1. Header compacto (marca + data + chip online/offline se aplicável).
2. **Hero da próxima parada** (“AGORA”): nome, endereço/motivo, CTA grande **Iniciar visita**.
3. Lista secundária das demais paradas (toque abre/inicia aquela parada).
4. Ação “Ver todas” (ou equivalente) para lista completa estilo lista+CTA quando o operador precisar reordenar mentalmente.
5. Tabs: Rota | Fila (com badge de pendentes) | Perfil.

Pull-to-refresh e cache offline da rota permanecem.

---

## 5. Wizard de visita — 4 passos

| Passo | Conteúdo | Notas |
|-------|----------|--------|
| 1 | Check-in | Responsável, notas, GPS (`getCheckinLocation`); enqueue `START_VISIT` |
| 2 | Checklist | Itens atuais; enqueue por item / lote conforme hoje |
| 3 | Estoque / QR | Reposição via scan; **pode pular** se não houver reposição no ponto |
| 4 | Sangria + concluir | Cash + `COMPLETE_VISIT`; CTA final **Concluir** |

- `VisitStepHeader`: barra de progresso + título do passo (“Passo 2 de 4 · Checklist”).
- CTA primário sticky/inferior: Continuar / Concluir.
- Voltar permite revisar passo anterior sem perder estado enfileirado já gravado.
- **Não alterar** tipos de operação nem payload da fila — só envoltório de UI/navegação.

---

## 6. Offline e feedback

- **Banner** no topo (âmbar): “Sem rede · N ops na fila” quando offline ou com pendências relevantes.
- **Badge** numérico na tab Fila.
- Visita **nunca** bloqueada por falta de rede (offline-first mantido).
- Toast/Alert apenas para falha permanente de sync ou erro irrecuperável local.
- Empty states com ação clara (ex.: “Puxar para atualizar”, “Ir para Fila”).

Detalhamento fino de retry manual e copy de estados fica na **Fase 2**.

---

## 7. Fases

### Fase 1 — UX (este design)

- `src/ui` + tokens de campo
- Home B + wizard A + OfflineBanner/badge
- Polish login, Fila (visual básico), Perfil
- Skip no passo estoque

### Fase 2 — Confiança offline/sync

- Fila com estados legíveis (PENDING / SYNCING / FAILED_*)
- Retry manual, mensagens de falha permanente
- Refino do banner (quando mostrar N vs só “offline”)

### Fase 3 — Piloto instalável

- EAS Build (APK/IPA interno)
- Splash, ícone, app.json de marca
- Env/config de piloto documentados

Push FCM completo permanece fora (já listado em limitações do produto).

---

## 8. Erros e estados de UI

| Situação | Tratamento |
|----------|------------|
| Sem rede | Banner + badge; operações enfileiram |
| Rota vazia | EmptyState com orientação |
| GPS falhou no check-in | Fluxo atual de degradação + UI clara |
| Sync falhou (retryable) | Fila mostra pendente; sync automático quando online |
| Sync falhou (permanent) | Alert/copy na Fila (Fase 2 reforça) |
| Sessão expirada | Refresh/clearAuth existentes; tela de login polida |

---

## 9. Testes e qualidade

- Manter suite atual da fila offline (não regressar).
- Testes unitários de tokens/tema e primitives críticos (ex.: parsing de tema, render básico de banner com contagem).
- `npm run typecheck` e job mobile no CI continuam como gate.
- Não exigir E2E device na Fase 1; validação manual do fluxo de visita no Expo Go / emulador.

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Wizard esconde flexibilidade do ponto | Skip no passo 3; voltar entre passos |
| Refator visual quebra offline | Não tocar na state machine; telas só chamam APIs/`enqueue` existentes |
| Escopo creep (web, FCM, Flutter) | Explicitamente fora; fases 2–3 documentadas |

---

## 11. Critérios de aceite (Fase 1)

- [ ] Primitives em `src/ui` usadas nas telas do fluxo de visita
- [ ] Home mostra próxima parada em destaque (layout B)
- [ ] Visita apresenta 4 passos com barra de progresso
- [ ] Passo estoque permite pular
- [ ] OfflineBanner + badge na Fila quando aplicável
- [ ] Login, Fila e Perfil usam o mesmo design system (nível aceitável)
- [ ] Testes offline existentes passam; typecheck ok
- [ ] Nenhuma mudança obrigatória de backend/OpenAPI para a Fase 1
