/** Não usar jest.mock() aqui — moduleNameMapper já aponta para os mocks in-memory. */

import { MockSQLiteDatabase } from '../__mocks__/expo-sqlite';
import {
  enqueue,
  getPendingOperations,
  markSyncing,
  markSynced,
  markFailedRetryable,
  markFailedPermanent,
  retryManual,
  getQueueStats,
  getDb,
  __resetDb,
  Clock,
} from '../db/offlineQueue';
import { OPERATION_TYPES, MAX_RETRIES, BACKOFF_BASE_MS } from '../db/schema';


let db: MockSQLiteDatabase;

beforeEach(async () => {
  __resetDb();
  db = await getDb() as unknown as MockSQLiteDatabase;
});

afterEach(() => {
  __resetDb();
});

function makeId(n: number) {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}


class FakeClock implements Clock {
  private _now: number;
  constructor(initial = Date.now() + 86_400_000) { this._now = initial; }
  now() { return this._now; }
  advance(ms: number) { this._now += ms; }
}


describe('enqueue', () => {
  test('adiciona uma operação PENDING', async () => {
    await enqueue(makeId(1), OPERATION_TYPES.START_VISIT, { visitId: 'v1' });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe('PENDING');
    expect(ops[0].operationType).toBe('START_VISIT');
    expect(ops[0].retryCount).toBe(0);
  });

  test('deduplicação: segunda chamada com mesmo clientOperationId é ignorada', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, { visitId: 'v1' });
    await enqueue(id, OPERATION_TYPES.START_VISIT, { visitId: 'v1-dup' });
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
    expect((ops[0].payload as any).visitId).toBe('v1'); // primeira prevalece
  });

  test('duas operações diferentes são adicionadas normalmente', async () => {
    await enqueue(makeId(1), OPERATION_TYPES.START_VISIT, {});
    await enqueue(makeId(2), OPERATION_TYPES.COMPLETE_VISIT, {});
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(2);
  });
});

describe('ordenação por created_at', () => {
  test('START_VISIT enfileirado antes de COMPLETE_VISIT aparece primeiro', async () => {
    await enqueue(makeId(1), OPERATION_TYPES.START_VISIT, { visitId: 'v1' });
    await enqueue(makeId(2), OPERATION_TYPES.COMPLETE_VISIT, { visitId: 'v1' });
    const ops = await getPendingOperations();
    expect(ops[0].operationType).toBe('START_VISIT');
    expect(ops[1].operationType).toBe('COMPLETE_VISIT');
  });
});

describe('ciclo PENDING → SYNCING → SYNCED', () => {
  test('fluxo de sucesso completo', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});

    await markSyncing(id);
    let ops = await getPendingOperations();
    expect(ops).toHaveLength(0); // SYNCING não aparece em getPending

    await markSynced(id);
    const stats = await getQueueStats();
    expect(stats.synced).toBe(1);
    expect(stats.pending).toBe(0);
  });
});

describe('markFailedRetryable', () => {
  test('seta status FAILED_RETRYABLE e incrementa retryCount', async () => {
    const id = makeId(1);
    const clock = new FakeClock();
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);
    await markFailedRetryable(id, 'HTTP 500', clock);

    const stats = await getQueueStats();
    expect(stats.failedRetryable).toBe(1);
    expect(stats.pending).toBe(0);

    // next_retry_at está no futuro, então não aparece em getPending
    const ops = await getPendingOperations();
    expect(ops).toHaveLength(0);
  });

  test('backoff com clock injetável: next_retry_at calculado sobre clock.now()', async () => {
    const id = makeId(1);
    const FIXED_NOW = 1_700_000_000_000; // timestamp fixo
    const clock: Clock = { now: () => FIXED_NOW };

    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);
    await markFailedRetryable(id, 'error', clock);

    // retryCount=1 → base = 5s → jitter entre 3.75s e 7.5s
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM offline_operation WHERE id = ?',
      [id]
    );
    expect(row?.status).toBe('FAILED_RETRYABLE');
    expect(row?.retry_count).toBe(1);
    expect(row?.next_retry_at).toBeDefined();

    // next_retry_at deve ser ~5s após FIXED_NOW (com jitter ±25%)
    // SQLite armazena timestamps em resolução de segundos (sem ms), então
    // aceitamos uma tolerância de até 999ms para baixo no mínimo esperado.
    if (row?.next_retry_at) {
      const nextMs = new Date(row.next_retry_at.replace(' ', 'T') + 'Z').getTime();
      const deltaMs = nextMs - FIXED_NOW;
      const SECOND_TRUNCATION = 999; // resolução SQLite: trunca ms
      expect(deltaMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS * 0.75 - SECOND_TRUNCATION);
      expect(deltaMs).toBeLessThanOrEqual(BACKOFF_BASE_MS * 1.25);
    }
  });

  test(`após ${MAX_RETRIES} falhas, promove para FAILED_PERMANENT`, async () => {
    const id = makeId(1);
    const clock = new FakeClock();
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});

    // Seta retry_count artificialmente próximo do limite
    await markSyncing(id);
    await db.runAsync(
      `UPDATE offline_operation SET retry_count = ?, status = 'PENDING' WHERE id = ?`,
      [MAX_RETRIES - 1, id]
    );
    await markSyncing(id);
    await markFailedRetryable(id, `failure ${MAX_RETRIES}`, clock);

    const row = await db.getFirstAsync<any>(
      'SELECT status, retry_count FROM offline_operation WHERE id = ?',
      [id]
    );
    expect(row?.status).toBe('FAILED_PERMANENT');
    expect(row?.retry_count).toBe(MAX_RETRIES);
  });

  test('crescimento exponencial: retryCount=3 tem backoff maior que retryCount=1', () => {
    const base = BACKOFF_BASE_MS;
    const b1 = Math.min(base * Math.pow(3, 0), 3_600_000); // retryCount=1
    const b3 = Math.min(base * Math.pow(3, 2), 3_600_000); // retryCount=3
    expect(b3).toBeGreaterThan(b1);
    expect(b3).toBe(45_000); // 5000 * 9 = 45s
  });
});

describe('markFailedPermanent', () => {
  test('seta status FAILED_PERMANENT diretamente', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);
    await markFailedPermanent(id, 'HTTP 400 Bad Request');

    const stats = await getQueueStats();
    expect(stats.failedPermanent).toBe(1);

    const ops = await getPendingOperations();
    expect(ops).toHaveLength(0);
  });
});

describe('retryManual', () => {
  test('FAILED_PERMANENT volta para PENDING com retry_count=0', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);
    await markFailedPermanent(id, 'permanente');

    await retryManual(id);

    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe('PENDING');
    expect(ops[0].retryCount).toBe(0);
  });

  test('retryManual não afeta operações em outros estados', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    // Está PENDING (não FAILED_PERMANENT) — retryManual não deve fazer nada perigoso
    await retryManual(id);
    const ops = await getPendingOperations();
    expect(ops[0].status).toBe('PENDING');
  });
});

describe('crash recovery', () => {
  test('operações em SYNCING são resetadas para PENDING no startup', async () => {
    // Injeta uma op em SYNCING diretamente no banco (simulando crash)
    const id = makeId(99);
    await db.runAsync(
      `INSERT OR IGNORE INTO offline_operation
       (id, client_operation_id, operation_type, payload, status)
       VALUES (?, ?, ?, ?, 'SYNCING')`,
      [id, id, 'START_VISIT', '{}']
    );

    // Simula reinício do app — reseta o singleton e chama getDb() novamente
    __resetDb();
    // getDb() vai abrir um NOVO banco (mock retorna sempre nova instância)
    // Para testar crash recovery no MESMO banco, precisamos re-injetar via __resetDb
    // e depois chamar initDb diretamente via getDb com o mesmo db.
    // Workaround: não resetar o db, apenas resetar o singleton e re-injetar.
    const { __setDb } = await import('../db/offlineQueue');
    __setDb(db as any);
    await getDb(); // chama initDb com o banco existente

    const row = await db.getFirstAsync<any>(
      'SELECT status FROM offline_operation WHERE id = ?',
      [id]
    );
    expect(row?.status).toBe('PENDING');
  });
});

describe('getQueueStats', () => {
  test('conta corretamente todos os 5 estados', async () => {
    const clock = new FakeClock();

    await enqueue(makeId(1), OPERATION_TYPES.START_VISIT, {});     // PENDING
    await enqueue(makeId(2), OPERATION_TYPES.COMPLETE_VISIT, {});  // → SYNCING
    await markSyncing(makeId(2));

    await enqueue(makeId(3), OPERATION_TYPES.CASH_COLLECTION, {}); // → SYNCED
    await markSyncing(makeId(3));
    await markSynced(makeId(3));

    await enqueue(makeId(4), OPERATION_TYPES.REPLENISH_STOCK, {}); // → FAILED_RETRYABLE
    await markSyncing(makeId(4));
    await markFailedRetryable(makeId(4), 'err', clock);

    await enqueue(makeId(5), OPERATION_TYPES.OPEN_MAINTENANCE, {}); // → FAILED_PERMANENT
    await markSyncing(makeId(5));
    await markFailedPermanent(makeId(5), 'perm');

    const stats = await getQueueStats();
    expect(stats.pending).toBe(1);
    expect(stats.syncing).toBe(1);
    expect(stats.synced).toBe(1);
    expect(stats.failedRetryable).toBe(1);
    expect(stats.failedPermanent).toBe(1);
  });
});

describe('getPendingOperations — filtro next_retry_at', () => {
  test('op com next_retry_at no futuro NÃO aparece', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);

    // Seta next_retry_at 1 hora no futuro manualmente
    const future = new Date(Date.now() + 3_600_000)
      .toISOString().replace('T', ' ').slice(0, 19);
    await db.runAsync(
      `UPDATE offline_operation SET status = 'FAILED_RETRYABLE', next_retry_at = ? WHERE id = ?`,
      [future, id]
    );

    const ops = await getPendingOperations();
    expect(ops).toHaveLength(0);
  });

  test('op com next_retry_at no passado APARECE', async () => {
    const id = makeId(1);
    await enqueue(id, OPERATION_TYPES.START_VISIT, {});
    await markSyncing(id);

    // Seta next_retry_at 1 hora no passado
    const past = new Date(Date.now() - 3_600_000)
      .toISOString().replace('T', ' ').slice(0, 19);
    await db.runAsync(
      `UPDATE offline_operation SET status = 'FAILED_RETRYABLE', next_retry_at = ? WHERE id = ?`,
      [past, id]
    );

    const ops = await getPendingOperations();
    expect(ops).toHaveLength(1);
  });
});

describe('schema_version — migrations incrementais', () => {
  test('schema_version é populada após initDb', async () => {
    // Se chegou aqui sem erro, as tabelas foram criadas
    const rows = await db.getAllAsync<{ version: number }>(
      'SELECT * FROM offline_operation WHERE 1=0'
    );
    expect(rows).toEqual([]);

    const vRows = await db.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_version'
    );
    expect(vRows.length).toBeGreaterThan(0);
  });
});
