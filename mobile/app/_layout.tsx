/**
 * Root layout do app — inicializa banco SQLite e restaura sessão do SecureStore.
 */

import { useEffect, useState } from 'react';
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
    // 1. Inicializa banco SQLite (crash recovery + migrations incrementais)
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('[DB] Falha ao inicializar banco offline:', err);
        setDbReady(true); // degrada graciosamente — app abre sem cache
      });

    // 2. Restaura tokens do SecureStore
    restoreSession();
  }, []);

  // Aguarda DB + restauração de sessão para evitar flash de tela de login
  if (!dbReady || isRestoring) return null;

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
        <Stack.Screen name="visits/checklist" options={{ headerShown: false }} />
        <Stack.Screen name="visits/complete" options={{ headerShown: false }} />
        <Stack.Screen
          name="qr-scan"
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}
