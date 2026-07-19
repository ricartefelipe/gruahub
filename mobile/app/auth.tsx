import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function AuthCallbackScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (accessToken) {
      router.replace('/(tabs)');
    }
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!useAuthStore.getState().accessToken) {
        router.replace('/login');
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>GruaHub</Text>
      <ActivityIndicator color="#fff" size="large" style={{ marginTop: 20 }} />
      <Text style={styles.text}>Concluindo autenticação…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e40af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: '#fff', fontSize: 28, fontWeight: '700' },
  text: { color: '#bfdbfe', marginTop: 12, fontSize: 14 },
});
