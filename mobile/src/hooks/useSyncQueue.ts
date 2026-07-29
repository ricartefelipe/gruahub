import { useEffect, useRef, useCallback } from 'react';
import * as Network from 'expo-network';
import {
  getPendingOperations,
  markSyncing,
  markSynced,
  markFailedRetryable,
  markFailedPermanent,
  getQueueStats,
} from '../db/offlineQueue';
import { useAuthStore } from '../store/authStore';
import { apiFetch, ApiError } from '../api/apiClient';
import { uploadVisitAttachment } from '../api/uploadAttachment';
import { isDeferredSyncOperation } from '../sync/deferredOperations';
import { OPERATION_TYPES } from '../db/schema';

const POLL_INTERVAL_MS = 60_000;

function getEndpoint(operationType: string): string {
  const map: Record<string, string> = {
    START_VISIT:        '/api/v1/visits',
    COMPLETE_VISIT:     '/api/v1/visits/complete',
    ADD_CHECKLIST_ITEM: '/api/v1/visits/checklist',
    REPLENISH_STOCK:    '/api/v1/inventory/movements',
    CASH_COLLECTION:    '/api/v1/finance/cash-collections',
    OPEN_MAINTENANCE:   '/api/v1/maintenance',
  };
  return map[operationType] ?? '/api/v1/operations';
}

export function useSyncQueue() {
  const { accessToken, tenantId, needsRefresh, refreshAccessToken, clearAuth } = useAuthStore();
  const isSyncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (isSyncingRef.current) return;

    try {
      const netState = await Network.getNetworkStateAsync();
      if (!netState.isConnected) return;
    } catch {
      // expo-network indisponível em ambiente de teste — continua
    }

    const storeState = useAuthStore.getState();
    if (!storeState.accessToken) return;

    if (needsRefresh()) {
      const ok = await refreshAccessToken();
      if (!ok) {
        console.warn('[SyncQueue] Falha ao renovar token — aguardando re-login');
        return;
      }
    }

    const freshToken = useAuthStore.getState().accessToken;
    const freshTenantId = useAuthStore.getState().tenantId;
    if (!freshToken) return;

    isSyncingRef.current = true;
    try {
      const operations = await getPendingOperations();
      if (operations.length === 0) return;

      console.log(`[SyncQueue] Sincronizando ${operations.length} operação(ões)…`);

      for (const op of operations) {
        if (isDeferredSyncOperation(op.operationType)) {
          continue;
        }

        await markSyncing(op.id);

        try {
          const token = useAuthStore.getState().accessToken ?? freshToken;
          if (op.operationType === OPERATION_TYPES.UPLOAD_PHOTO) {
            const p = op.payload as {
              visitId?: string;
              localUri?: string;
              kind?: string;
              machineId?: string;
            };
            if (!p.visitId || !p.localUri) {
              throw new ApiError(422, 'urn:gruahub:error:payload', 'Payload inválido', 'UPLOAD_PHOTO sem visitId/localUri');
            }
            await uploadVisitAttachment(
              {
                visitId: p.visitId,
                clientOperationId: op.clientOperationId,
                localUri: p.localUri,
                kind: p.kind,
                machineId: p.machineId,
              },
              { accessToken: token, tenantId: freshTenantId ?? undefined },
            );
          } else {
            await apiFetch(getEndpoint(op.operationType), {
              method: 'POST',
              body: JSON.stringify({
                ...op.payload,
                clientOperationId: op.clientOperationId,
              }),
              accessToken: token,
              tenantId: freshTenantId ?? undefined,
              operationId: op.clientOperationId,
            });
          }

          await markSynced(op.id);
          console.log(`[SyncQueue] ✓ ${op.clientOperationId} (${op.operationType})`);

        } catch (err: unknown) {
          if (err instanceof ApiError) {
            if (err.status === 409) {
              // 409 = idempotência: já processado no servidor.
              await markSynced(op.id);
              console.log(`[SyncQueue] 409→synced ${op.clientOperationId}`);

            } else if (err.status === 401) {
              const refreshed = await refreshAccessToken();
              if (refreshed) {
                await markFailedRetryable(op.id, '401 token renovado — re-tentando');
              } else {
                console.warn('[SyncQueue] Refresh falhou — forçando re-login');
                await clearAuth();
                return;
              }

            } else if (
              err.status === 400 ||
              err.status === 403 ||
              err.status === 422 ||
              err.isPermanent
            ) {
              await markFailedPermanent(
                op.id,
                `HTTP ${err.status}: ${err.detail || err.title}`
              );
              console.warn(
                `[SyncQueue] ✗ permanente ${op.clientOperationId}: ${err.status}`
              );

            } else {
              await markFailedRetryable(op.id, err.message);
              console.warn(
                `[SyncQueue] ✗ retryable ${op.clientOperationId}: ${err.message}`
              );
            }
          } else {
            const msg = (err as Error)?.message ?? 'Erro de rede desconhecido';
            await markFailedRetryable(op.id, msg);
            console.warn(`[SyncQueue] ✗ rede ${op.clientOperationId}: ${msg}`);
          }
        }
      }

      const stats = await getQueueStats();
      console.log('[SyncQueue] Stats após sync:', stats);

    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken, tenantId, needsRefresh, refreshAccessToken, clearAuth]);

  useEffect(() => {
    if (accessToken) {
      sync();
    }
    const interval = setInterval(sync, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sync, accessToken]);

  return { sync };
}
