import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db/offlineQueue';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { useAuthStore } from '../src/store/authStore';
import { ThemeProvider, useTheme } from '../src/theme';
import { AppText } from '../src/ui';

function RootNavigator() {
  const [dbReady, setDbReady] = useState(false);
  const { restoreSession, isRestoring } = useAuthStore();
  const { colors } = useTheme();
  usePushNotifications();

  useEffect(() => {
    let cancelled = false;
    const bootTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[Boot] timeout — seguindo sem esperar DB/sessão');
        setDbReady(true);
      }
    }, 8000);

    getDb()
      .then(() => {
        if (!cancelled) setDbReady(true);
      })
      .catch((err) => {
        console.error('[DB] Falha ao inicializar banco offline:', err);
        if (!cancelled) setDbReady(true);
      })
      .finally(() => clearTimeout(bootTimeout));

    restoreSession();
    return () => {
      cancelled = true;
      clearTimeout(bootTimeout);
    };
  }, [restoreSession]);

  if (!dbReady || isRestoring) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.header }]}>
        <StatusBar style="light" />
        <AppText variant="hero" color={colors.headerText}>
          GruaHub
        </AppText>
        <ActivityIndicator color={colors.headerText} size="large" style={{ marginTop: 20 }} />
        <AppText variant="body" color={colors.headerMuted} style={styles.bootText}>
          Preparando app…
        </AppText>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login/index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="visits/start"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="visits/checklist" options={{ headerShown: false }} />
        <Stack.Screen name="visits/stock-step" options={{ headerShown: false }} />
        <Stack.Screen name="visits/complete" options={{ headerShown: false }} />
        <Stack.Screen
          name="qr-scan"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="stock/replenish" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: { marginTop: 12 },
});
