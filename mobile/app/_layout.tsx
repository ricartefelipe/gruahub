import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../src/db/offlineQueue';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { useAuthStore } from '../src/store/authStore';
import { ThemeProvider, useTheme } from '../src/theme';

function RootNavigator() {
  const [dbReady, setDbReady] = useState(false);
  const { restoreSession, isRestoring } = useAuthStore();
  const { colors } = useTheme();
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
      <View style={[styles.boot, { backgroundColor: colors.header }]}>
        <StatusBar style="light" />
        <Text style={[styles.bootBrand, { color: colors.headerText }]}>GruaHub</Text>
        <ActivityIndicator color={colors.headerText} size="large" style={{ marginTop: 20 }} />
        <Text style={[styles.bootText, { color: colors.headerMuted }]}>Preparando app…</Text>
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
  bootBrand: { fontSize: 28, fontWeight: '700' },
  bootText: { marginTop: 12, fontSize: 14 },
});
