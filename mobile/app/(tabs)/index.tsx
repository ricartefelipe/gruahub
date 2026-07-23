import {
  View, ScrollView, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { useOfflineBanner } from '../../src/hooks/useOfflineBanner';
import { apiGet, ApiError } from '../../src/api/apiClient';
import { loadCachedRoute, saveCachedRoute, CachedRouteStop } from '../../src/db/routeCache';
import { spacing, useTheme } from '../../src/theme';
import {
  Screen,
  AppHeader,
  OfflineBanner,
  ErrorBanner,
  LoadingBlock,
  EmptyState,
  NextStopHero,
  StopCard,
  AppText,
  splitRouteStops,
} from '../../src/ui';

type RouteStop = CachedRouteStop;

function pageContent<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && Array.isArray((body as { content?: unknown }).content)) {
    return (body as { content: T[] }).content;
  }
  return [];
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTodayRoute(accessToken: string, tenantId: string): Promise<RouteStop[]> {
  const today = todayKey();

  const planRes = await apiGet(`/api/v1/routes?date=${today}&page=0&size=1`, {
    accessToken,
    tenantId: tenantId || undefined,
  });
  const planData = await planRes.json();
  const plans = pageContent<{ id: string }>(planData);
  if (plans.length === 0) return [];

  const planId = plans[0].id;
  const stopsRes = await apiGet(`/api/v1/routes/${planId}/stops`, {
    accessToken,
    tenantId: tenantId || undefined,
  });
  const stopsBody = await stopsRes.json();
  const stops = pageContent<{
    id: string;
    operatingPointId?: string;
    operatingPointName?: string;
    pointName?: string;
    address?: string;
    priorityScore?: number;
    score?: number;
    priorityExplanation?: string;
    reason?: string;
  }>(stopsBody);

  return stops
    .filter((s) => !!s.operatingPointId)
    .map((s) => ({
      id: s.id,
      operatingPointId: s.operatingPointId as string,
      pointName: s.operatingPointName ?? s.pointName ?? 'Ponto',
      address: s.address ?? '',
      score: s.priorityScore ?? s.score ?? 0,
      reason: (s.priorityExplanation ?? s.reason ?? '').replace(/^"|"$/g, ''),
    }));
}

function visitHref(stop: RouteStop) {
  return `/visits/start?pointId=${stop.operatingPointId}&pointName=${encodeURIComponent(stop.pointName)}`;
}

export default function RouteScreen() {
  const { userEmail, accessToken, tenantId, refreshAccessToken, clearAuth } = useAuthStore();
  const { sync } = useSyncQueue();
  const { message, refresh: refreshBanner } = useOfflineBanner();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(), []);
  const [route, setRoute] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadRoute = useCallback(async () => {
    if (!accessToken) {
      setError('Não autenticado. Faça login novamente.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const stops = await fetchTodayRoute(accessToken, tenantId ?? '');
      setRoute(stops);
      setFromCache(false);
      await saveCachedRoute(todayKey(), stops);
    } catch (e: unknown) {
      const cached = await loadCachedRoute(todayKey());
      if (cached && cached.length > 0) {
        setRoute(cached);
        setFromCache(true);
        setError('Sem conexão com a API — exibindo rota em cache.');
        return;
      }

      if (e instanceof ApiError && e.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          try {
            const stops = await fetchTodayRoute(
              useAuthStore.getState().accessToken ?? accessToken,
              tenantId ?? ''
            );
            setRoute(stops);
            setFromCache(false);
            await saveCachedRoute(todayKey(), stops);
            setError(null);
            return;
          } catch {
            // fall through
          }
        }
        await clearAuth();
        setError('Sessão expirada. Faça login novamente.');
      } else if (e instanceof ApiError && e.status === 0) {
        setError(
          'Não foi possível alcançar a API. Confira EXPO_PUBLIC_API_URL (localhost no emulador; IP da máquina no device).'
        );
      } else {
        setError(e instanceof Error ? e.message : 'Erro ao carregar rota.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, tenantId, refreshAccessToken, clearAuth]);

  useEffect(() => { loadRoute(); }, [loadRoute]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    await loadRoute();
    await refreshBanner();
    setRefreshing(false);
  }, [sync, loadRoute, refreshBanner]);

  const { next, rest } = splitRouteStops(route);

  const openVisit = useCallback((stop: RouteStop) => {
    router.push(visitHref(stop));
  }, []);

  return (
    <Screen>
      <AppHeader title="GruaHub" subtitle={userEmail || 'Operador'} />
      <OfflineBanner message={message} />
      {error ? <ErrorBanner message={error} /> : null}

      {loading ? (
        <LoadingBlock message="Carregando rota…" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {route.length === 0 ? (
            <EmptyState
              title={error ? 'Não foi possível carregar a rota.' : 'Nenhuma parada para hoje'}
              description={
                error
                  ? undefined
                  : 'No web: Rotas → Gerar rota de hoje (ou reinicie o backend com seed demo).'
              }
            />
          ) : showAll ? (
            <>
              {route.map((stop) => (
                <StopCard
                  key={stop.id}
                  pointName={stop.pointName}
                  address={stop.address || undefined}
                  score={stop.score}
                  onPress={() => openVisit(stop)}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll(false)}
                style={styles.toggle}
              >
                <AppText variant="cta" color={colors.primary}>
                  Ver foco
                </AppText>
              </Pressable>
            </>
          ) : (
            <>
              {next ? (
                <NextStopHero
                  pointName={next.pointName}
                  address={next.address || undefined}
                  reason={next.reason || undefined}
                  indexLabel="#1 · Próxima parada"
                  onStart={() => openVisit(next)}
                />
              ) : null}

              {rest.length > 0 ? (
                <View style={styles.section}>
                  <AppText variant="caption" color={colors.textMuted} style={styles.sectionTitle}>
                    Em seguida
                  </AppText>
                  {rest.map((stop) => (
                    <StopCard
                      key={stop.id}
                      pointName={stop.pointName}
                      address={stop.address || undefined}
                      score={stop.score}
                      onPress={() => openVisit(stop)}
                    />
                  ))}
                </View>
              ) : null}

              {route.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAll(true)}
                  style={styles.toggle}
                >
                  <AppText variant="cta" color={colors.primary}>
                    Ver todas
                  </AppText>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function createStyles() {
  return StyleSheet.create({
    list: { paddingBottom: spacing.xl, flexGrow: 1 },
    section: { marginTop: spacing.sm },
    sectionTitle: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
    },
    toggle: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginHorizontal: spacing.md,
    },
  });
}
