/**
 * Rota do Dia — tela inicial do app mobile.
 * Busca a rota de hoje do backend via API REST.
 * Funciona offline: exibe último estado sincronizado quando sem conexão.
 */

import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { Link } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

interface RouteStop {
  id: string;
  pointName: string;
  address: string;
  score: number;
  machines?: number;
  reason: string;
}

async function fetchTodayRoute(accessToken: string, tenantId: string): Promise<RouteStop[]> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Busca planos de rota para hoje
  const plansRes = await fetch(
    `${API_URL}/api/v1/routing/plans?date=${today}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
      },
    }
  );

  if (!plansRes.ok) {
    throw new Error(`Erro ao buscar rota: ${plansRes.status}`);
  }

  const plans: Array<{ id: string }> = await plansRes.json();
  if (plans.length === 0) return [];

  // Busca paradas do primeiro plano do dia
  const planId = plans[0].id;
  const stopsRes = await fetch(
    `${API_URL}/api/v1/routing/plans/${planId}/stops`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-ID': tenantId,
      },
    }
  );

  if (!stopsRes.ok) {
    throw new Error(`Erro ao buscar paradas: ${stopsRes.status}`);
  }

  const stops = await stopsRes.json();

  // Mapeia para o formato da tela
  return stops.map((s: {
    id: string;
    operatingPointName?: string;
    address?: string;
    priorityScore?: number;
    machineCount?: number;
    visitReason?: string;
  }) => ({
    id: s.id,
    pointName: s.operatingPointName ?? 'Ponto sem nome',
    address: s.address ?? '',
    score: s.priorityScore ?? 0,
    machines: s.machineCount,
    reason: s.visitReason ?? '',
  }));
}

export default function RouteScreen() {
  const { userEmail, accessToken, tenantId } = useAuthStore();
  const { sync } = useSyncQueue();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteStop[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRoute = useCallback(async () => {
    if (!accessToken || !tenantId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const stops = await fetchTodayRoute(accessToken, tenantId);
      setRoute(stops);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar rota');
    } finally {
      setLoading(false);
    }
  }, [accessToken, tenantId]);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    await loadRoute();
    setRefreshing(false);
  }, [sync, loadRoute]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rota do Dia</Text>
        <Text style={styles.subtitle}>{userEmail || 'Operador'}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={route}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item, index }) => (
            <Link href={`/visits/start?pointId=${item.id}&pointName=${encodeURIComponent(item.pointName)}`} asChild>
              <TouchableOpacity
                style={styles.card}
                accessible
                accessibilityLabel={`Ponto ${index + 1}: ${item.pointName}. Score: ${item.score}. ${item.reason}`}
                accessibilityRole="button"
              >
                <View style={styles.cardHeader}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.scoreContainer}>
                    <Text style={styles.scoreLabel}>Score</Text>
                    <Text style={[
                      styles.scoreValue,
                      item.score >= 80 ? styles.scoreHigh :
                      item.score >= 50 ? styles.scoreMed :
                      styles.scoreLow
                    ]}>{item.score}</Text>
                  </View>
                </View>
                <Text style={styles.pointName}>{item.pointName}</Text>
                <Text style={styles.address}>{item.address}</Text>
                {item.reason ? (
                  <View style={styles.reasonContainer}>
                    <Text style={styles.reasonLabel}>Motivo: </Text>
                    <Text style={styles.reason}>{item.reason}</Text>
                  </View>
                ) : null}
                <Text style={styles.cta}>Iniciar visita →</Text>
              </TouchableOpacity>
            </Link>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma parada planejada para hoje.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  list: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badge: { backgroundColor: '#e0e7ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#3730a3', fontWeight: 'bold', fontSize: 12 },
  scoreContainer: { alignItems: 'flex-end' },
  scoreLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' },
  scoreValue: { fontSize: 24, fontWeight: 'bold' },
  scoreHigh: { color: '#16a34a' },
  scoreMed: { color: '#d97706' },
  scoreLow: { color: '#6b7280' },
  pointName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  address: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  reasonContainer: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  reasonLabel: { fontSize: 12, color: '#374151', fontWeight: '500' },
  reason: { fontSize: 12, color: '#6b7280', flex: 1 },
  cta: { marginTop: 12, color: '#2563eb', fontWeight: '600', fontSize: 14, textAlign: 'right' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15 },
});
