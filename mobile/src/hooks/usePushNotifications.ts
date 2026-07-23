import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api/apiClient';
import { useAuthStore } from '../store/authStore';

const STORAGE_KEY = 'gruahub.pushToken.registered';

function resolveProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const id = fromEnv || fromEas || fromExtra;
  if (!id || id === 'gruahub-local-dev') {
    return undefined;
  }
  return id;
}

export function usePushNotifications(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === 'web' || !accessToken) {
          return;
        }

        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (cancelled || status !== 'granted') {
          return;
        }

        const projectId = resolveProjectId();
        if (!projectId) {
          console.info(
            '[push] sem EAS projectId válido — defina EXPO_PUBLIC_EAS_PROJECT_ID ou rode eas init',
          );
          return;
        }

        const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenRes.data;
        if (!token || cancelled) {
          return;
        }

        const already = await AsyncStorage.getItem(STORAGE_KEY);
        if (already === token) {
          return;
        }

        await apiFetch('/api/v1/devices/push-tokens', {
          method: 'POST',
          accessToken,
          tenantId: tenantId || undefined,
          body: JSON.stringify({
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
          }),
        });

        await AsyncStorage.setItem(STORAGE_KEY, token);
        console.info('[push] token registrado no backend');
      } catch (err) {
        console.info('[push] registro falhou:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, tenantId]);
}
