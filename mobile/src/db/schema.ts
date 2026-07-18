/**
 * Schema SQLite local para funcionalidade offline-first.
 *
 * Migrações são versionadas via tabela schema_version.
 * Nunca remova ou reordene entradas existentes — apenas acrescente novas.
 */

/** Cada entrada é aplicada exatamente uma vez, em ordem, pelo initDb. */
export const MIGRATIONS: string[] = [
  // v1 — tabela de operações offline
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

  // v2 — cache de rotas
  `CREATE TABLE IF NOT EXISTS cached_route (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`,

  // v3 — cache de máquinas
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

  // v4 — tokens de autenticação
  `CREATE TABLE IF NOT EXISTS auth_token (
    id INTEGER PRIMARY KEY DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    tenant_id TEXT,
    user_id TEXT,
    user_email TEXT
  )`,

  // v5 — controle de versão do schema
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`,

  // v6 — índice para busca eficiente de operações pendentes
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

/**
 * Estados da fila offline:
 *   PENDING            → aguardando envio
 *   SYNCING            → envio em andamento (reset para PENDING no startup — crash recovery)
 *   SYNCED             → enviado com sucesso (ou 409 idempotente)
 *   FAILED_RETRYABLE   → falha transitória (5xx, rede) — será re-tentado com backoff + jitter
 *   FAILED_PERMANENT   → falha permanente (400, 403) ou máximo de tentativas esgotado
 */
export type OfflineOperationStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT';

/** Máximo de tentativas antes de FAILED_PERMANENT. */
export const MAX_RETRIES = 10;

/** Backoff base em ms (dobra a cada retry com jitter ±25%). */
export const BACKOFF_BASE_MS = 5_000;

/** Teto do backoff em ms (1 hora). */
export const BACKOFF_MAX_MS = 3_600_000;
