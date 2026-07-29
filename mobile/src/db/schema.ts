/** Migrações versionadas — nunca remova ou reordene entradas existentes. */
export const MIGRATIONS: string[] = [
  // v1
  `CREATE TABLE IF NOT EXISTS offline_operation (
    id TEXT PRIMARY KEY,
    client_operation_id TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT
  )`,

  // v2
  `CREATE TABLE IF NOT EXISTS cached_route (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`,

  // v3
  `CREATE TABLE IF NOT EXISTS cached_machine (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    asset_number TEXT NOT NULL,
    name TEXT NOT NULL,
    qr_code TEXT,
    status TEXT NOT NULL,
    operating_point_id TEXT,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // v4
  `CREATE TABLE IF NOT EXISTS auth_token (
    id INTEGER PRIMARY KEY DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    tenant_id TEXT,
    user_id TEXT,
    user_email TEXT
  )`,

  // v5
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`,

  // v6
  `CREATE INDEX IF NOT EXISTS idx_op_status_retry
   ON offline_operation(status, next_retry_at)`,
];

export const OPERATION_TYPES = {
  START_VISIT: 'START_VISIT',
  COMPLETE_VISIT: 'COMPLETE_VISIT',
  ADD_CHECKLIST_ITEM: 'ADD_CHECKLIST_ITEM',
  REPLENISH_STOCK: 'REPLENISH_STOCK',
  CASH_COLLECTION: 'CASH_COLLECTION',
  OPEN_MAINTENANCE: 'OPEN_MAINTENANCE',
  UPLOAD_PHOTO: 'UPLOAD_PHOTO',
} as const;

export type OperationType = typeof OPERATION_TYPES[keyof typeof OPERATION_TYPES];

export type OfflineOperationStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT';

export const MAX_RETRIES = 10;

export const BACKOFF_BASE_MS = 5_000;

export const BACKOFF_MAX_MS = 3_600_000;
