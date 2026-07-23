/**
 * Tela de Fila de Sincronização — estados claros, filtros e retry manual.
 * PENDING | SYNCING | SYNCED | FAILED_RETRYABLE | FAILED_PERMANENT
 */

import {
  View, FlatList, StyleSheet, Pressable,
  RefreshControl, Alert,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getDb, retryManual } from '../../src/db/offlineQueue';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { ThemeColors, spacing, radius, touchTarget, useTheme } from '../../src/theme';
import {
  AppHeader, SyncQueueRow, Screen, EmptyState, AppButton, AppText,
} from '../../src/ui';

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

type FilterKey = 'all' | 'waiting' | 'failed';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:           { label: 'Pendente',         color: '#92400e', bg: '#fef3c7' },
  SYNCING:           { label: 'Sincronizando',    color: '#1e40af', bg: '#dbeafe' },
  SYNCED:            { label: 'Sincronizado',     color: '#166534', bg: '#dcfce7' },
  FAILED_RETRYABLE:  { label: 'Nova tentativa',   color: '#c2410c', bg: '#ffedd5' },
  FAILED_PERMANENT:  { label: 'Falha permanente', color: '#991b1b', bg: '#fee2e2' },
};

const STATUS_LABELS_DARK: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:           { label: 'Pendente',         color: '#fde68a', bg: '#78350f' },
  SYNCING:           { label: 'Sincronizando',    color: '#93c5fd', bg: '#1e3a8a' },
  SYNCED:            { label: 'Sincronizado',     color: '#86efac', bg: '#14532d' },
  FAILED_RETRYABLE:  { label: 'Nova tentativa',   color: '#fdba74', bg: '#7c2d12' },
  FAILED_PERMANENT:  { label: 'Falha permanente', color: '#fca5a5', bg: '#7f1d1d' },
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
    `Criado: ${formatDate(item.createdAt)}`,
  ];
  if (item.syncedAt) parts.push(`Sync: ${formatDate(item.syncedAt)}`);
  if (item.retryCount > 0) parts.push(`Tentativas: ${item.retryCount}`);
  if (item.nextRetryAt && item.status === 'FAILED_RETRYABLE') {
    parts.push(`Próxima tentativa: ${formatDate(item.nextRetryAt)}`);
  }
  if (item.status === 'FAILED_PERMANENT') {
    parts.push(
      item.errorMessage
        ? `Erro: ${item.errorMessage}`
        : 'Não será reenviada automaticamente. Use Re-tentar se o problema foi corrigido.',
    );
  } else if (item.errorMessage) {
    parts.push(item.errorMessage);
  }
  return parts.join(' · ');
}

function matchesFilter(status: string, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'waiting':
      return status === 'PENDING' || status === 'SYNCING' || status === 'FAILED_RETRYABLE';
    case 'failed':
      return status === 'FAILED_RETRYABLE' || status === 'FAILED_PERMANENT';
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export default function QueueScreen() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
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
        case 'PENDING':
          s.pending = r.count;
          break;
        case 'SYNCING':
          s.syncing = r.count;
          break;
        case 'SYNCED':
          s.synced = r.count;
          break;
        case 'FAILED_RETRYABLE':
          s.failedRetryable = r.count;
          break;
        case 'FAILED_PERMANENT':
          s.failedPermanent = r.count;
          break;
        default:
          break;
      }
    }
    setStats(s);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await sync();
      await loadEntries();
    } finally {
      setSyncing(false);
    }
  }, [sync, loadEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await runSync();
    setRefreshing(false);
  }, [runSync]);

  async function handleRetry(id: string) {
    Alert.alert(
      'Tentar novamente?',
      'A operação volta para a fila e será enviada na próxima sincronização.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Re-tentar',
          onPress: async () => {
            await retryManual(id);
            await loadEntries();
            await runSync();
          },
        },
      ]
    );
  }

  const waitingCount = stats.pending + stats.syncing + stats.failedRetryable;
  const failedCount = stats.failedRetryable + stats.failedPermanent;

  const filtered = useMemo(
    () => entries.filter((e) => matchesFilter(e.status, filter)),
    [entries, filter],
  );

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'Todas', count: entries.length },
    { key: 'waiting', label: 'Aguardando', count: waitingCount },
    { key: 'failed', label: 'Falhas', count: failedCount },
  ];

  return (
    <Screen>
      <AppHeader
        title="Fila de sincronização"
        subtitle="Operações salvas no aparelho até o envio ao servidor"
      />

      <View style={styles.toolbar}>
        <AppButton
          label={syncing ? 'Sincronizando…' : 'Sincronizar agora'}
          onPress={() => { void runSync(); }}
          loading={syncing}
          style={styles.syncBtn}
        />
        <AppText variant="caption" color={colors.textMuted}>
          {waitingCount > 0
            ? `${waitingCount} aguardando envio`
            : failedCount > 0
              ? `${failedCount} com falha — revise abaixo`
              : 'Tudo sincronizado'}
        </AppText>
      </View>

      <View style={styles.filterBar}>
        {filters.map(({ key, label, count }) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filtro ${label}`}
              onPress={() => setFilter(key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={active ? colors.headerText : colors.text}
              >
                {label} ({count})
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => {
          const statusMeta = statusLabels[item.status] ??
            { label: item.status, color: colors.text, bg: colors.background };
          const canRetry = item.status === 'FAILED_PERMANENT';

          return (
            <SyncQueueRow
              title={OP_LABELS[item.operationType] ?? item.operationType}
              statusLabel={statusMeta.label}
              statusColor={statusMeta.color}
              statusBg={statusMeta.bg}
              subtitle={buildSubtitle(item)}
              onRetry={canRetry ? () => handleRetry(item.id) : undefined}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title={
              filter === 'failed'
                ? 'Nenhuma falha na fila'
                : filter === 'waiting'
                  ? 'Nada aguardando envio'
                  : 'Fila vazia'
            }
            description={
              filter === 'all'
                ? 'As operações feitas offline aparecem aqui até sincronizarem.'
                : 'Puxe para atualizar ou toque em Sincronizar agora.'
            }
            actionLabel="Sincronizar agora"
            onAction={() => { void runSync(); }}
          />
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toolbar: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    syncBtn: { alignSelf: 'stretch' },
    filterBar: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterChip: {
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.md,
                  borderRadius: radius.full,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { paddingVertical: spacing.sm, flexGrow: 1 },
  });
}
