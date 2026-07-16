/**
 * Conclusão da visita — sangria, reposição e checkout.
 * Todas as operações vão para a fila offline.
 */

import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';

export default function CompleteVisitScreen() {
  const { visitId, pointName } = useLocalSearchParams<{
    visitId: string; pointName: string;
  }>();

  // Sangria (cash collection)
  const [cashCollectedCents, setCashCollectedCents] = useState('');
  const [cashNotes, setCashNotes] = useState('');

  // Reposição
  const [replenishSku, setReplenishSku] = useState('');
  const [replenishQty, setReplenishQty] = useState('');
  const replenishments: Array<{ sku: string; qty: number }> = [];

  const [completing, setCompleting] = useState(false);

  function parseCentavos(value: string): number {
    // Aceita "R$ 12,50" ou "12.50" ou "1250"
    const digits = value.replace(/\D/g, '');
    return parseInt(digits, 10) || 0;
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const ops: Promise<void>[] = [];

      // Sangria
      const cents = parseCentavos(cashCollectedCents);
      if (cents > 0) {
        ops.push(
          enqueue(uuidv4(), OPERATION_TYPES.CASH_COLLECTION, {
            visitId,
            amountCents: cents,
            notes: cashNotes.trim(),
            collectedAt: new Date().toISOString(),
          })
        );
      }

      // Checkout da visita
      ops.push(
        enqueue(uuidv4(), OPERATION_TYPES.COMPLETE_VISIT, {
          visitId,
          checkoutAt: new Date().toISOString(),
          cashCollectedCents: cents,
        })
      );

      await Promise.all(ops);

      Alert.alert(
        'Visita concluída!',
        'Os dados foram salvos localmente e serão sincronizados ao reconectar.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err: any) {
      Alert.alert('Erro', 'Falha ao concluir a visita: ' + err.message);
    } finally {
      setCompleting(false);
    }
  }

  function formatCurrency(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const cents = parseInt(digits, 10);
    return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Concluir Visita</Text>
          <Text style={styles.subtitle}>{pointName}</Text>
        </View>

        {/* Sangria */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Sangria (Coleção de Caixa)</Text>
          <Text style={styles.label}>Valor coletado</Text>
          <TextInput
            style={styles.input}
            value={cashCollectedCents ? formatCurrency(cashCollectedCents) : ''}
            onChangeText={(v) => setCashCollectedCents(v.replace(/\D/g, ''))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
            accessibilityLabel="Valor coletado em reais"
          />
          <Text style={styles.label}>Observações da sangria</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={cashNotes}
            onChangeText={setCashNotes}
            placeholder="Ex: Cédulas contadas na presença do responsável"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            accessibilityLabel="Observações da sangria"
          />
        </View>

        {/* Reposição — simplificada: apenas indicar o SKU e qtd */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📦 Reposição de Estoque</Text>
          <Text style={styles.hint}>
            Para registrar reposição, use a tela de QR Code para identificar a máquina e
            registrar os itens reposto. A reposição será sincronizada com o inventário.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/qr-scan')}
            accessibilityLabel="Escanear QR Code da máquina para registrar reposição"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>📷 Escanear QR Code da Máquina</Text>
          </TouchableOpacity>
        </View>

        {/* Sumário */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Resumo da Visita</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Sangria</Text>
            <Text style={styles.summaryValue}>
              {cashCollectedCents
                ? formatCurrency(cashCollectedCents)
                : 'Não informada'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status sync</Text>
            <Text style={[styles.summaryValue, styles.syncBadge]}>📵 Pendente</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.completeButton, completing && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={completing}
          accessibilityLabel="Finalizar visita e salvar offline"
          accessibilityRole="button"
        >
          <Text style={styles.completeButtonText}>
            {completing ? 'Finalizando...' : '✓ Finalizar Visita'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#bfdbfe', marginTop: 4 },
  section: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db',
    borderRadius: 8, padding: 12, fontSize: 15, color: '#111827',
  },
  textarea: { minHeight: 64 },
  hint: { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 12 },
  secondaryButton: {
    borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, padding: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  summary: {
    margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  summaryLabel: { fontSize: 13, color: '#6b7280' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  syncBadge: { color: '#92400e' },
  completeButton: {
    margin: 16, backgroundColor: '#16a34a', borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#86efac' },
  completeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
