import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, TextInput,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { apiGet } from '../../src/api/apiClient';
import { useAuthStore } from '../../src/store/authStore';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';
import {
  StockBalanceItem,
  buildReplenishPayloads,
  pageContent,
} from '../../src/inventory/stockMovement';

interface LineState {
  prizeId: string;
  prizeName: string;
  currentQuantity: number;
  addQty: string;
}

export default function ReplenishStockScreen() {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const { accessToken, tenantId } = useAuthStore();
  const [lines, setLines] = useState<LineState[]>([]);
  const [assetNumber, setAssetNumber] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const loadBalances = useCallback(async () => {
    if (!machineId || !accessToken) {
      setError('Máquina ou sessão inválida.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(
        `/api/v1/inventory/balances?machineId=${encodeURIComponent(machineId)}&page=0&size=100`,
        { accessToken, tenantId: tenantId || undefined }
      );
      const body = await res.json();
      const balances = pageContent<StockBalanceItem>(body);
      setAssetNumber(balances[0]?.machineAssetNumber ?? '');
      setLines(
        balances.map((b) => ({
          prizeId: b.prizeId,
          prizeName: b.prizeName,
          currentQuantity: b.currentQuantity,
          addQty: '',
        }))
      );
      if (balances.length === 0) {
        setError(
          'Nenhum item de estoque cadastrado nesta máquina. Cadastre saldos no dashboard antes de repor pelo app.'
        );
      }
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar estoque. Verifique a conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }, [machineId, accessToken, tenantId]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  function setAddQty(prizeId: string, value: string) {
    const digits = value.replace(/\D/g, '');
    setLines((prev) =>
      prev.map((line) => (line.prizeId === prizeId ? { ...line, addQty: digits } : line))
    );
  }

  function bumpQty(prizeId: string, delta: number) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.prizeId !== prizeId) return line;
        const current = parseInt(line.addQty || '0', 10) || 0;
        const next = Math.max(0, current + delta);
        return { ...line, addQty: next === 0 ? '' : String(next) };
      })
    );
  }

  async function handleConfirm() {
    if (!machineId) return;

    const payloads = buildReplenishPayloads(
      machineId,
      lines.map((line) => ({
        prizeId: line.prizeId,
        quantityDelta: parseInt(line.addQty || '0', 10) || 0,
        notes: notes.trim() || undefined,
      }))
    );

    if (payloads.length === 0) {
      Alert.alert('Quantidade', 'Informe a quantidade a repor em pelo menos um item.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        payloads.map((payload) =>
          enqueue(uuidv4(), OPERATION_TYPES.REPLENISH_STOCK, payload)
        )
      );
      Alert.alert(
        'Reposição enfileirada',
        `${payloads.length} movimentação(ões) salvas localmente. Sincronizam ao reconectar.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'erro desconhecido';
      Alert.alert('Erro', 'Não foi possível salvar a reposição: ' + message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={styles.loadingText}>Carregando estoque…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar">
          <Text style={styles.back}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reposição de estoque</Text>
        <Text style={styles.subtitle}>
          {assetNumber
            ? `Máquina ${assetNumber}`
            : `Máquina ${machineId?.slice(0, 8) ?? ''}…`}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadBalances} style={styles.retryLink}>
            <Text style={styles.retryLinkText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={lines}
        keyExtractor={(item) => item.prizeId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          lines.length > 0 ? (
            <View style={styles.notesBlock}>
              <Text style={styles.label}>Observações (opcional)</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: reposição da visita da manhã"
                accessibilityLabel="Observações da reposição"
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Sem itens de estoque nesta máquina.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.prizeName}>{item.prizeName}</Text>
            <Text style={styles.currentQty}>Saldo atual: {item.currentQuantity}</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpQty(item.prizeId, -1)}
                accessibilityLabel={`Diminuir ${item.prizeName}`}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.qtyInput}
                value={item.addQty}
                onChangeText={(v) => setAddQty(item.prizeId, v)}
                keyboardType="number-pad"
                placeholder="0"
                accessibilityLabel={`Quantidade a repor de ${item.prizeName}`}
              />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpQty(item.prizeId, 1)}
                accessibilityLabel={`Aumentar ${item.prizeName}`}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {lines.length > 0 ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, saving && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={saving}
            accessibilityLabel="Confirmar reposição"
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>
              {saving ? 'Salvando…' : 'Confirmar reposição'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#6b7280', fontSize: 14 },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  back: { color: '#bfdbfe', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#bfdbfe', marginTop: 4 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    padding: 12,
    margin: 16,
    borderRadius: 6,
  },
  errorText: { color: '#b91c1c', fontSize: 13 },
  retryLink: { marginTop: 8 },
  retryLinkText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  notesBlock: { marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  prizeName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  currentQty: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, color: '#1e40af', fontWeight: '700' },
  qtyInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15, textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#86efac' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
