/**
 * Início de visita — checkin com localização e leitura de QR Code.
 */

import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { v4 as uuidv4 } from 'uuid';
import { enqueue } from '../../src/db/offlineQueue';
import { OPERATION_TYPES } from '../../src/db/schema';

export default function StartVisitScreen() {
  const { pointId, pointName } = useLocalSearchParams<{ pointId: string; pointName: string }>();
  const [responsibleName, setResponsibleName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCheckin() {
    if (!responsibleName.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do responsável no estabelecimento.');
      return;
    }

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
        // Em produção: obter localização via expo-location
        checkinLatitude: null,
        checkinLongitude: null,
      });

      router.replace({
        pathname: '/visits/checklist',
        params: { visitId, clientOperationId, pointName },
      });
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível iniciar a visita. ' + err.message);
    } finally {
      setLoading(false);
    }
  }

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
