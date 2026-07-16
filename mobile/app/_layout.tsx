/**
 * Root layout do app — gerencia autenticação e providers globais.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db/offlineQueue';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    // Inicializa banco SQLite offline na montagem
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('[DB] Failed to initialize offline database:', err);
        setDbReady(true); // Permite o app iniciar mesmo assim
      });
  }, []);

  if (!dbReady) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login/index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="visits/start"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="visits/checklist"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="visits/complete"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="qr-scan"
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}
