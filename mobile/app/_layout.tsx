import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db/offlineQueue';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const { restoreSession, isRestoring } = useAuthStore();
  usePushNotifications();

  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('[DB] Falha ao inicializar banco offline:', err);
        setDbReady(true);
      });

    restoreSession();
  }, []);

  if (!dbReady || isRestoring) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <Text style={styles.bootBrand}>GruaHub</Text>
        <ActivityIndicator color="#fff" size="large" style={{ marginTop: 20 }} />
        <Text style={styles.bootText}>Preparando app…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login/index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="visits/start"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="visits/checklist" options={{ headerShown: false }} />
        <Stack.Screen name="visits/complete" options={{ headerShown: false }} />
        <Stack.Screen
          name="qr-scan"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="stock/replenish" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#1e40af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootBrand: { color: '#fff', fontSize: 28, fontWeight: '700' },
  bootText: { color: '#bfdbfe', marginTop: 12, fontSize: 14 },
});
