import * as Location from 'expo-location';

export type CheckinLocationStatus = 'ok' | 'denied' | 'unavailable';

export interface CheckinLocation {
  latitude: number | null;
  longitude: number | null;
  status: CheckinLocationStatus;
  detail: string;
}

export async function getCheckinLocation(): Promise<CheckinLocation> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;

    if (status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return {
        latitude: null,
        longitude: null,
        status: 'denied',
        detail:
          'Permissão de localização negada. O check-in seguirá sem GPS; ative a permissão nas configurações do aparelho para registrar coordenadas.',
      };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      status: 'ok',
      detail: `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'erro desconhecido';
    return {
      latitude: null,
      longitude: null,
      status: 'unavailable',
      detail: `GPS indisponível (${message}). O check-in seguirá sem coordenadas.`,
    };
  }
}
