/**
 * Tela de scanner QR Code — identifica máquina por QR e redireciona para ação.
 * Usa expo-camera (CameraView) que inclui leitura de QR.
 */

import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useRef } from 'react';

export default function QrScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const { action } = useLocalSearchParams<{ action?: string }>();

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Verificando permissão de câmera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Câmera necessária para escanear QR Code.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder Permissão</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    // QR Code esperado: formato "gruahub://machine/{machineId}" ou apenas o UUID
    let machineId: string;
    try {
      const url = new URL(data);
      if (url.protocol === 'gruahub:' && url.pathname.startsWith('//machine/')) {
        machineId = url.pathname.replace('//machine/', '');
      } else {
        machineId = data.trim();
      }
    } catch {
      machineId = data.trim();
    }

    // Valida UUID básico
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(machineId)) {
      Alert.alert(
        'QR inválido',
        `O código escaneado não é um ID de máquina válido.\n\nValor: ${data.slice(0, 50)}`,
        [{ text: 'Tentar novamente', onPress: () => setScanned(false) }]
      );
      return;
    }

    // Navega de volta com o machineId
    router.back();
    // Dependendo da ação solicitada, poderia navegar para replenishment ou maintenance
    Alert.alert(
      'Máquina identificada',
      `ID: ${machineId.slice(0, 8)}…\n\nUse este ID para registrar a operação.`
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Fechar scanner">
          <Text style={styles.closeText}>✕ Fechar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Escanear QR Code</Text>
        <Text style={styles.subtitle}>Aponte para o QR Code da máquina</Text>
      </View>

      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanWindow} />
        </View>
      </CameraView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Posicione o QR Code dentro da área marcada
        </Text>
        {scanned && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setScanned(false)}
            accessibilityLabel="Escanear novamente"
          >
            <Text style={styles.retryText}>Escanear novamente</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111827', padding: 24 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelButton: { marginTop: 12, padding: 12 },
  cancelText: { color: '#9ca3af', fontSize: 14 },
  header: { padding: 20, paddingTop: 60, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1 },
  closeText: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#d1d5db', fontSize: 13, marginTop: 4 },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanWindow: {
    width: 240, height: 240,
    borderWidth: 2, borderColor: '#2563eb',
    borderRadius: 12,
    backgroundColor: 'transparent',
    shadowColor: '#2563eb', shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 },
  },
  footer: {
    padding: 24, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  footerText: { color: '#d1d5db', fontSize: 14, textAlign: 'center' },
  retryButton: {
    marginTop: 12, backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
