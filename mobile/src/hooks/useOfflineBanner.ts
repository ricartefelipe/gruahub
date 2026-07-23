import { useCallback, useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { getQueueStats, type QueueStats } from '../db/offlineQueue';
import { formatOfflineBannerMessage } from '../ui/offlineBannerMessage';

export function pendingFromStats(
  stats: Pick<QueueStats, 'pending' | 'syncing' | 'failedRetryable' | 'failedPermanent'>,
): number {
  return stats.pending + stats.syncing + stats.failedRetryable + stats.failedPermanent;
}

export function useOfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const net = await Network.getNetworkStateAsync().catch(() => ({ isConnected: false }));
    setIsOnline(net.isConnected ?? false);
    const stats = await getQueueStats();
    setPendingCount(pendingFromStats(stats));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return {
    isOnline,
    pendingCount,
    message: formatOfflineBannerMessage(isOnline, pendingCount),
    refresh,
  };
}
