/**
 * Tab layout do app. Três tabs: Rota, Sync, Perfil.
 * Protegido por autenticação — redireciona para /login se sem token.
 */

import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineBanner } from '../../src/hooks/useOfflineBanner';
import { useTheme } from '../../src/theme';

export default function TabLayout() {
  const { accessToken } = useAuthStore();
  const { colors } = useTheme();
  const { pendingCount } = useOfflineBanner();

  if (!accessToken) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rota',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'Rota do dia',
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Fila',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cloud-upload" size={size} color={color} />
          ),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarAccessibilityLabel: 'Fila de sincronização',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'Meu perfil',
        }}
      />
    </Tabs>
  );
}
