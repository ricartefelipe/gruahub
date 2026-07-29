export const DEFERRED_SYNC_OPERATION_TYPES: readonly string[] = [];

export function isDeferredSyncOperation(operationType: string): boolean {
  return DEFERRED_SYNC_OPERATION_TYPES.includes(operationType);
}
