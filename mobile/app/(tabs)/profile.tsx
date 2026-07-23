/**
 * Tela de perfil — exibe dados do usuário autenticado e permite logout.
 */

import { View, StyleSheet, Alert, Switch, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { useMemo, useState } from 'react';
import { getQueueStats, QueueStats } from '../../src/db/offlineQueue';
import { radius, spacing, useTheme } from '../../src/theme';
import { Screen, AppHeader, AppButton, AppText } from '../../src/ui';

export default function ProfileScreen() {
  const { userEmail, tenantId, userId, clearAuth } = useAuthStore();
  const { sync } = useSyncQueue();
  const { theme, colors, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [, setStats] = useState<QueueStats | null>(null);
  const styles = useMemo(() => createStyles(colors.surface, colors.border), [colors.surface, colors.border]);
  const isDark = theme === 'dark';

  async function handleSync() {
    setSyncing(true);
    try {
      await sync();
      const s = await getQueueStats();
      setStats(s);
      const failed = s.failedRetryable + s.failedPermanent;
      Alert.alert(
        'Sincronização concluída',
        `Pendentes: ${s.pending} | Falhas: ${failed}`
      );
    } finally {
      setSyncing(false);
    }
  }

  function handleLogout() {
    Alert.alert('Sair', 'Tem certeza que deseja sair? Operações offline pendentes serão perdidas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          clearAuth();
          router.replace('/login');
        },
      },
    ]);
  }

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
              1.0.0-mvp
            </AppText>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <AppText variant="body">Modo</AppText>
            <AppText variant="body" color={colors.textSecondary}>
              Offline-first
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
            label={syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            onPress={handleSync}
            loading={syncing}
            style={styles.sectionButton}
          />
          <AppButton
            label="Ver Fila de Operações"
            variant="secondary"
            onPress={() => router.push('/(tabs)/queue')}
          />
        </View>

        <AppButton
          label="Sair da Conta"
          variant="secondary"
          onPress={handleLogout}
          style={[
            styles.logoutButton,
            { backgroundColor: colors.dangerBg, borderColor: colors.dangerBg },
          ]}
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
