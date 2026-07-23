import {
  View, TextInput, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform,
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

export default function CompleteVisitScreen() {
  const { visitId, pointName, machineId: machineIdParam } = useLocalSearchParams<{
    visitId: string; pointName: string; machineId?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [cashCollectedCents, setCashCollectedCents] = useState('');
  const [cashNotes, setCashNotes] = useState('');
  const [machineId, setMachineId] = useState(machineIdParam ?? '');
  const [completing, setCompleting] = useState(false);

  function parseCentavos(value: string): number {
    const digits = value.replace(/\D/g, '');
    return parseInt(digits, 10) || 0;
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const ops: Promise<void>[] = [];
      const cents = parseCentavos(cashCollectedCents);

      if (cents > 0 && machineId) {
        ops.push(
          enqueue(uuidv4(), OPERATION_TYPES.CASH_COLLECTION, {
            visitId,
            machineId,
            amountCents: cents,
            notes: cashNotes.trim(),
          })
        );
      }

      ops.push(
        enqueue(uuidv4(), OPERATION_TYPES.COMPLETE_VISIT, {
          visitId,
          checkoutAt: new Date().toISOString(),
          cashCollectedCents: cents,
        })
      );

      await Promise.all(ops);

      const tip =
        cents > 0 && !machineId
          ? ' Sangria registrada na visita; para cash_collection separado, identifique a máquina via QR.'
          : '';

      Alert.alert(
        'Visita concluída',
        `Dados salvos localmente e serão sincronizados ao reconectar.${tip}`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      Alert.alert('Erro', 'Falha ao concluir a visita: ' + message);
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
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AppHeader title="Concluir Visita" subtitle="Sangria e finalização" />
        <VisitStepHeader step={4} pointName={pointName ?? ''} />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <AppText variant="title" style={styles.sectionTitle}>
              Sangria (coleção de caixa)
            </AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
              Valor coletado
            </AppText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={cashCollectedCents ? formatCurrency(cashCollectedCents) : ''}
              onChangeText={(v) => setCashCollectedCents(v.replace(/\D/g, ''))}
              placeholder="R$ 0,00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Valor coletado em reais"
            />
            <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
              Observações da sangria
            </AppText>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={cashNotes}
              onChangeText={setCashNotes}
              placeholder="Ex: Cédulas contadas na presença do responsável"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              accessibilityLabel="Observações da sangria"
            />
            <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
              Máquina (opcional para cash_collection)
            </AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.hint}>
              {machineId
                ? `Máquina: ${machineId.slice(0, 8)}…`
                : 'Sem máquina: o valor ainda vai na conclusão da visita.'}
            </AppText>
            <AppButton
              label={machineId ? 'Trocar máquina (QR)' : 'Identificar máquina (QR)'}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/qr-scan',
                  params: { returnTo: 'complete', visitId, pointName },
                })
              }
            />
            {machineId ? (
              <AppButton
                label="Limpar máquina"
                variant="ghost"
                onPress={() => setMachineId('')}
                style={styles.clearMachine}
              />
            ) : null}
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <AppText variant="title" style={styles.sectionTitle}>
              Reposição de estoque
            </AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.hint}>
              Escaneie o QR da máquina para carregar os itens e registrar a reposição (fila offline).
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
            {machineId ? (
              <AppButton
                label="Usar máquina já identificada"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/stock/replenish',
                    params: { machineId, visitId, pointName },
                  })
                }
                style={styles.secondaryGap}
              />
            ) : null}
          </View>

          <View style={[styles.summary, { backgroundColor: colors.surface }]}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.summaryTitle}>
              Resumo da visita
            </AppText>
            <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
              <AppText variant="caption" color={colors.textSecondary}>
                Sangria
              </AppText>
              <AppText variant="caption" style={styles.summaryValue}>
                {cashCollectedCents
                  ? formatCurrency(cashCollectedCents)
                  : 'Não informada'}
              </AppText>
            </View>
            <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
              <AppText variant="caption" color={colors.textSecondary}>
                Status sync
              </AppText>
              <AppText variant="caption" color={colors.warningBannerText} style={styles.summaryValue}>
                Pendente (fila local)
              </AppText>
            </View>
          </View>

          <AppButton
            label={completing ? 'Finalizando...' : 'Concluir'}
            onPress={handleComplete}
            loading={completing}
            disabled={completing}
            style={[styles.completeButton, { backgroundColor: colors.success }]}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xl },
    section: {
      margin: spacing.md,
      marginBottom: 0,
      borderRadius: 12,
      padding: spacing.md,
    },
    sectionTitle: { marginBottom: 12 },
    label: { fontWeight: '600', marginBottom: 6, marginTop: 10 },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
    },
    textarea: { minHeight: 64 },
    hint: { lineHeight: 18, marginBottom: 12 },
    clearMachine: { marginTop: spacing.sm },
    secondaryGap: { marginTop: 10 },
    summary: {
      margin: spacing.md,
      borderRadius: 12,
      padding: spacing.md,
    },
    summaryTitle: { fontWeight: '700', marginBottom: 10, color: colors.text },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
    },
    summaryValue: { fontWeight: '600' },
    completeButton: {
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
  });
}
