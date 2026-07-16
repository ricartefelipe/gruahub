/**
 * Tela de perfil — exibe dados do usuário autenticado e permite logout.
 */

import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncQueue } from '../../src/hooks/useSyncQueue';
import { useState } from 'react';
import { getQueueStats } from '../../src/db/offlineQueue';

export default function ProfileScreen() {
  const { userEmail, tenantId, userId, clearAuth } = useAuthStore();
  const { sync } = useSyncQueue();
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<{ pending: number; failed: number } | null>(null);

  async function handleSync() {
    setSyncing(true);
    try {
      await sync();
      const s = await getQueueStats();
      setStats(s);
      Alert.alert(
        'Sincronização concluída',
        `Pendentes: ${s.pending} | Falhas: ${s.failed}`
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
        <Text style={styles.sectionTitle}>Informações</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tenant ID</Text>
          <Text style={styles.rowValue}>{tenantId?.slice(0, 8) || '—'}…</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Versão</Text>
          <Text style={styles.rowValue}>1.0.0-mvp</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Modo</Text>
          <Text style={styles.rowValue}>📵 Offline-first</Text>
        </View>
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
            {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar Agora'}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    backgroundColor: '#1e40af', alignItems: 'center',
    padding: 32, paddingTop: 70,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, color: '#fff', fontWeight: 'bold' },
  email: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 12 },
  userId: { color: '#bfdbfe', fontSize: 12, marginTop: 4 },
  section: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280',
    textTransform: 'uppercase', marginBottom: 10 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  rowLabel: { fontSize: 14, color: '#374151' },
  rowValue: { fontSize: 14, color: '#6b7280' },
  syncButton: {
    backgroundColor: '#2563eb', borderRadius: 8, padding: 12,
    alignItems: 'center', marginBottom: 8,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  syncButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  queueButton: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 12, alignItems: 'center',
  },
  queueButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  logoutButton: {
    margin: 16, backgroundColor: '#fee2e2', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 24,
  },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});
