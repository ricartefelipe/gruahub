# Mobile Expo Polish (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caprichar o app Expo de campo (home com foco na próxima parada, wizard de visita em 4 passos, banner/badge offline) via design system interno, sem alterar auth, fila SQLite nem contratos de API.

**Architecture:** Extender `theme/tokens.ts` e criar `mobile/src/ui/` (primitives + compostos). Extrair helpers puros testáveis (`offlineBanner`, `routeStops`). Telas em `app/` passam a compor UI; o passo 3 do wizard (`visits/stock-step`) encadeia checklist → estoque/QR (com skip) → complete. Offline via `getQueueStats` + `expo-network`, sem mudança na state machine.

**Tech Stack:** Expo ~54, React Native, Expo Router, TypeScript, Jest/ts-jest (env `node`), SecureStore/SQLite existentes, `@expo/vector-icons`.

## Global Constraints

- Não reescrever em Flutter; stack permanece Expo/React Native.
- Não alterar payloads/`OPERATION_TYPES`/state machine da fila offline.
- Sem mudanças obrigatórias de backend/OpenAPI na Fase 1.
- Touch targets ≥ 44pt; copy em pt-BR; sem menções a ferramentas de IA em commits.
- Jest atual: preferir testes de lógica pura em `*.test.ts`; evitar depender de `jest-expo` para primitives.
- Fases 2–3 (retry UX avançado, EAS) ficam fora deste plano.

## File map

| Path | Responsibility |
|------|----------------|
| `mobile/src/theme/tokens.ts` | Cores warning/offline + spacing/radius/typography/touchTarget |
| `mobile/src/ui/offlineBannerMessage.ts` | Helper puro: texto do banner ou `null` |
| `mobile/src/ui/routeStops.ts` | Helper puro: próxima parada + restante |
| `mobile/src/ui/visitSteps.ts` | Constantes dos 4 passos do wizard |
| `mobile/src/ui/Screen.tsx` | Container de tela com safe area + background |
| `mobile/src/ui/AppText.tsx` | Tipografia temática |
| `mobile/src/ui/AppButton.tsx` | CTA primário/secundário/ghost |
| `mobile/src/ui/AppHeader.tsx` | Header de marca |
| `mobile/src/ui/StatusChip.tsx` | Chip online/offline/status |
| `mobile/src/ui/EmptyState.tsx` | Estado vazio com ação |
| `mobile/src/ui/ErrorBanner.tsx` | Banner de erro (API) |
| `mobile/src/ui/OfflineBanner.tsx` | Banner âmbar offline/fila |
| `mobile/src/ui/LoadingBlock.tsx` | Loading centralizado |
| `mobile/src/ui/VisitStepHeader.tsx` | Barra de progresso do wizard |
| `mobile/src/ui/NextStopHero.tsx` | Card “AGORA” da home |
| `mobile/src/ui/StopCard.tsx` | Card de parada secundária |
| `mobile/src/ui/SyncQueueRow.tsx` | Linha da fila (visual) |
| `mobile/src/ui/index.ts` | Barrel exports |
| `mobile/src/hooks/useOfflineBanner.ts` | Rede + `getQueueStats` → props do banner/badge |
| `mobile/app/(tabs)/_layout.tsx` | Badge na tab Fila + ícones |
| `mobile/app/(tabs)/index.tsx` | Home layout B |
| `mobile/app/(tabs)/queue.tsx` | Usar SyncQueueRow / primitives |
| `mobile/app/(tabs)/profile.tsx` | Polish com primitives |
| `mobile/app/login/index.tsx` | Polish login |
| `mobile/app/visits/start.tsx` | Passo 1 + VisitStepHeader |
| `mobile/app/visits/checklist.tsx` | Passo 2; navegar para stock-step |
| `mobile/app/visits/stock-step.tsx` | **Novo** passo 3 (QR/reposição ou pular) |
| `mobile/app/visits/complete.tsx` | Passo 4 |
| `mobile/app/_layout.tsx` | Registrar `visits/stock-step` |
| `mobile/src/__tests__/tokens.spacing.test.ts` | Testes tokens novos |
| `mobile/src/__tests__/offlineBannerMessage.test.ts` | Testes helper banner |
| `mobile/src/__tests__/routeStops.test.ts` | Testes helper rota |
| `mobile/src/__tests__/visitSteps.test.ts` | Testes constantes wizard |

---

### Task 1: Tokens de campo + helpers puros

**Files:**
- Modify: `mobile/src/theme/tokens.ts`
- Create: `mobile/src/ui/offlineBannerMessage.ts`
- Create: `mobile/src/ui/routeStops.ts`
- Create: `mobile/src/ui/visitSteps.ts`
- Create: `mobile/src/__tests__/tokens.spacing.test.ts`
- Create: `mobile/src/__tests__/offlineBannerMessage.test.ts`
- Create: `mobile/src/__tests__/routeStops.test.ts`
- Create: `mobile/src/__tests__/visitSteps.test.ts`
- Modify: `mobile/src/__tests__/theme.test.ts` (assert novas cores existem)

**Interfaces:**
- Consumes: `ThemeColors` / `ThemeName` existentes
- Produces:
  - `spacing`, `radius`, `typography`, `touchTarget` exports
  - `ThemeColors.warningBannerBg`, `warningBannerText`, `success`, `warning`
  - `formatOfflineBannerMessage(isOnline: boolean, pendingCount: number): string | null`
  - `splitRouteStops<T>(stops: T[]): { next: T | null; rest: T[] }`
  - `VISIT_STEPS`, `VisitStepId`, `getVisitStep(step: 1|2|3|4)`

- [ ] **Step 1: Write failing tests**

```typescript
// mobile/src/__tests__/offlineBannerMessage.test.ts
import { formatOfflineBannerMessage } from '../ui/offlineBannerMessage';

describe('formatOfflineBannerMessage', () => {
  it('retorna null quando online e sem pendências', () => {
    expect(formatOfflineBannerMessage(true, 0)).toBeNull();
  });

  it('mostra offline com contagem', () => {
    expect(formatOfflineBannerMessage(false, 3)).toBe('Sem rede · 3 ops na fila');
  });

  it('mostra offline sem pendências', () => {
    expect(formatOfflineBannerMessage(false, 0)).toBe('Sem rede · ops serão enfileiradas');
  });

  it('mostra pendências mesmo online', () => {
    expect(formatOfflineBannerMessage(true, 2)).toBe('2 ops aguardando sync');
  });
});
```

```typescript
// mobile/src/__tests__/routeStops.test.ts
import { splitRouteStops } from '../ui/routeStops';

describe('splitRouteStops', () => {
  it('lista vazia', () => {
    expect(splitRouteStops([])).toEqual({ next: null, rest: [] });
  });

  it('uma parada', () => {
    const stops = [{ id: '1' }];
    expect(splitRouteStops(stops)).toEqual({ next: stops[0], rest: [] });
  });

  it('separa próxima e restante', () => {
    const stops = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(splitRouteStops(stops)).toEqual({ next: stops[0], rest: [stops[1], stops[2]] });
  });
});
```

```typescript
// mobile/src/__tests__/visitSteps.test.ts
import { VISIT_STEPS, getVisitStep } from '../ui/visitSteps';

describe('visitSteps', () => {
  it('tem 4 passos', () => {
    expect(VISIT_STEPS).toHaveLength(4);
    expect(getVisitStep(3).id).toBe('stock');
    expect(getVisitStep(3).title).toBe('Estoque / QR');
  });
});
```

```typescript
// mobile/src/__tests__/tokens.spacing.test.ts
import { spacing, radius, touchTarget, lightColors, darkColors } from '../theme/tokens';

describe('field tokens', () => {
  it('expõe spacing e touch target de campo', () => {
    expect(spacing.md).toBe(16);
    expect(touchTarget.min).toBeGreaterThanOrEqual(44);
    expect(radius.lg).toBeGreaterThan(0);
  });

  it('expõe cores de warning em light e dark', () => {
    expect(lightColors.warningBannerBg).toBeTruthy();
    expect(darkColors.warningBannerText).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd mobile && npm test -- --testPathPattern='offlineBannerMessage|routeStops|visitSteps|tokens.spacing' --watchAll=false`

Expected: FAIL (modules/exports missing)

- [ ] **Step 3: Implement tokens + helpers**

Em `tokens.ts`, adicionar ao tipo `ThemeColors`:

```typescript
  warningBannerBg: string;
  warningBannerText: string;
  success: string;
  warning: string;
```

Valores light: `warningBannerBg: '#78350f'` não — light deve ser claro: `#fef3c7` / text `#92400e`; dark: `#78350f` / `#fde68a`. `success: '#16a34a'` (light) / `#4ade80` (dark). `warning: '#d97706'` / `#fbbf24`.

Exports:

```typescript
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;
export const typography = {
  hero: { fontSize: 22, fontWeight: '800' as const },
  title: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  cta: { fontSize: 16, fontWeight: '800' as const },
} as const;
export const touchTarget = { min: 44 } as const;
```

```typescript
// mobile/src/ui/offlineBannerMessage.ts
export function formatOfflineBannerMessage(
  isOnline: boolean,
  pendingCount: number,
): string | null {
  if (!isOnline) {
    return pendingCount > 0
      ? `Sem rede · ${pendingCount} ops na fila`
      : 'Sem rede · ops serão enfileiradas';
  }
  if (pendingCount > 0) {
    return `${pendingCount} ops aguardando sync`;
  }
  return null;
}
```

```typescript
// mobile/src/ui/routeStops.ts
export function splitRouteStops<T>(stops: T[]): { next: T | null; rest: T[] } {
  if (stops.length === 0) return { next: null, rest: [] };
  return { next: stops[0], rest: stops.slice(1) };
}
```

```typescript
// mobile/src/ui/visitSteps.ts
export type VisitStepId = 'checkin' | 'checklist' | 'stock' | 'complete';

export const VISIT_STEPS: ReadonlyArray<{
  step: 1 | 2 | 3 | 4;
  id: VisitStepId;
  title: string;
}> = [
  { step: 1, id: 'checkin', title: 'Check-in' },
  { step: 2, id: 'checklist', title: 'Checklist' },
  { step: 3, id: 'stock', title: 'Estoque / QR' },
  { step: 4, id: 'complete', title: 'Sangria e concluir' },
];

export function getVisitStep(step: 1 | 2 | 3 | 4) {
  return VISIT_STEPS[step - 1];
}
```

Reexportar novos tokens em `mobile/src/theme/index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd mobile && npm test -- --testPathPattern='offlineBannerMessage|routeStops|visitSteps|tokens.spacing|theme.test' --watchAll=false`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme mobile/src/ui/offlineBannerMessage.ts mobile/src/ui/routeStops.ts mobile/src/ui/visitSteps.ts mobile/src/__tests__
git commit -m "$(cat <<'EOF'
feat(mobile): tokens de campo e helpers de UI

Base testável para banner offline, split da rota e passos do wizard.
EOF
)"
```

---

### Task 2: Primitives `src/ui` + hook de banner

**Files:**
- Create: `mobile/src/ui/Screen.tsx`, `AppText.tsx`, `AppButton.tsx`, `AppHeader.tsx`, `StatusChip.tsx`, `EmptyState.tsx`, `ErrorBanner.tsx`, `LoadingBlock.tsx`, `OfflineBanner.tsx`, `VisitStepHeader.tsx`, `NextStopHero.tsx`, `StopCard.tsx`, `SyncQueueRow.tsx`, `index.ts`
- Create: `mobile/src/hooks/useOfflineBanner.ts`
- Create: `mobile/src/__tests__/useOfflineBanner.logic.test.ts` (testar `pendingFromStats` se extrair)

**Interfaces:**
- Consumes: `useTheme`, `formatOfflineBannerMessage`, `getVisitStep`, `getQueueStats`, `Network`
- Produces:
  - Components listados no file map
  - `useOfflineBanner(): { message: string | null; pendingCount: number; isOnline: boolean; refresh: () => Promise<void> }`
  - `pendingFromStats(stats: { pending: number; syncing: number; failedRetryable: number; failedPermanent: number }): number`

- [ ] **Step 1: Write failing test for pending count**

```typescript
// mobile/src/__tests__/useOfflineBanner.logic.test.ts
import { pendingFromStats } from '../hooks/useOfflineBanner';

describe('pendingFromStats', () => {
  it('soma pendentes de sync (exclui SYNCED)', () => {
    expect(
      pendingFromStats({
        pending: 2,
        syncing: 1,
        failedRetryable: 1,
        failedPermanent: 1,
        synced: 9,
      }),
    ).toBe(5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd mobile && npm test -- --testPathPattern=useOfflineBanner.logic --watchAll=false`

- [ ] **Step 3: Implement hook + primitives**

```typescript
// mobile/src/hooks/useOfflineBanner.ts
import { useCallback, useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { getQueueStats, type QueueStats } from '../db/offlineQueue';
import { formatOfflineBannerMessage } from '../ui/offlineBannerMessage';

export function pendingFromStats(
  stats: Pick<QueueStats, 'pending' | 'syncing' | 'failedRetryable' | 'failedPermanent'>,
): number {
  return stats.pending + stats.syncing + stats.failedRetryable + stats.failedPermanent;
}

export function useOfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const net = await Network.getNetworkStateAsync().catch(() => ({ isConnected: false }));
    setIsOnline(net.isConnected ?? false);
    const stats = await getQueueStats();
    setPendingCount(pendingFromStats(stats));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return {
    isOnline,
    pendingCount,
    message: formatOfflineBannerMessage(isOnline, pendingCount),
    refresh,
  };
}
```

Primitives (implementação mínima — todos usam `useTheme` + `spacing`/`typography`/`touchTarget`):

- `Screen`: `View` flex 1 + `colors.background` + padding opcional; children.
- `AppText`: variant `hero|title|body|caption|cta` + color override.
- `AppButton`: props `{ label, onPress, variant?: 'primary'|'secondary'|'ghost', disabled?, loading? }`; `minHeight: touchTarget.min`.
- `AppHeader`: title, subtitle opcional, rightSlot opcional; fundo `colors.header`.
- `StatusChip`: `{ label, tone: 'success'|'warning'|'neutral' }`.
- `EmptyState`: `{ title, description?, actionLabel?, onAction? }`.
- `ErrorBanner`: `{ message }` com `colors.errorBanner*`.
- `OfflineBanner`: `{ message: string | null }` — se null, return null; senão View âmbar `warningBanner*`.
- `LoadingBlock`: ActivityIndicator + texto.
- `VisitStepHeader`: props `{ step: 1|2|3|4; pointName: string }` — 4 segmentos de barra + `Passo N de 4 · {title}`.
- `NextStopHero`: `{ pointName, address?, reason?, indexLabel?, onStart }` — CTA “Iniciar visita”.
- `StopCard`: `{ pointName, address?, score?, onPress }` — secundário.
- `SyncQueueRow`: `{ title, statusLabel, statusColor, statusBg, subtitle?, onRetry? }`.

`index.ts` reexporta tudo.

- [ ] **Step 4: Run tests PASS + typecheck**

Run: `cd mobile && npm test -- --watchAll=false && npm run typecheck`

Expected: all PASS; tsc clean

- [ ] **Step 5: Commit**

```bash
git add mobile/src/ui mobile/src/hooks/useOfflineBanner.ts mobile/src/__tests__/useOfflineBanner.logic.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile): primitives de UI e hook de banner offline

Design system interno para home, wizard e feedback de rede/fila.
EOF
)"
```

---

### Task 3: Home layout B + badge na Fila

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/(tabs)/queue.tsx` (usar `SyncQueueRow` + theme; manter retry)

**Interfaces:**
- Consumes: `splitRouteStops`, `NextStopHero`, `StopCard`, `OfflineBanner`, `useOfflineBanner`, `EmptyState`, `ErrorBanner`, `Screen`, `AppHeader`
- Produces: UI home B; `tabBarBadge` na screen `queue` quando `pendingCount > 0`

- [ ] **Step 1: Refactor `(tabs)/index.tsx` to layout B**

Estrutura:

1. `Screen` + `AppHeader` (GruaHub / email)
2. `OfflineBanner message={message}`
3. `ErrorBanner` se `error`
4. Se loading → `LoadingBlock`
5. `const { next, rest } = splitRouteStops(route)`
6. Se `next`: `NextStopHero` com Link/router para `/visits/start?...`
7. Se `rest.length`: seção “Em seguida” com `StopCard`s
8. Estado “ver todas”: `useState(showAll)`; quando true, listar todos com `StopCard` + CTA; botão alterna “Ver todas” / “Ver foco”
9. Empty → `EmptyState`

Manter `fetchTodayRoute`, cache, pull-to-refresh, sync.

- [ ] **Step 2: Wire badge + OfflineBanner awareness in tabs**

Em `_layout.tsx`:

- Usar `useOfflineBanner()`
- Tab icons via `@expo/vector-icons` Ionicons (`map`, `cloud-upload`, `person`) em vez de letras
- `Tabs.Screen name="queue" options={{ tabBarBadge: pendingCount > 0 ? pendingCount : undefined, ... }}`

- [ ] **Step 3: Light polish queue.tsx**

Trocar rows por `SyncQueueRow`; header por `AppHeader`; manter `retryManual` / labels de status (podem usar cores do tema onde fizer sentido).

- [ ] **Step 4: typecheck + unit tests**

Run: `cd mobile && npm test -- --watchAll=false && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(tabs\)
git commit -m "$(cat <<'EOF'
feat(mobile): home com foco na próxima parada e badge na fila

Layout B na rota do dia e feedback visual de pendências de sync.
EOF
)"
```

---

### Task 4: Wizard de visita (4 passos + skip estoque)

**Files:**
- Modify: `mobile/app/visits/start.tsx`
- Modify: `mobile/app/visits/checklist.tsx`
- Create: `mobile/app/visits/stock-step.tsx`
- Modify: `mobile/app/visits/complete.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/qr-scan.tsx` e/ou `stock/replenish.tsx` apenas se precisar devolver params `visitId`/`pointName` ao stock-step (preferir query params na volta)

**Interfaces:**
- Consumes: `VisitStepHeader`, `AppButton`, `Screen`, `enqueue` existente
- Produz navegação: start(1) → checklist(2) → stock-step(3) → complete(4)
- Skip no passo 3: `router.replace({ pathname: '/visits/complete', params: { visitId, pointName } })` sem enqueue extra

- [ ] **Step 1: Register route + create stock-step screen**

Em `_layout.tsx` adicionar:

```tsx
<Stack.Screen name="visits/stock-step" options={{ headerShown: false }} />
```

`stock-step.tsx` (comportamento):

- Params: `visitId`, `pointName`
- `VisitStepHeader step={3}`
- Botões:
  - **Escanear QR** → `router.push({ pathname: '/qr-scan', params: { visitId, pointName, returnTo: 'stock-step' } })` (se `qr-scan` hoje não aceita returnTo, adicionar param opcional e ao concluir reposição voltar para stock-step ou seguir para complete — YAGNI: após reposição bem-sucedida ir para `complete`)
  - **Pular** → Alert confirma → `complete`
- Copy: “Se não houver reposição neste ponto, pode pular.”

Ajuste mínimo em `checklist.tsx`: após save (e no skip de checklist), navegar para `/visits/stock-step` em vez de `/visits/complete`.

- [ ] **Step 2: Add VisitStepHeader to start, checklist, complete**

- `start.tsx`: `step={1}`, usar `Screen`/`AppButton`/`AppHeader` mantendo GPS + enqueue `START_VISIT` → checklist
- `checklist.tsx`: `step={2}` → stock-step
- `complete.tsx`: `step={4}`, CTA “Concluir”

Não mudar payloads de `enqueue`.

- [ ] **Step 3: Manual nav sanity (document in commit body if needed)**

Verificar typecheck: caminhos de router tipados pelo Expo Router podem exigir restart do tsc; garantir imports corretos.

- [ ] **Step 4: Run full mobile tests + typecheck**

Run: `cd mobile && npm test -- --watchAll=false && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/app/visits mobile/app/_layout.tsx mobile/app/qr-scan.tsx mobile/app/stock
git commit -m "$(cat <<'EOF'
feat(mobile): wizard de visita em 4 passos com skip de estoque

Encadeia check-in, checklist, estoque/QR e conclusão com barra de progresso.
EOF
)"
```

---

### Task 5: Polish login + perfil + aceite Fase 1

**Files:**
- Modify: `mobile/app/login/index.tsx`
- Modify: `mobile/app/(tabs)/profile.tsx`
- Modify: `mobile/app/_layout.tsx` (boot screen pode usar `AppText`/brand — opcional mínimo)

**Interfaces:**
- Consumes: `Screen`, `AppButton`, `AppText`, `AppHeader`
- Produz: login com marca hero + CTA grande; perfil com tema/logout alinhados ao design system

- [ ] **Step 1: Polish login**

Manter PKCE/`useAuthRequest` intactos. Visual: fundo header brand, título “GruaHub”, subtítulo “Operação de campo”, `AppButton` “Entrar com Keycloak”, estados loading/erro com `ErrorBanner`.

- [ ] **Step 2: Polish profile**

Usar `Screen`/`AppHeader`/`AppButton` para logout e toggle de tema existentes.

- [ ] **Step 3: Acceptance checklist (manual + automated)**

Automated:

```bash
cd mobile && npm test -- --watchAll=false && npm run typecheck
```

Manual (Expo Go / emulador) — marcar na PR/descrição:

- [ ] Home mostra próxima parada em destaque
- [ ] Wizard 4 passos com barra
- [ ] Skip estoque funciona
- [ ] Banner offline / badge Fila quando aplicável
- [ ] Login e Perfil no mesmo visual

- [ ] **Step 4: Commit**

```bash
git add mobile/app/login mobile/app/\(tabs\)/profile.tsx mobile/app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): polish de login e perfil no design system

Alinha telas de autenticação e conta ao visual de campo da Fase 1.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Design system `src/ui` + tokens campo | 1, 2 |
| Home layout B | 3 |
| Wizard 4 passos | 4 |
| Skip estoque | 4 |
| OfflineBanner + badge Fila | 2, 3 |
| Login / Fila / Perfil aceitáveis | 3, 5 |
| Não mudar backend/offline machine | Global + tasks |
| Testes offline existentes + typecheck | Steps de verificação em cada task |

**Placeholder scan:** nenhum TBD.  
**Type consistency:** `pendingFromStats`, `formatOfflineBannerMessage`, `splitRouteStops`, `getVisitStep(1|2|3|4)` alinhados entre tasks.
