/**
 * Fila de operações offline — máquina de estados completa.
 *
 * Estados: PENDING → SYNCING → SYNCED | FAILED_RETRYABLE | FAILED_PERMANENT
 *
 * Garantias:
 *   - Exatamente uma entrada por client_operation_id (INSERT OR IGNORE)
 *   - Backoff exponencial com jitter ±25% (clock injetável para testes)
 *   - Crash recovery: SYNCING → PENDING no startup
 *   - Max retries → FAILED_PERMANENT automaticamente
 *   - Ordenação por created_at garante START_VISIT antes de COMPLETE_VISIT
 */

import * as SQLite from 'expo-sqlite';
import {
  MIGRATIONS,
  OfflineOperationStatus,
  OperationType,
  MAX_RETRIES,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
} from './schema';

// ── Clock injetável ──────────────────────────────────────────────────────────

export interface Clock {
  now(): number; // Unix timestamp em ms
}

export const SystemClock: Clock = { now: () => Date.now() };

// ── Banco de dados ───────────────────────────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null;
let initialized = false;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('gruahub-offline.db');
  }
  if (!initialized) {
    await initDb(db);
    initialized = true;
  }
  return db;
}

/** Expõe para testes — injeta banco in-memory e marca como não-inicializado. */
export function __setDb(database: SQLite.SQLiteDatabase): void {
  db = database;
  initialized = false; // força initDb na próxima chamada a getDb()
}

/** Reseta o singleton (apenas para testes). */
export function __resetDb(): void {
  db = null;
  initialized = false;
}

async function initDb(database: SQLite.SQLiteDatabase): Promise<void> {
  // Primeiro aplica as 4 migrações base + schema_version (idempotentes) sem verificar versão
  for (let i = 0; i < 5; i++) {
    await database.execAsync(MIGRATIONS[i]);
  }

  // Descobre a última versão aplicada
  const lastRow = await database.getFirstAsync<{ version: number | null }>(
    `SELECT MAX(version) as version FROM schema_version`
  );
  const lastVersion = lastRow?.version ?? 0;

  // Aplica migrações pendentes (índice 0-based → versão 1-based)
  for (let i = lastVersion; i < MIGRATIONS.length; i++) {
    await database.execAsync(MIGRATIONS[i]);
    await database.runAsync(
      `INSERT OR IGNORE INTO schema_version(version) VALUES(?)`,
      [i + 1]
    );
  }

  // Crash recovery: ops travadas em SYNCING → PENDING
  const recovered = await database.runAsync(
    `UPDATE offline_operation
     SET status = 'PENDING', error_message = 'crash_recovery'
     WHERE status = 'SYNCING'`
  );
  if (recovered.changes > 0) {
    console.warn(
      `[OfflineQueue] Crash recovery: ${recovered.changes} op(s) resetadas SYNCING→PENDING`
    );
  }
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OfflineOperation {
  id: string;
  clientOperationId: string;
  operationType: OperationType;
  payload: object;
  status: OfflineOperationStatus;
  createdAt: string;
  syncedAt?: string;
  errorMessage?: string;
  retryCount: number;
  nextRetryAt?: string;
}

export interface QueueStats {
  pending: number;
  syncing: number;
  synced: number;
  failedRetryable: number;
  failedPermanent: number;
}

// ── Operações CRUD ───────────────────────────────────────────────────────────

/**
 * Enfileira uma operação.
 * INSERT OR IGNORE garante idempotência no cliente:
 * chamar duas vezes com o mesmo clientOperationId não duplica.
 */
export async function enqueue(
  clientOperationId: string,
  operationType: OperationType,
  payload: object
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR IGNORE INTO offline_operation
     (id, client_operation_id, operation_type, payload, status)
     VALUES (?, ?, ?, ?, 'PENDING')`,
    [clientOperationId, clientOperationId, operationType, JSON.stringify(payload)]
  );
}

/**
 * Retorna operações prontas para envio.
 * Inclui PENDING e FAILED_RETRYABLE cujo next_retry_at já chegou.
 */
export async function getPendingOperations(): Promise<OfflineOperation[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM offline_operation
     WHERE status IN ('PENDING', 'FAILED_RETRYABLE')
       AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
     ORDER BY created_at ASC
     LIMIT 50`
  );
  return rows.map(deserializeOp);
}

export async function markSyncing(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `UPDATE offline_operation SET status = 'SYNCING' WHERE id = ?`,
    [id]
  );
}

export async function markSynced(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `UPDATE offline_operation
     SET status = 'SYNCED', synced_at = datetime('now'), error_message = NULL
     WHERE id = ?`,
    [id]
  );
}

/**
 * Falha transitória — agenda retry com backoff exponencial + jitter ±25%.
 * Se retryCount >= MAX_RETRIES, promove para FAILED_PERMANENT.
 *
 * @param clock  Injetável para testes — substitua SystemClock por um clock controlado.
 */
export async function markFailedRetryable(
  id: string,
  errorMessage: string,
  clock: Clock = SystemClock
): Promise<void> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ retry_count: number }>(
    `SELECT retry_count FROM offline_operation WHERE id = ?`,
    [id]
  );
  const retryCount = (row?.retry_count ?? 0) + 1;

  if (retryCount >= MAX_RETRIES) {
    await database.runAsync(
      `UPDATE offline_operation
       SET status = 'FAILED_PERMANENT',
           error_message = ?,
           retry_count = ?
       WHERE id = ?`,
      [`Max retries (${MAX_RETRIES}) atingido. Último erro: ${errorMessage}`, retryCount, id]
    );
    return;
  }

  // Backoff: base * 3^(n-1)  com jitter ±25%
  const baseMs = Math.min(BACKOFF_BASE_MS * Math.pow(3, retryCount - 1), BACKOFF_MAX_MS);
  const jitter = baseMs * (0.75 + Math.random() * 0.5);
  const nextRetryMs = clock.now() + Math.round(jitter);
  const nextRetry = msToSqlite(nextRetryMs);

  await database.runAsync(
    `UPDATE offline_operation
     SET status = 'FAILED_RETRYABLE',
         error_message = ?,
         retry_count = ?,
         next_retry_at = ?
     WHERE id = ?`,
    [errorMessage, retryCount, nextRetry, id]
  );
}

/** Falha permanente — não será mais tentada automaticamente. */
export async function markFailedPermanent(id: string, errorMessage: string): Promise<void> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ retry_count: number }>(
    `SELECT retry_count FROM offline_operation WHERE id = ?`,
    [id]
  );
  await database.runAsync(
    `UPDATE offline_operation
     SET status = 'FAILED_PERMANENT',
         error_message = ?,
         retry_count = ?
     WHERE id = ?`,
    [errorMessage, (row?.retry_count ?? 0) + 1, id]
  );
}

/** Recoloca manualmente uma FAILED_PERMANENT em PENDING (ação do operador). */
export async function retryManual(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `UPDATE offline_operation
     SET status = 'PENDING', retry_count = 0, next_retry_at = NULL, error_message = NULL
     WHERE id = ? AND status = 'FAILED_PERMANENT'`,
    [id]
  );
}

export async function getQueueStats(): Promise<QueueStats> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM offline_operation GROUP BY status`
  );
  const result: QueueStats = {
    pending: 0, syncing: 0, synced: 0, failedRetryable: 0, failedPermanent: 0,
  };
  for (const r of rows) {
    switch (r.status) {
      case 'PENDING':           result.pending = r.count; break;
      case 'SYNCING':           result.syncing = r.count; break;
      case 'SYNCED':            result.synced = r.count; break;
      case 'FAILED_RETRYABLE':  result.failedRetryable = r.count; break;
      case 'FAILED_PERMANENT':  result.failedPermanent = r.count; break;
    }
  }
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function msToSqlite(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function deserializeOp(row: any): OfflineOperation {
  return {
    id: row.id,
    clientOperationId: row.client_operation_id,
    operationType: row.operation_type as OperationType,
    payload: JSON.parse(row.payload),
    status: row.status as OfflineOperationStatus,
    createdAt: row.created_at,
    syncedAt: row.synced_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at ?? undefined,
  };
}
