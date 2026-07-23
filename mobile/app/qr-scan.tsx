import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuthStore } from '../src/store/authStore';
import { resolveMachineId } from '../src/inventory/resolveMachine';

export default function QrScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [resolving, setResolving] = useState(false);
  const { accessToken, tenantId } = useAuthStore();
  const { returnTo, visitId, pointName } = useLocalSearchParams<{
    returnTo?: string;
    visitId?: string;
    pointName?: string;
  }>();

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
          <Text style={styles.buttonText}>Conceder permissão</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned || resolving) return;
    setScanned(true);
    setResolving(true);

    const resolved = await resolveMachineId(data, accessToken ?? '', tenantId);
    setResolving(false);

    if ('error' in resolved) {
      Alert.alert('QR inválido', resolved.error, [
        { text: 'Tentar novamente', onPress: () => setScanned(false) },
      ]);
      return;
    }

    const { machineId } = resolved;

    if (returnTo === 'complete' && visitId) {
      router.replace({
        pathname: '/visits/complete',
        params: { visitId, pointName: pointName ?? '', machineId },
      });
      return;
    }

    if (returnTo === 'stock-step') {
      router.replace({
        pathname: '/stock/replenish',
        params: {
          machineId,
          visitId: visitId ?? '',
          pointName: pointName ?? '',
        },
      });
      return;
    }

    if (returnTo === 'stock') {
      router.replace({
        pathname: '/stock/replenish',
        params: { machineId },
      });
      return;
    }

    Alert.alert(
      'Máquina identificada',
      `ID: ${machineId.slice(0, 8)}…\n\nDeseja repor o estoque desta máquina?`,
      [
        { text: 'Só identificar', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Repor estoque',
          onPress: () =>
            router.replace({
              pathname: '/stock/replenish',
              params: { machineId },
            }),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Fechar scanner">
          <Text style={styles.closeText}>Fechar</Text>
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
          {resolving ? (
            <View style={styles.resolvingBox}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.resolvingText}>Identificando máquina…</Text>
            </View>
          ) : null}
        </View>
      </CameraView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Posicione o QR Code dentro da área marcada
        </Text>
        {scanned && !resolving && (
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
  },
  resolvingBox: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: 8,
  },
  resolvingText: { color: '#fff', fontSize: 13 },
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
