/**
 * Checklist da visita — itens a verificar em cada máquina do ponto.
 * Suporta modo offline: cada item é enfileirado individualmente.
 */

import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Switch,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';

interface ChecklistItem {
  key: string;
  label: string;
  checked: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: 'claw_working', label: 'Garra funcionando corretamente', checked: false },
  { key: 'prizes_visible', label: 'Pelúcias visíveis e atraentes', checked: false },
  { key: 'payment_working', label: 'Sistema de pagamento operacional', checked: false },
  { key: 'display_clean', label: 'Display e gabinete limpos', checked: false },
  { key: 'door_sealed', label: 'Porta travada e sem folga', checked: false },
  { key: 'lights_working', label: 'Iluminação interna funcionando', checked: false },
  { key: 'qr_code_visible', label: 'QR Code visível e legível', checked: false },
  { key: 'stock_adequate', label: 'Estoque adequado (>20% capacidade)', checked: false },
];

export default function ChecklistScreen() {
  const { visitId, pointName } = useLocalSearchParams<{
    visitId: string; pointName: string;
  }>();
  const [items, setItems] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [saving, setSaving] = useState(false);

  function toggleItem(key: string) {
    setItems(prev =>
      prev.map(item => item.key === key ? { ...item, checked: !item.checked } : item)
    );
  }

  const checkedCount = items.filter(i => i.checked).length;
  const allChecked = checkedCount === items.length;

  async function handleSaveChecklist() {
    setSaving(true);
    try {
      // Enfileira o resultado do checklist completo como uma única operação
      await enqueue(uuidv4(), OPERATION_TYPES.ADD_CHECKLIST_ITEM, {
        visitId,
        items: items.map(i => ({ key: i.key, checked: i.checked })),
        completedAt: new Date().toISOString(),
      });

      router.replace({
        pathname: '/visits/complete',
        params: { visitId, pointName },
      });
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível salvar o checklist: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    Alert.alert(
      'Pular checklist?',
      'O checklist não foi completado. Deseja continuar mesmo assim?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pular',
          style: 'destructive',
          onPress: () => router.replace({
            pathname: '/visits/complete',
            params: { visitId, pointName },
          }),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Checklist da Visita</Text>
        <Text style={styles.subtitle}>{pointName}</Text>
        <Text style={styles.progress}>
          {checkedCount}/{items.length} itens verificados
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(checkedCount / items.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, item.checked && styles.itemChecked]}
            onPress={() => toggleItem(item.key)}
            accessibilityLabel={`${item.label}: ${item.checked ? 'verificado' : 'não verificado'}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
          >
            <Switch
              value={item.checked}
              onValueChange={() => toggleItem(item.key)}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={item.checked ? '#16a34a' : '#f3f4f6'}
              accessibilityLabel={item.label}
            />
            <Text style={[styles.itemLabel, item.checked && styles.itemLabelChecked]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityLabel="Pular checklist"
        >
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, saving && styles.buttonDisabled]}
          onPress={handleSaveChecklist}
          disabled={saving}
          accessibilityLabel="Salvar checklist e continuar"
          accessibilityRole="button"
        >
          <Text style={styles.nextText}>
            {saving ? 'Salvando...' : allChecked ? 'Concluir Checklist ✓' : 'Salvar e Continuar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#bfdbfe', marginTop: 4 },
  progress: { fontSize: 13, color: '#93c5fd', marginTop: 8 },
  progressBar: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, marginTop: 6,
  },
  progressFill: {
    height: 4, backgroundColor: '#34d399', borderRadius: 2,
  },
  list: { padding: 16, gap: 8 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemChecked: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  itemLabel: { flex: 1, fontSize: 14, color: '#374151' },
  itemLabelChecked: { color: '#166534' },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  skipButton: {
    flex: 1, borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#d1d5db',
  },
  skipText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
  nextButton: {
    flex: 2, backgroundColor: '#2563eb', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  nextText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
