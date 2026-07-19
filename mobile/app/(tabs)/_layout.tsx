/**
 * Tab layout do app. Três tabs: Rota, Sync, Perfil.
 * Protegido por autenticação — redireciona para /login se sem token.
 */

import { Tabs, Redirect } from 'expo-router';
import { Text } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';

export default function TabLayout() {
  const { accessToken } = useAuthStore();

  // Guard: sem token → login
  if (!accessToken) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rota',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16, fontWeight: '700' }}>R</Text>,
          tabBarAccessibilityLabel: 'Rota do dia',
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Fila',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16, fontWeight: '700' }}>F</Text>,
          tabBarAccessibilityLabel: 'Fila de sincronização',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16, fontWeight: '700' }}>P</Text>,
          tabBarAccessibilityLabel: 'Meu perfil',
        }}
      />
    </Tabs>
  );
}
