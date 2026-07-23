/**
 * Tela de perfil — conta do operador, sync e preferências de campo.
 */

import { View, StyleSheet, Alert, Switch, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { useCallback, useMemo, useState } from 'react';
import { getQueueStats, QueueStats } from '../../src/db/offlineQueue';
import { radius, spacing, useTheme } from '../../src/theme';
import { Screen, AppHeader, AppButton, AppText } from '../../src/ui';

const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.1';

export default function ProfileScreen() {
  const { userEmail, tenantId, userId, clearAuth } = useAuthStore();
  const { sync } = useSyncQueue();
  const { theme, colors, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const styles = useMemo(() => createStyles(colors.surface, colors.border), [colors.surface, colors.border]);
  const isDark = theme === 'dark';

  const refreshStats = useCallback(async () => {
    setStats(await getQueueStats());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStats();
    }, [refreshStats]),
  );

  async function handleSync() {
    setSyncing(true);
    try {
      await sync();
      const s = await getQueueStats();
      setStats(s);
      const waiting = s.pending + s.syncing + s.failedRetryable;
      const failed = s.failedPermanent;
      Alert.alert(
        'Sincronização concluída',
        failed > 0
          ? `${waiting} ainda aguardando · ${failed} com falha permanente (veja a Fila).`
          : waiting > 0
            ? `${waiting} operação(ões) ainda aguardando envio.`
            : 'Tudo enviado ao servidor.',
      );
    } finally {
      setSyncing(false);
    }
  }

  function handleLogout() {
    const waiting = stats
      ? stats.pending + stats.syncing + stats.failedRetryable + stats.failedPermanent
      : 0;
    Alert.alert(
      'Sair',
      waiting > 0
        ? `Há ${waiting} operação(ões) na fila. Sincronize antes de sair se puder — dados locais não são enviados no logout.`
        : 'Deseja sair da conta neste aparelho?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: () => {
            clearAuth();
            router.replace('/login');
          },
        },
      ],
    );
  }

  const waitingCount = stats
    ? stats.pending + stats.syncing + stats.failedRetryable
    : null;

  return (
    <Screen>
      <AppHeader
        title="Perfil"
        subtitle={userEmail || 'Conta do operador'}
        rightSlot={
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <AppText variant="title" color={colors.headerText}>
              {(userEmail || 'U')[0].toUpperCase()}
            </AppText>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            Aparência
          </AppText>
          <View style={styles.themeRow}>
            <View style={styles.themeLabels}>
              <AppText variant="body">Tema escuro</AppText>
              <AppText variant="caption" color={colors.textMuted} style={styles.themeHint}>
                {isDark ? 'Ativo' : 'Desativado'} — igual ao web
              </AppText>
            </View>
            <Switch
              value={isDark}
              onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
              trackColor={{ false: colors.border, true: colors.primaryMuted }}
              thumbColor={isDark ? colors.primary : colors.surface}
              accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            Informações
          </AppText>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <AppText variant="body">Tenant ID</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {tenantId?.slice(0, 8) || '—'}…
            </AppText>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <AppText variant="body">Usuário</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {userId?.slice(0, 8) || '—'}
            </AppText>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <AppText variant="body">Versão</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {APP_VERSION}
            </AppText>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <AppText variant="body">Fila local</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              {waitingCount == null
                ? '—'
                : waitingCount > 0
                  ? `${waitingCount} aguardando`
                  : 'Em dia'}
            </AppText>
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            Campo
          </AppText>
          <AppButton
            label="Repor estoque (QR)"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/qr-scan',
                params: { returnTo: 'stock' },
              })
            }
          />
        </View>

        <View style={styles.section}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            Sincronização
          </AppText>
          <AppButton
            label={syncing ? 'Sincronizando…' : 'Sincronizar agora'}
            onPress={handleSync}
            loading={syncing}
            style={styles.sectionButton}
          />
          <AppButton
            label="Abrir fila de operações"
            variant="secondary"
            onPress={() => router.push('/(tabs)/queue')}
          />
        </View>

        <AppButton
          label="Sair da conta"
          variant="danger"
          onPress={handleLogout}
          style={styles.logoutButton}
        />
      </ScrollView>
    </Screen>
  );
}

function createStyles(surface: string, border: string) {
  return StyleSheet.create({
    scrollContent: { paddingBottom: spacing.xl },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      backgroundColor: surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: border,
    },
    sectionTitle: {
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    themeLabels: { flex: 1 },
    themeHint: { marginTop: spacing.xs },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
    },
    rowLast: { borderBottomWidth: 0 },
    sectionButton: { marginBottom: spacing.sm },
    logoutButton: {
      marginHorizontal: spacing.md,
      marginTop: spacing.lg,
    },
  });
}
