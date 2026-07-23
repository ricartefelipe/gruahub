/**
 * Operações enfileiradas no aparelho, mas ainda sem endpoint/API de envio.
 * Devem permanecer PENDING sem tentar POST JSON (evita FAILED_PERMANENT falso).
 */
export const DEFERRED_SYNC_OPERATION_TYPES = ['UPLOAD_PHOTO'] as const;

export type DeferredSyncOperationType = (typeof DEFERRED_SYNC_OPERATION_TYPES)[number];

export function isDeferredSyncOperation(operationType: string): boolean {
  return (DEFERRED_SYNC_OPERATION_TYPES as readonly string[]).includes(operationType);
}
