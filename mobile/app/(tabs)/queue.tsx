/**
 * Tela de Fila de Sincronização — exibe status das operações offline.
 * Suporta todos os 5 estados: PENDING, SYNCING, SYNCED, FAILED_RETRYABLE, FAILED_PERMANENT.
 * Oferece botão de retry manual para FAILED_PERMANENT.
 */

import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, Alert,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDb, retryManual } from '../../src/db/offlineQueue';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { ThemeColors, spacing, useTheme } from '../../src/theme';
import { AppHeader, SyncQueueRow, Screen } from '../../src/ui';

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

const STATUS_LABELS_DARK: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:           { label: 'Pendente',        color: '#fde68a', bg: '#78350f' },
  SYNCING:           { label: 'Sincronizando',   color: '#93c5fd', bg: '#1e3a8a' },
  SYNCED:            { label: 'Sincronizado',    color: '#86efac', bg: '#14532d' },
  FAILED_RETRYABLE:  { label: 'Falha (retry)',   color: '#fdba74', bg: '#7c2d12' },
  FAILED_PERMANENT:  { label: 'Falha permanente',color: '#fca5a5', bg: '#7f1d1d' },
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

function buildSubtitle(item: QueueEntry): string {
  const parts = [
    `ID: ${item.clientOperationId.slice(0, 8)}…`,
    `Criado: ${formatDate(item.createdAt)}`,
  ];
  if (item.syncedAt) parts.push(`Sync: ${formatDate(item.syncedAt)}`);
  if (item.retryCount > 0) parts.push(`Tentativas: ${item.retryCount}`);
  if (item.nextRetryAt && item.status === 'FAILED_RETRYABLE') {
    parts.push(`Próx. retry: ${formatDate(item.nextRetryAt)}`);
  }
  if (item.errorMessage) parts.push(item.errorMessage);
  return parts.join(' · ');
}

export default function QueueScreen() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    pending: 0, syncing: 0, synced: 0, failedRetryable: 0, failedPermanent: 0,
  });
  const { sync } = useSyncQueue();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusLabels = isDark ? STATUS_LABELS_DARK : STATUS_LABELS;

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
    <Screen>
      <AppHeader
        title="Fila de Sincronização"
        subtitle="Puxe para forçar sincronização"
      />

      <View style={styles.statsBar}>
        {statKeys.map(({ key, label, value }) => {
          const meta = statusLabels[statusForKey[key]] ??
            { label, color: colors.text, bg: colors.background };
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => {
          const statusMeta = statusLabels[item.status] ??
            { label: item.status, color: colors.text, bg: colors.background };
          const isPermanent = item.status === 'FAILED_PERMANENT';

          return (
            <SyncQueueRow
              title={OP_LABELS[item.operationType] ?? item.operationType}
              statusLabel={statusMeta.label}
              statusColor={statusMeta.color}
              statusBg={statusMeta.bg}
              subtitle={buildSubtitle(item)}
              onRetry={isPermanent ? () => handleRetry(item.id) : undefined}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma operação na fila.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    statsBar: {
      flexDirection: 'row',
      gap: 6,
      padding: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statChip: { flex: 1, borderRadius: 8, padding: 7, alignItems: 'center' },
    statCount: { fontSize: 16, fontWeight: 'bold' },
    statLabel: { fontSize: 9, marginTop: 1, textAlign: 'center' },
    list: { paddingVertical: spacing.sm, flexGrow: 1 },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: 15 },
  });
}
