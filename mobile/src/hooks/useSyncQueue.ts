/**
 * Hook para sincronizar a fila offline com o backend.
 * Executa ao reconectar à rede e em polling de 60s.
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  getPendingOperations,
  markSyncing,
  markSynced,
  markFailed,
  getQueueStats,
} from '../db/offlineQueue';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export function useSyncQueue() {
  const { accessToken, tenantId } = useAuthStore();
  const isSyncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (isSyncingRef.current || !accessToken) return;
    isSyncingRef.current = true;

    try {
      const operations = await getPendingOperations();
      if (operations.length === 0) return;

      console.log(`[SyncQueue] Syncing ${operations.length} operation(s)...`);

      for (const op of operations) {
        await markSyncing(op.id);

        try {
          const endpoint = getEndpoint(op.operationType);
          const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              'Idempotency-Key': op.clientOperationId,
              'X-Tenant-Id': tenantId || '',
            },
            body: JSON.stringify({
              ...op.payload,
              clientOperationId: op.clientOperationId,
            }),
          });

          // 2xx e 409 (conflito de idempotência) são ambos "sucesso"
          if (response.ok || response.status === 409) {
            await markSynced(op.id);
            console.log(`[SyncQueue] Synced operation ${op.clientOperationId} (${op.operationType})`);
          } else {
            const errBody = await response.text().catch(() => 'unknown');
            await markFailed(op.id, `HTTP ${response.status}: ${errBody.substring(0, 200)}`);
            console.warn(`[SyncQueue] Failed to sync ${op.clientOperationId}: HTTP ${response.status}`);
          }
        } catch (err: any) {
          await markFailed(op.id, err.message || 'Network error');
          console.warn(`[SyncQueue] Network error for ${op.clientOperationId}:`, err.message);
        }
      }

      const stats = await getQueueStats();
      console.log('[SyncQueue] Queue stats after sync:', stats);
    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken, tenantId]);

  // Polling a cada 60s
  useEffect(() => {
    const interval = setInterval(sync, 60_000);
    // Sync imediato ao montar (quando há token)
    if (accessToken) {
      sync();
    }
    return () => clearInterval(interval);
  }, [sync, accessToken]);

  return { sync };
}

function getEndpoint(operationType: string): string {
  const map: Record<string, string> = {
    START_VISIT: '/api/v1/visits',
    COMPLETE_VISIT: '/api/v1/visits/complete',
    ADD_CHECKLIST_ITEM: '/api/v1/visits/checklist',
    REPLENISH_STOCK: '/api/v1/inventory/movements',
    CASH_COLLECTION: '/api/v1/finance/cash-collections',
    OPEN_MAINTENANCE: '/api/v1/maintenance',
    UPLOAD_PHOTO: '/api/v1/attachments',
  };
  return map[operationType] || '/api/v1/operations';
}
