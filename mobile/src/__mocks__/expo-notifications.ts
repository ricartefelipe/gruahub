export async function getPermissionsAsync() {
  return { status: 'denied', granted: false, canAskAgain: true, expires: 'never' };
}

export async function requestPermissionsAsync() {
  return { status: 'denied', granted: false, canAskAgain: true, expires: 'never' };
}

export async function getExpoPushTokenAsync() {
  return { data: 'ExponentPushToken[test]', type: 'expo' };
}
