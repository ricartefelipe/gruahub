/**
 * Tela de Fila de Sincronização — exibe status das operações offline.
 * Suporta todos os 5 estados: PENDING, SYNCING, SYNCED, FAILED_RETRYABLE, FAILED_PERMANENT.
 * Oferece botão de retry manual para FAILED_PERMANENT.
 */

import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { getDb, retryManual } from '../../src/db/offlineQueue';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';

interface QueueEntry {
  id: string;
  clientOperationId: string;
  operationType: string;
  status: string;
  createdAt: string;
  syncedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:           { label: 'Pendente',        color: '#92400e', bg: '#fef3c7' },
  SYNCING:           { label: 'Sincronizando',   color: '#1e40af', bg: '#dbeafe' },
  SYNCED:            { label: 'Sincronizado',    color: '#166534', bg: '#dcfce7' },
  FAILED_RETRYABLE:  { label: 'Falha (retry)',   color: '#c2410c', bg: '#ffedd5' },
  FAILED_PERMANENT:  { label: 'Falha permanente',color: '#991b1b', bg: '#fee2e2' },
};

const OP_LABELS: Record<string, string> = {
  START_VISIT:         'Início de visita',
  COMPLETE_VISIT:      'Conclusão de visita',
  ADD_CHECKLIST_ITEM:  'Checklist',
  REPLENISH_STOCK:     'Reposição',
  CASH_COLLECTION:     'Sangria',
  OPEN_MAINTENANCE:    'Chamado de manutenção',
  UPLOAD_PHOTO:        'Upload de foto',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function QueueScreen() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    pending: 0, syncing: 0, synced: 0, failedRetryable: 0, failedPermanent: 0,
  });
  const { sync } = useSyncQueue();

  const loadEntries = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<QueueEntry>(
      `SELECT id,
              client_operation_id  AS clientOperationId,
              operation_type       AS operationType,
              status,
              created_at           AS createdAt,
              synced_at            AS syncedAt,
              error_message        AS errorMessage,
              retry_count          AS retryCount,
              next_retry_at        AS nextRetryAt
       FROM offline_operation
       ORDER BY created_at DESC
       LIMIT 100`
    );
    setEntries(rows);

    const statRows = await db.getAllAsync<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM offline_operation GROUP BY status`
    );
    const s = { pending: 0, syncing: 0, synced: 0, failedRetryable: 0, failedPermanent: 0 };
    for (const r of statRows) {
      switch (r.status) {
        case 'PENDING':          s.pending = r.count; break;
        case 'SYNCING':          s.syncing = r.count; break;
        case 'SYNCED':           s.synced = r.count; break;
        case 'FAILED_RETRYABLE': s.failedRetryable = r.count; break;
        case 'FAILED_PERMANENT': s.failedPermanent = r.count; break;
      }
    }
    setStats(s);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    await loadEntries();
    setRefreshing(false);
  }, [sync, loadEntries]);

  async function handleRetry(id: string) {
    Alert.alert(
      'Tentar novamente?',
      'A operação será re-enfileirada e sincronizada na próxima oportunidade.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Re-tentar',
          onPress: async () => {
            await retryManual(id);
            await loadEntries();
          },
        },
      ]
    );
  }

  const statKeys: Array<{ key: string; label: string; value: number }> = [
    { key: 'pending',         label: 'Pendente',      value: stats.pending },
    { key: 'syncing',         label: 'Sync…',         value: stats.syncing },
    { key: 'synced',          label: 'Sincronizado',  value: stats.synced },
    { key: 'failedRetryable', label: 'Retry',         value: stats.failedRetryable },
    { key: 'failedPermanent', label: 'Permanente',    value: stats.failedPermanent },
  ];
  const statusForKey: Record<string, string> = {
    pending: 'PENDING', syncing: 'SYNCING', synced: 'SYNCED',
    failedRetryable: 'FAILED_RETRYABLE', failedPermanent: 'FAILED_PERMANENT',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fila de Sincronização</Text>
        <Text style={styles.subtitle}>Puxe para forçar sincronização</Text>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        {statKeys.map(({ key, label, value }) => {
          const meta = STATUS_LABELS[statusForKey[key]] ??
            { label, color: '#374151', bg: '#f3f4f6' };
          return (
            <View key={key} style={[styles.statChip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statCount, { color: meta.color }]}>{value}</Text>
              <Text style={[styles.statLabel, { color: meta.color }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const statusMeta = STATUS_LABELS[item.status] ??
            { label: item.status, color: '#374151', bg: '#f3f4f6' };
          const isPermanent = item.status === 'FAILED_PERMANENT';

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.opType} numberOfLines={1}>
                  {OP_LABELS[item.operationType] ?? item.operationType}
                </Text>
                <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
                  <Text style={[styles.badgeText, { color: statusMeta.color }]}>
                    {statusMeta.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.opId}>
                ID: {item.clientOperationId.slice(0, 8)}…
              </Text>

              <View style={styles.meta}>
                <Text style={styles.metaText}>Criado: {formatDate(item.createdAt)}</Text>
                {item.syncedAt ? (
                  <Text style={styles.metaText}>Sync: {formatDate(item.syncedAt)}</Text>
                ) : null}
                {item.retryCount > 0 ? (
                  <Text style={styles.metaText}>Tentativas: {item.retryCount}</Text>
                ) : null}
                {item.nextRetryAt && item.status === 'FAILED_RETRYABLE' ? (
                  <Text style={styles.metaText}>
                    Próx. retry: {formatDate(item.nextRetryAt)}
                  </Text>
                ) : null}
              </View>

              {item.errorMessage ? (
                <Text style={styles.error} numberOfLines={3}>
                  {item.errorMessage}
                </Text>
              ) : null}

              {isPermanent && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => handleRetry(item.id)}
                  accessibilityLabel="Re-tentar operação com falha permanente"
                  accessibilityRole="button"
                >
                  <Text style={styles.retryButtonText}>↺ Re-tentar manualmente</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma operação na fila.</Text>
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
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 13, color: '#bfdbfe', marginTop: 4 },
  statsBar: {
    flexDirection: 'row', gap: 6, padding: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  statChip: { flex: 1, borderRadius: 8, padding: 7, alignItems: 'center' },
  statCount: { fontSize: 16, fontWeight: 'bold' },
  statLabel: { fontSize: 9, marginTop: 1, textAlign: 'center' },
  list: { padding: 12, gap: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', gap: 8,
  },
  opType: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  opId: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  meta: { marginTop: 8, gap: 2 },
  metaText: { fontSize: 12, color: '#6b7280' },
  error: {
    marginTop: 8, fontSize: 12, color: '#dc2626',
    backgroundColor: '#fef2f2', borderRadius: 6, padding: 6,
  },
  retryButton: {
    marginTop: 10, backgroundColor: '#2563eb', borderRadius: 8,
    padding: 10, alignItems: 'center',
  },
  retryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
