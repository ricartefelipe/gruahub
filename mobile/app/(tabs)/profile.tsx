/**
 * Tela de perfil — exibe dados do usuário autenticado e permite logout.
 */

import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { useMemo, useState } from 'react';
import { getQueueStats, QueueStats } from '../../src/db/offlineQueue';
import { ThemeColors, useTheme } from '../../src/theme';

export default function ProfileScreen() {
  const { userEmail, tenantId, userId, clearAuth } = useAuthStore();
  const { sync } = useSyncQueue();
  const { theme, colors, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(userEmail || 'U')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.email}>{userEmail || 'Usuário'}</Text>
        <Text style={styles.userId}>ID: {userId?.slice(0, 8) || '—'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aparência</Text>
        <View style={styles.themeRow}>
          <View style={styles.themeLabels}>
            <Text style={styles.rowLabel}>Tema escuro</Text>
            <Text style={styles.themeHint}>
              {isDark ? 'Ativo' : 'Desativado'} — igual ao web
            </Text>
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
        <Text style={styles.sectionTitle}>Informações</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tenant ID</Text>
          <Text style={styles.rowValue}>{tenantId?.slice(0, 8) || '—'}…</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Versão</Text>
          <Text style={styles.rowValue}>1.0.0-mvp</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Modo</Text>
          <Text style={styles.rowValue}>Offline-first</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Campo</Text>
        <TouchableOpacity
          style={styles.queueButton}
          onPress={() =>
            router.push({
              pathname: '/qr-scan',
              params: { returnTo: 'stock' },
            })
          }
          accessibilityLabel="Escanear QR para reposição de estoque"
          accessibilityRole="button"
        >
          <Text style={styles.queueButtonText}>Repor estoque (QR) →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sincronização</Text>
        <TouchableOpacity
          style={[styles.syncButton, syncing && styles.buttonDisabled]}
          onPress={handleSync}
          disabled={syncing}
          accessibilityLabel="Forçar sincronização com o servidor"
          accessibilityRole="button"
        >
          <Text style={styles.syncButtonText}>
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.queueButton}
          onPress={() => router.push('/(tabs)/queue')}
          accessibilityLabel="Ver fila de sincronização"
          accessibilityRole="button"
        >
          <Text style={styles.queueButtonText}>Ver Fila de Operações →</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityLabel="Sair da conta"
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>Sair da Conta</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.header,
      alignItems: 'center',
      padding: 32,
      paddingTop: 70,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 28, color: colors.headerText, fontWeight: 'bold' },
    email: { color: colors.headerText, fontSize: 16, fontWeight: '600', marginTop: 12 },
    userId: { color: colors.headerMuted, fontSize: 12, marginTop: 4 },
    section: {
      margin: 16,
      marginBottom: 0,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    themeLabels: { flex: 1 },
    themeHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontSize: 14, color: colors.text },
    rowValue: { fontSize: 14, color: colors.textSecondary },
    syncButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
      marginBottom: 8,
    },
    buttonDisabled: { backgroundColor: colors.primaryMuted },
    syncButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    queueButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    },
    queueButtonText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
    logoutButton: {
      margin: 16,
      backgroundColor: colors.dangerBg,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    logoutText: { color: colors.dangerText, fontWeight: '700', fontSize: 15 },
  });
}
