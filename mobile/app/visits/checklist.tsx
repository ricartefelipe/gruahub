/**
 * Checklist da visita — itens a verificar em cada máquina do ponto.
 * Suporta modo offline: cada item é enfileirado individualmente.
 */

import {
  View, FlatList, StyleSheet, Alert, Switch, Pressable,
} from 'react-native';
import { useMemo, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';
import { spacing, useTheme } from '../../src/theme';
import {
  Screen,
  AppHeader,
  VisitStepHeader,
  AppButton,
  AppText,
} from '../../src/ui';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(), []);
  const [items, setItems] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [saving, setSaving] = useState(false);

  function toggleItem(key: string) {
    setItems(prev =>
      prev.map(item => item.key === key ? { ...item, checked: !item.checked } : item)
    );
  }

  const checkedCount = items.filter(i => i.checked).length;
  const allChecked = checkedCount === items.length;

  function goToStockStep() {
    router.replace({
      pathname: '/visits/stock-step',
      params: { visitId, pointName },
    });
  }

  async function handleSaveChecklist() {
    setSaving(true);
    try {
      await enqueue(uuidv4(), OPERATION_TYPES.ADD_CHECKLIST_ITEM, {
        visitId,
        items: items.map(i => ({ key: i.key, checked: i.checked })),
        completedAt: new Date().toISOString(),
      });

      goToStockStep();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      Alert.alert('Erro', 'Não foi possível salvar o checklist: ' + message);
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
          onPress: goToStockStep,
        },
      ]
    );
  }

  return (
    <Screen>
      <AppHeader title="Checklist da Visita" subtitle="Verificação no ponto" />
      <VisitStepHeader step={2} pointName={pointName ?? ''} />

      <View style={styles.progressBlock}>
        <AppText variant="caption" color={colors.textSecondary}>
          {checkedCount}/{items.length} itens verificados
        </AppText>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(checkedCount / items.length) * 100}%`,
                backgroundColor: colors.success,
              },
            ]}
          />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.item,
              { backgroundColor: colors.surface, borderColor: colors.border },
              item.checked && styles.itemChecked,
            ]}
            onPress={() => toggleItem(item.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            accessibilityLabel={`${item.label}: ${item.checked ? 'verificado' : 'não verificado'}`}
          >
            <Switch
              value={item.checked}
              onValueChange={() => toggleItem(item.key)}
              trackColor={{ false: colors.border, true: '#bbf7d0' }}
              thumbColor={item.checked ? colors.success : colors.background}
              accessibilityLabel={item.label}
            />
            <AppText
              variant="body"
              color={item.checked ? '#166534' : colors.text}
              style={styles.itemLabel}
            >
              {item.label}
            </AppText>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <AppButton
          label="Pular"
          variant="secondary"
          onPress={handleSkip}
          style={styles.skipButton}
        />
        <AppButton
          label={
            saving
              ? 'Salvando...'
              : allChecked
                ? 'Concluir Checklist ✓'
                : 'Salvar e Continuar'
          }
          onPress={handleSaveChecklist}
          loading={saving}
          disabled={saving}
          style={styles.nextButton}
        />
      </View>
    </Screen>
  );
}

function createStyles() {
  return StyleSheet.create({
    progressBlock: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
    },
    progressFill: {
      height: 4,
      borderRadius: 2,
    },
    list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
    },
    itemChecked: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
    itemLabel: { flex: 1 },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: spacing.md,
      borderTopWidth: 1,
    },
    skipButton: { flex: 1 },
    nextButton: { flex: 2 },
  });
}
