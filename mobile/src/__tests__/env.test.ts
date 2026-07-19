describe('env config', () => {
  const originalApi = process.env.EXPO_PUBLIC_API_URL;
  const originalKc = process.env.EXPO_PUBLIC_KEYCLOAK_URL;

  afterEach(() => {
    if (originalApi === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalApi;
    if (originalKc === undefined) delete process.env.EXPO_PUBLIC_KEYCLOAK_URL;
    else process.env.EXPO_PUBLIC_KEYCLOAK_URL = originalKc;
    jest.resetModules();
  });

  test('usa EXPO_PUBLIC_API_URL quando definido', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.15.15:8080/';
    process.env.EXPO_PUBLIC_KEYCLOAK_URL = 'http://192.168.15.15:8180';
    const env = require('../config/env');
    expect(env.API_URL).toBe('http://192.168.15.15:8080');
    expect(env.KEYCLOAK_ISSUER).toBe('http://192.168.15.15:8180/realms/gruahub');
    expect(env.isLocalhostUrl(env.API_URL)).toBe(false);
  });

  test('detecta localhost', () => {
    const { isLocalhostUrl } = require('../config/env');
    expect(isLocalhostUrl('http://localhost:8080')).toBe(true);
    expect(isLocalhostUrl('http://127.0.0.1:8180')).toBe(true);
  });
});
