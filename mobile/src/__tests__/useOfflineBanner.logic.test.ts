import { pendingFromStats } from '../hooks/useOfflineBanner';

describe('pendingFromStats', () => {
  it('soma pendentes de sync (exclui SYNCED)', () => {
    expect(
      pendingFromStats({
        pending: 2,
        syncing: 1,
        failedRetryable: 1,
        failedPermanent: 1,
        synced: 9,
      }),
    ).toBe(5);
  });
});
