import { Platform } from 'react-native';

const canOpenURL = jest.fn();
const openURL = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: {
    canOpenURL: (...args: unknown[]) => canOpenURL(...args),
    openURL: (...args: unknown[]) => openURL(...args),
  },
}));

import { openMapsForStop } from '../location/openMaps';

describe('openMapsForStop', () => {
  beforeEach(() => {
    canOpenURL.mockReset();
    openURL.mockReset();
    (Platform as { OS: string }).OS = 'android';
  });

  it('abre geo com coordenadas no Android', async () => {
    canOpenURL.mockResolvedValue(true);
    openURL.mockResolvedValue(undefined);
    await openMapsForStop({
      pointName: 'Shopping BV',
      latitude: -23.5,
      longitude: -46.6,
    });
    expect(canOpenURL).toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(
      expect.stringContaining('geo:-23.5,-46.6'),
    );
  });

  it('fallback web se canOpenURL for false', async () => {
    canOpenURL.mockResolvedValue(false);
    openURL.mockResolvedValue(undefined);
    await openMapsForStop({ address: 'Av. Brasil, 100' });
    expect(openURL).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps'),
    );
  });
});
