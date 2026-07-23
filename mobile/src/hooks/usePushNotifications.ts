import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export function usePushNotifications(): void {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS === 'web') {
          return;
        }

        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }

        if (cancelled) {
          return;
        }

        if (status !== 'granted') {
          console.info('[push] stub: permissão negada');
          return;
        }

        // Sem projectId EAS válido o getExpoPushTokenAsync pode travar no Expo Go.
        // No MVP o push é stub — só logamos a permissão.
        if (!cancelled) {
          console.info('[push] stub local — permissão ok, sem registro FCM/EAS');
        }
      } catch (err) {
        console.info('[push] stub local — sem entrega remota:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
