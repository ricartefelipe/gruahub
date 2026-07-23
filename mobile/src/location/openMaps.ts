import { Linking, Platform } from 'react-native';

/**
 * Abre o app de mapas nativo com o endereço ou coordenadas do ponto.
 */
export async function openMapsForStop(opts: {
  address?: string;
  pointName?: string;
  latitude?: number;
  longitude?: number;
}): Promise<void> {
  const { address, pointName, latitude, longitude } = opts;
  const label = encodeURIComponent(pointName || address || 'Destino');

  let url: string;
  if (latitude != null && longitude != null) {
    url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${label}@${latitude},${longitude}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;
  } else {
    const q = encodeURIComponent([pointName, address].filter(Boolean).join(', '));
    url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${q}`
        : `geo:0,0?q=${q}`;
  }

  const can = await Linking.canOpenURL(url);
  if (can) {
    await Linking.openURL(url);
    return;
  }

  const web = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address || pointName || `${latitude},${longitude}`,
  )}`;
  await Linking.openURL(web);
}
