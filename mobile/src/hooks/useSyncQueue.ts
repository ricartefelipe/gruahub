/**
 * Hook de sincronização da fila offline.
 *
 * Tratamento de respostas HTTP:
 *   2xx         → markSynced
 *   409         → markSynced (idempotência — operação já processada pelo servidor)
 *   400 / 422   → markFailedPermanent (payload inválido, não vai melhorar)
 *   401         → tenta refresh de token; se falhar → clearAuth (re-login necessário)
 *   403         → markFailedPermanent (sem permissão)
 *   5xx / rede  → markFailedRetryable (transitório — backoff + jitter)
 *   timeout     → markFailedRetryable
 */

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
import { isDeferredSyncOperation } from '../sync/deferredOperations';

const POLL_INTERVAL_MS = 60_000;

// ── Mapa operationType → endpoint ────────────────────────────────────────────

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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSyncQueue() {
  const { accessToken, tenantId, needsRefresh, refreshAccessToken, clearAuth } = useAuthStore();
  const isSyncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (isSyncingRef.current) return;

    // Verifica conectividade antes de tentar
    try {
      const netState = await Network.getNetworkStateAsync();
      if (!netState.isConnected) return;
    } catch {
      // expo-network indisponível em ambiente de teste — continua
    }

    // Lê token atualizado do store
    const storeState = useAuthStore.getState();
    if (!storeState.accessToken) return;

    // Renova proativamente se perto do vencimento
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
          // Sem endpoint ainda (ex.: foto local) — não POST JSON nem queima retries
          continue;
        }

        await markSyncing(op.id);

        try {
          await apiFetch(getEndpoint(op.operationType), {
            method: 'POST',
            body: JSON.stringify({
              ...op.payload,
              clientOperationId: op.clientOperationId,
            }),
            accessToken: useAuthStore.getState().accessToken ?? freshToken,
            tenantId: freshTenantId ?? undefined,
            operationId: op.clientOperationId,
          });

          // apiFetch lança em não-2xx — se chegou aqui, é sucesso
          await markSynced(op.id);
          console.log(`[SyncQueue] ✓ ${op.clientOperationId} (${op.operationType})`);

        } catch (err: unknown) {
          if (err instanceof ApiError) {
            if (err.status === 409) {
              // Idempotência: servidor já processou → sucesso
              await markSynced(op.id);
              console.log(`[SyncQueue] 409→synced ${op.clientOperationId}`);

            } else if (err.status === 401) {
              // Token expirado durante sync — tenta refresh
              const refreshed = await refreshAccessToken();
              if (refreshed) {
                // Volta para PENDING: será re-tentado no próximo ciclo
                await markFailedRetryable(op.id, '401 token renovado — re-tentando');
              } else {
                console.warn('[SyncQueue] Refresh falhou — forçando re-login');
                await clearAuth();
                return; // Para de processar sem token válido
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
              // 5xx ou timeout (status 0)
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

  // Sync imediato ao montar (quando autenticado) + polling
  useEffect(() => {
    if (accessToken) {
      sync();
    }
    const interval = setInterval(sync, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sync, accessToken]);

  return { sync };
}
