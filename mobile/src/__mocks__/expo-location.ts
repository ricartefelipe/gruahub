export const Accuracy = {
  Balanced: 3,
};

export async function getForegroundPermissionsAsync() {
  return { status: 'granted' as const };
}

export async function requestForegroundPermissionsAsync() {
  return { status: 'granted' as const };
}

export async function getCurrentPositionAsync() {
  return {
    coords: {
      latitude: -8.0476,
      longitude: -34.877,
      accuracy: 10,
    },
  };
}
