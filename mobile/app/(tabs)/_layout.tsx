/**
 * Tab layout do app. Três tabs: Rota, Sync, Perfil.
 * Banner offline/sync acima das tabs. Protegido por autenticação.
 */

import { View, StyleSheet } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useOfflineBanner } from '../../src/hooks/useOfflineBanner';
import { useTheme } from '../../src/theme';
import { OfflineBanner } from '../../src/ui';

export default function TabLayout() {
  const { accessToken } = useAuthStore();
  const { colors } = useTheme();
  const { pendingCount, message } = useOfflineBanner();

  if (!accessToken) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.root}>
      <OfflineBanner message={message} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            height: 58,
            paddingBottom: 6,
            paddingTop: 4,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
            tabBarBadgeStyle: {
              backgroundColor: colors.dangerText,
              fontSize: 11,
              fontWeight: '700',
            },
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
