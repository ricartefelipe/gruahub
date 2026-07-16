/**
 * Fila de operações offline para o app mobile.
 * Cada operação tem um clientOperationId único (UUID v4).
 * Status: PENDING → SYNCING → SYNCED | FAILED
 * Retry com backoff exponencial.
 */

import * as SQLite from 'expo-sqlite';
import { MIGRATIONS, OfflineOperationStatus, OperationType } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('gruahub-offline.db');
    await initDb(db);
  }
  return db;
}

async function initDb(database: SQLite.SQLiteDatabase): Promise<void> {
  for (const migration of MIGRATIONS) {
    await database.execAsync(migration);
  }
}

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

export async function enqueue(
  clientOperationId: string,
  operationType: OperationType,
  payload: object
): Promise<void> {
  const database = await getDb();
  const id = clientOperationId; // id == clientOperationId para simplicidade
  await database.runAsync(
    `INSERT OR IGNORE INTO offline_operation
     (id, client_operation_id, operation_type, payload, status)
     VALUES (?, ?, ?, ?, 'PENDING')`,
    [id, clientOperationId, operationType, JSON.stringify(payload)]
  );
}

export async function getPendingOperations(): Promise<OfflineOperation[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM offline_operation
     WHERE status IN ('PENDING', 'FAILED')
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
    `UPDATE offline_operation SET status = 'SYNCED', synced_at = datetime('now') WHERE id = ?`,
    [id]
  );
}

export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ retry_count: number }>(
    `SELECT retry_count FROM offline_operation WHERE id = ?`,
    [id]
  );
  const retryCount = (row?.retry_count ?? 0) + 1;

  // Backoff exponencial: 5s, 15s, 45s, 135s, ...
  const backoffSeconds = Math.min(5 * Math.pow(3, retryCount - 1), 3600);
  const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);

  await database.runAsync(
    `UPDATE offline_operation SET status = 'FAILED', error_message = ?,
     retry_count = ?, next_retry_at = ? WHERE id = ?`,
    [errorMessage, retryCount, nextRetry, id]
  );
}

export async function getQueueStats(): Promise<{
  pending: number; syncing: number; synced: number; failed: number;
}> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM offline_operation GROUP BY status`
  );
  const result = { pending: 0, syncing: 0, synced: 0, failed: 0 };
  for (const r of rows) {
    result[r.status.toLowerCase() as keyof typeof result] = r.count;
  }
  return result;
}

function deserializeOp(row: any): OfflineOperation {
  return {
    id: row.id,
    clientOperationId: row.client_operation_id,
    operationType: row.operation_type as OperationType,
    payload: JSON.parse(row.payload),
    status: row.status as OfflineOperationStatus,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    nextRetryAt: row.next_retry_at,
  };
}
