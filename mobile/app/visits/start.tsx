import { View, TextInput, StyleSheet, Alert, ScrollView } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';
import {
  CheckinLocation,
  getCheckinLocation,
} from '../../src/location/getCheckinLocation';
import { spacing, useTheme } from '../../src/theme';
import {
  Screen,
  AppHeader,
  VisitStepHeader,
  AppButton,
  AppText,
} from '../../src/ui';

export default function StartVisitScreen() {
  const { pointId, pointName } = useLocalSearchParams<{ pointId: string; pointName: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [responsibleName, setResponsibleName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [location, setLocation] = useState<CheckinLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGpsLoading(true);
      const result = await getCheckinLocation();
      if (!cancelled) {
        setLocation(result);
        setGpsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function proceedCheckin(loc: CheckinLocation) {
    setLoading(true);
    try {
      const clientOperationId = uuidv4();
      const visitId = uuidv4();

      await enqueue(clientOperationId, OPERATION_TYPES.START_VISIT, {
        visitId,
        operatingPointId: pointId,
        responsibleName: responsibleName.trim(),
        notes: notes.trim(),
        checkinAt: new Date().toISOString(),
        checkinLatitude: loc.latitude,
        checkinLongitude: loc.longitude,
      });

      router.replace({
        pathname: '/visits/checklist',
        params: { visitId, clientOperationId, pointName },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      Alert.alert('Erro', 'Não foi possível iniciar a visita. ' + message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin() {
    if (!responsibleName.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do responsável no estabelecimento.');
      return;
    }

    let loc = location;
    if (!loc || gpsLoading) {
      setGpsLoading(true);
      loc = await getCheckinLocation();
      setLocation(loc);
      setGpsLoading(false);
    }

    if (loc.status !== 'ok') {
      Alert.alert(
        'GPS indisponível',
        loc.detail + '\n\nDeseja continuar o check-in sem coordenadas?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar sem GPS', onPress: () => proceedCheckin(loc!) },
        ]
      );
      return;
    }

    await proceedCheckin(loc);
  }

  const gpsLabel = gpsLoading
    ? 'Obtendo GPS…'
    : location?.status === 'ok'
      ? `GPS: ${location.detail}`
      : location?.status === 'denied'
        ? 'GPS: permissão negada'
        : 'GPS: indisponível';

  const gpsTone =
    location?.status === 'ok'
      ? styles.gpsOk
      : location?.status === 'denied'
        ? styles.gpsWarn
        : styles.gpsMuted;

  return (
    <Screen>
      <AppHeader title="Iniciar Visita" subtitle="Check-in no ponto" />
      <VisitStepHeader step={1} pointName={pointName ?? ''} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.gpsBanner, gpsTone]} accessibilityLiveRegion="polite">
          <AppText variant="caption" style={styles.gpsText}>
            {gpsLabel}
          </AppText>
          {!gpsLoading && location?.status !== 'ok' ? (
            <AppButton
              label="Tentar novamente"
              variant="ghost"
              onPress={async () => {
                setGpsLoading(true);
                const result = await getCheckinLocation();
                setLocation(result);
                setGpsLoading(false);
              }}
              style={styles.gpsRetry}
            />
          ) : null}
        </View>

        <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
          Nome do Responsável *
        </AppText>
        <TextInput
          style={styles.input}
          value={responsibleName}
          onChangeText={setResponsibleName}
          placeholder="Nome do responsável no local"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Nome do responsável"
          returnKeyType="next"
        />

        <AppText variant="caption" color={colors.textSecondary} style={styles.label}>
          Observações
        </AppText>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Observações da visita (opcional)"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Observações da visita"
        />

        <View style={styles.offlineNote}>
          <AppText variant="caption" color={colors.warningBannerText}>
            Modo offline-first: a visita vai para a fila local e sincroniza ao reconectar.
          </AppText>
        </View>

        <AppButton
          label={loading ? 'Iniciando...' : 'Confirmar Check-in'}
          onPress={handleCheckin}
          loading={loading}
          disabled={loading}
          style={styles.cta}
        />
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    form: { padding: spacing.md, paddingBottom: spacing.xl },
    gpsBanner: {
      borderRadius: 8,
      padding: spacing.sm + 4,
      borderWidth: 1,
      marginBottom: spacing.xs,
    },
    gpsOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
    gpsWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
    gpsMuted: { backgroundColor: colors.background, borderColor: colors.border },
    gpsText: { fontWeight: '600', color: colors.text },
    gpsRetry: { marginTop: spacing.xs, alignSelf: 'flex-start' },
    label: { fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      color: colors.text,
    },
    textarea: { minHeight: 80 },
    offlineNote: {
      backgroundColor: colors.warningBannerBg,
      borderRadius: 8,
      padding: 12,
      marginTop: spacing.lg,
      borderWidth: 1,
      borderColor: '#fde68a',
    },
    cta: { marginTop: spacing.lg },
  });
}
