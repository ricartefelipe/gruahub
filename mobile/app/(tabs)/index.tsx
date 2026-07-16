/**
 * Rota do Dia — tela inicial do app mobile.
 */

import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { Link } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';

// Dados mock enquanto integração com API está sendo conectada
const MOCK_ROUTE = [
  { id: '1', pointName: 'Shopping BV - L1', address: 'Recife, PE', score: 87, machines: 2, reason: 'Estoque crítico + 5 dias sem visita' },
  { id: '2', pointName: 'Supermercado Fortaleza', address: 'Fortaleza, CE', score: 62, reason: 'Receita em queda' },
  { id: '3', pointName: 'Parque Natal', address: 'Natal, RN', score: 41, reason: 'Visita preventiva' },
];

export default function RouteScreen() {
  const { userEmail } = useAuthStore();
  const { sync } = useSyncQueue();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rota do Dia</Text>
        <Text style={styles.subtitle}>{userEmail || 'Operador'}</Text>
      </View>

      <FlatList
        data={MOCK_ROUTE}
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
              <View style={styles.reasonContainer}>
                <Text style={styles.reasonLabel}>Motivo: </Text>
                <Text style={styles.reason}>{item.reason}</Text>
              </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  list: { padding: 16, gap: 12 },
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
