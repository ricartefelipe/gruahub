/**
 * Schema SQLite local para funcionalidade offline-first.
 * Utilizado pelo Expo SQLite.
 */

export const MIGRATIONS = [
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

  `CREATE TABLE IF NOT EXISTS cached_route (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`,

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

  `CREATE TABLE IF NOT EXISTS auth_token (
    id INTEGER PRIMARY KEY DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    tenant_id TEXT,
    user_id TEXT,
    user_email TEXT
  )`,
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

export type OfflineOperationStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
