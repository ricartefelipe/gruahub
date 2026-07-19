import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';
import {
  CheckinLocation,
  getCheckinLocation,
} from '../../src/location/getCheckinLocation';

export default function StartVisitScreen() {
  const { pointId, pointName } = useLocalSearchParams<{ pointId: string; pointName: string }>();
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
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar">
          <Text style={styles.back}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Iniciar Visita</Text>
        <Text style={styles.subtitle}>{pointName}</Text>
      </View>

      <View style={styles.form}>
        <View style={[styles.gpsBanner, gpsTone]} accessibilityLiveRegion="polite">
          <Text style={styles.gpsText}>{gpsLabel}</Text>
          {!gpsLoading && location?.status !== 'ok' ? (
            <TouchableOpacity
              onPress={async () => {
                setGpsLoading(true);
                const result = await getCheckinLocation();
                setLocation(result);
                setGpsLoading(false);
              }}
              accessibilityLabel="Tentar obter GPS novamente"
            >
              <Text style={styles.gpsRetry}>Tentar novamente</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.label}>Nome do Responsável *</Text>
        <TextInput
          style={styles.input}
          value={responsibleName}
          onChangeText={setResponsibleName}
          placeholder="Nome do responsável no local"
          accessibilityLabel="Nome do responsável"
          returnKeyType="next"
        />

        <Text style={styles.label}>Observações</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Observações da visita (opcional)"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          accessibilityLabel="Observações da visita"
        />

        <View style={styles.offlineNote}>
          <Text style={styles.offlineNoteText}>
            Modo offline-first: a visita vai para a fila local e sincroniza ao reconectar.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCheckin}
          disabled={loading}
          accessibilityLabel="Confirmar check-in e iniciar visita"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {loading ? 'Iniciando...' : 'Confirmar Check-in'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { backgroundColor: '#1e40af', padding: 20, paddingTop: 60 },
  back: { color: '#bfdbfe', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#bfdbfe', marginTop: 4 },
  form: { padding: 20 },
  gpsBanner: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  gpsOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  gpsWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  gpsMuted: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  gpsText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  gpsRetry: { marginTop: 6, color: '#2563eb', fontWeight: '600', fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db',
    borderRadius: 8, padding: 12, fontSize: 15, color: '#111827',
  },
  textarea: { minHeight: 80 },
  offlineNote: {
    backgroundColor: '#fef3c7', borderRadius: 8, padding: 12, marginTop: 20,
    borderWidth: 1, borderColor: '#fde68a',
  },
  offlineNoteText: { fontSize: 13, color: '#92400e' },
  button: {
    backgroundColor: '#2563eb', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
