jest.mock('expo-location', () => require('../__mocks__/expo-location'));

describe('getCheckinLocation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('retorna coordenadas quando permissão concedida', async () => {
    jest.doMock('expo-location', () => ({
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      requestForegroundPermissionsAsync: jest.fn(),
      getCurrentPositionAsync: jest.fn().mockResolvedValue({
        coords: { latitude: -8.05, longitude: -34.88 },
      }),
    }));

    const { getCheckinLocation } = require('../location/getCheckinLocation');
    const result = await getCheckinLocation();

    expect(result.status).toBe('ok');
    expect(result.latitude).toBe(-8.05);
    expect(result.longitude).toBe(-34.88);
  });

  test('retorna denied sem coordenadas quando permissão negada', async () => {
    jest.doMock('expo-location', () => ({
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
      requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
      getCurrentPositionAsync: jest.fn(),
    }));

    const { getCheckinLocation } = require('../location/getCheckinLocation');
    const result = await getCheckinLocation();

    expect(result.status).toBe('denied');
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.detail).toMatch(/negada/i);
  });

  test('retorna unavailable quando GPS falha', async () => {
    jest.doMock('expo-location', () => ({
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      requestForegroundPermissionsAsync: jest.fn(),
      getCurrentPositionAsync: jest.fn().mockRejectedValue(new Error('timeout')),
    }));

    const { getCheckinLocation } = require('../location/getCheckinLocation');
    const result = await getCheckinLocation();

    expect(result.status).toBe('unavailable');
    expect(result.latitude).toBeNull();
    expect(result.detail).toMatch(/indisponível/i);
  });
});
