/**
 * Operações que ainda não podem ir no sync automático.
 * Vazio após API de anexos — mantido para extensões futuras.
 */
export const DEFERRED_SYNC_OPERATION_TYPES: readonly string[] = [];

export function isDeferredSyncOperation(operationType: string): boolean {
  return DEFERRED_SYNC_OPERATION_TYPES.includes(operationType);
}
