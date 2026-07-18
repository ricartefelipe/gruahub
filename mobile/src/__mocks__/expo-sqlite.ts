/**
 * Mock de expo-sqlite para testes unitários.
 *
 * Implementa o subconjunto da API expo-sqlite v14 usada por offlineQueue.ts:
 *   execAsync, runAsync, getAllAsync, getFirstAsync
 *
 * Armazena dados em Maps em memória — sem bindings nativos, sem sql.js.
 * Trata os padrões SQL específicos do offlineQueue com um mini-interpretador.
 */

// ── Tipos internos ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface Table {
  rows: Row[];
  /** Colunas com restrição UNIQUE ou PRIMARY KEY (para INSERT OR IGNORE) */
  uniqueCols: string[];
  /** Valores padrão por coluna (do DEFAULT na DDL) */
  defaults: Record<string, unknown>;
}

// ── Banco de dados em memória ────────────────────────────────────────────────

export class MockSQLiteDatabase {
  private tables: Map<string, Table> = new Map();

  // ── DDL ─────────────────────────────────────────────────────────────────────

  async execAsync(sql: string): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');

    // CREATE TABLE IF NOT EXISTS <name> (...)
    const ctMatch = s.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\((.+)\)/is);
    if (ctMatch) {
      const tableName = ctMatch[1].toLowerCase();
      if (!this.tables.has(tableName)) {
        const body = ctMatch[2];
        const uniqueCols: string[] = [];
        const defaults: Record<string, unknown> = {};
        const colDefs = body.split(',').map(c => c.trim());
        for (const col of colDefs) {
          const nameMatch = col.match(/^(\w+)\s+(.*)/i);
          if (!nameMatch) continue;
          const colName = nameMatch[1].toLowerCase();
          const rest = nameMatch[2];

          // Detecta UNIQUE ou PRIMARY KEY (torna coluna unique)
          if (/\bUNIQUE\b/i.test(rest) || /\bPRIMARY KEY\b/i.test(rest)) {
            uniqueCols.push(colName);
          }

          // Detecta DEFAULT <valor>
          const defMatch = rest.match(/\bDEFAULT\s+(.+?)(?:\s*,|\s*$)/i);
          if (defMatch) {
            const rawDef = defMatch[1].trim().replace(/,\s*$/, '');
            if (/^'(.*)'$/.test(rawDef)) {
              defaults[colName] = rawDef.slice(1, -1);
            } else if (/^\d+$/.test(rawDef)) {
              defaults[colName] = parseInt(rawDef);
            }
            // datetime('now') e outros dinâmicos — ignorados aqui, tratados no INSERT
          }
        }
        this.tables.set(tableName, { rows: [], uniqueCols, defaults });
      }
      return;
    }

    // CREATE INDEX IF NOT EXISTS ... (ignorado)
    if (/CREATE INDEX IF NOT EXISTS/i.test(s)) return;
  }

  // ── DML ─────────────────────────────────────────────────────────────────────

  async runAsync(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const s = sql.trim().replace(/\s+/g, ' ');

    // INSERT OR IGNORE INTO <table>(...) VALUES(...)
    const insMatch = s.match(/INSERT OR IGNORE INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insMatch) {
      const tableName = insMatch[1].toLowerCase();
      const cols = insMatch[2].split(',').map(c => c.trim().toLowerCase());
      const table = this.getTable(tableName);
      const values = this.resolveParams(insMatch[3], params);

      const row: Row = {};
      cols.forEach((col, i) => { row[col] = values[i]; });

      // Aplica defaults para colunas omitidas
      for (const [col, defVal] of Object.entries(table.defaults)) {
        if (!(col in row)) row[col] = defVal;
      }
      // Timestamps automáticos
      if (!row['created_at']) row['created_at'] = this.nowSqlite();

      // Verifica UNIQUE / PRIMARY KEY
      const isDup = table.uniqueCols.some(uc =>
        table.rows.some(r => r[uc] !== undefined && r[uc] === row[uc])
      );
      if (isDup) return { changes: 0, lastInsertRowId: 0 };

      table.rows.push(row);
      return { changes: 1, lastInsertRowId: table.rows.length };
    }

    // UPDATE <table> SET <assignments> WHERE <condition>
    const updMatch = s.match(/UPDATE (\w+) SET (.+?) WHERE (.+)/i);
    if (updMatch) {
      const tableName = updMatch[1].toLowerCase();
      const assignments = updMatch[2];
      const whereClause = updMatch[3];
      const table = this.getTable(tableName);

      const assignPairs = this.parseAssignments(assignments);
      // Conta quantos '?' há no SET para saber o offset do WHERE
      const setParamCount = assignPairs.filter(([, v]) => v === '?').length;
      const whereFn = this.compileWhere(whereClause, setParamCount);

      let setParamIdx = 0;
      let changes = 0;
      for (const row of table.rows) {
        if (whereFn(row, params)) {
          for (const [col, rawVal] of assignPairs) {
            if (rawVal === '?') {
              row[col] = params[setParamIdx++];
            } else if (/^datetime\('now'\)$/i.test(rawVal)) {
              row[col] = this.nowSqlite();
            } else if (rawVal.toUpperCase() === 'NULL') {
              row[col] = null;
            } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
              row[col] = Number(rawVal); // literal numérico → number
            } else {
              row[col] = rawVal.replace(/^'(.*)'$/, '$1');
            }
          }
          changes++;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }

    return { changes: 0, lastInsertRowId: 0 };
  }

  async getAllAsync<T extends Row = Row>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const s = sql.trim().replace(/\s+/g, ' ');

    // SELECT status, COUNT(*) as count FROM <table> GROUP BY status
    const countMatch = s.match(/SELECT (\w+),\s*COUNT\(\*\) as (\w+) FROM (\w+) GROUP BY (\w+)/i);
    if (countMatch) {
      const groupCol = countMatch[1].toLowerCase();
      const alias   = countMatch[2].toLowerCase();
      const tName   = countMatch[3].toLowerCase();
      const table   = this.getTable(tName);
      const groups  = new Map<unknown, number>();
      for (const row of table.rows) {
        const val = row[groupCol];
        groups.set(val, (groups.get(val) ?? 0) + 1);
      }
      return Array.from(groups.entries()).map(([k, v]) => {
        const r: Row = {};
        r[groupCol] = k;
        r[alias] = v;
        return r as T;
      });
    }

    // SELECT <cols> FROM <table> WHERE ... ORDER BY ... LIMIT ...
    // Matches both SELECT * and SELECT col1,col2,...
    const selMatch = s.match(/SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (.+?))?(?: LIMIT (\d+))?$/i);
    if (selMatch) {
      const colSpec  = selMatch[1].trim();
      const tName    = selMatch[2].toLowerCase();
      const where    = selMatch[3];
      const orderBy  = selMatch[4];
      const limit    = selMatch[5] ? parseInt(selMatch[5]) : Infinity;
      const table    = this.getTable(tName);

      const whereFn = where ? this.compileWhere(where) : () => true;
      let rows = table.rows.filter(r => whereFn(r, params));

      if (orderBy) {
        const colMatch = orderBy.match(/(\w+)\s*(ASC|DESC)?/i);
        if (colMatch) {
          const col = colMatch[1].toLowerCase();
          const asc = (colMatch[2] ?? 'ASC').toUpperCase() === 'ASC';
          rows = rows.sort((a, b) => {
            const av = String(a[col] ?? '');
            const bv = String(b[col] ?? '');
            return asc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
      }

      const limited = rows.slice(0, limit);

      // SELECT * → retorna todos os campos
      if (colSpec === '*') return limited as T[];

      // SELECT col1, col2 → projeta só os campos pedidos
      const colList = colSpec.split(',').map(c => c.trim().toLowerCase());
      return limited.map(row => {
        const result: Row = {};
        colList.forEach(c => { result[c] = row[c]; });
        return result as T;
      });
    }

    return [];
  }

  async getFirstAsync<T extends Row = Row>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const s = sql.trim().replace(/\s+/g, ' ');

    // SELECT MAX(col) as alias FROM table
    const maxMatch = s.match(/SELECT MAX\((\w+)\) as (\w+) FROM (\w+)/i);
    if (maxMatch) {
      const col   = maxMatch[1].toLowerCase();
      const alias = maxMatch[2].toLowerCase();
      const tName = maxMatch[3].toLowerCase();
      const table = this.getTable(tName);
      if (table.rows.length === 0) return { [alias]: null } as unknown as T;
      const max = table.rows.reduce((acc, r) => {
        const v = Number(r[col] ?? -Infinity);
        return v > acc ? v : acc;
      }, -Infinity);
      return { [alias]: max === -Infinity ? null : max } as unknown as T;
    }

    // Delegado para getAllAsync → pega primeiro resultado
    const rows = await this.getAllAsync<T>(sql, params);
    return rows[0] ?? null;
  }

  // ── Helpers privados ─────────────────────────────────────────────────────────

  private getTable(name: string): Table {
    const lname = name.toLowerCase();
    if (!this.tables.has(lname)) {
      this.tables.set(lname, { rows: [], uniqueCols: [], defaults: {} });
    }
    return this.tables.get(lname)!;
  }

  private nowSqlite(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  private resolveParams(valueStr: string, params: unknown[]): unknown[] {
    let idx = 0;
    return valueStr.split(',').map(v => {
      v = v.trim();
      if (v === '?') return params[idx++];
      return v.replace(/^'(.*)'$/, '$1');
    });
  }

  private parseAssignments(s: string): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    const parts = s.split(/,(?![^(]*\))/);
    for (const p of parts) {
      const eqIdx = p.indexOf('=');
      if (eqIdx === -1) continue;
      const col = p.slice(0, eqIdx).trim().toLowerCase();
      const val = p.slice(eqIdx + 1).trim();
      pairs.push([col, val]);
    }
    return pairs;
  }

  /**
   * Compila uma cláusula WHERE em função de predicate.
   * @param startIdx  Índice inicial em params[] (para offsetar params do SET).
   */
  private compileWhere(where: string, startIdx = 0): (row: Row, params: unknown[]) => boolean {
    return (row: Row, params: unknown[]) => {
      return this.evalWhere(where.trim(), row, params, { idx: startIdx });
    };
  }

  private evalWhere(
    where: string,
    row: Row,
    params: unknown[],
    cursor: { idx: number }
  ): boolean {
    if (where.startsWith('(')) {
      let depth = 0, end = 0;
      for (let i = 0; i < where.length; i++) {
        if (where[i] === '(') depth++;
        else if (where[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      const inner = where.slice(1, end);
      const rest  = where.slice(end + 1).trim();
      const innerResult = this.evalWhere(inner, row, params, cursor);
      if (rest === '') return innerResult;
      if (rest.toUpperCase().startsWith('AND'))
        return innerResult && this.evalWhere(rest.slice(3).trim(), row, params, cursor);
      if (rest.toUpperCase().startsWith('OR'))
        return innerResult || this.evalWhere(rest.slice(2).trim(), row, params, cursor);
      return innerResult;
    }

    const andIdx = this.findTopLevel(where, ' AND ');
    const orIdx  = this.findTopLevel(where, ' OR ');

    if (andIdx !== -1 && (orIdx === -1 || andIdx < orIdx)) {
      const left  = where.slice(0, andIdx).trim();
      const right = where.slice(andIdx + 5).trim();
      return this.evalWhere(left, row, params, cursor) &&
             this.evalWhere(right, row, params, cursor);
    }
    if (orIdx !== -1) {
      const left  = where.slice(0, orIdx).trim();
      const right = where.slice(orIdx + 4).trim();
      return this.evalWhere(left, row, params, cursor) ||
             this.evalWhere(right, row, params, cursor);
    }

    return this.evalPredicate(where.trim(), row, params, cursor);
  }

  private findTopLevel(s: string, op: string): number {
    let depth = 0;
    const opUpper = op.toUpperCase();
    for (let i = 0; i <= s.length - op.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      else if (depth === 0 && s.slice(i).toUpperCase().startsWith(opUpper)) return i;
    }
    return -1;
  }

  private evalPredicate(
    pred: string,
    row: Row,
    params: unknown[],
    cursor: { idx: number }
  ): boolean {
    // col IN ('A', 'B', ...)
    const inMatch = pred.match(/^(\w+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const col  = inMatch[1].toLowerCase();
      const vals = inMatch[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      return vals.includes(String(row[col] ?? ''));
    }

    // col IS NOT NULL
    if (/IS NOT NULL$/i.test(pred)) {
      const col = pred.replace(/\s+IS NOT NULL$/i, '').trim().toLowerCase();
      return row[col] != null;
    }

    // col IS NULL
    if (/IS NULL$/i.test(pred)) {
      const col = pred.replace(/\s+IS NULL$/i, '').trim().toLowerCase();
      return row[col] == null;
    }

    // col <= datetime('now')
    if (/<=\s*datetime\('now'\)$/i.test(pred)) {
      const col = pred.replace(/\s*<=.*/i, '').trim().toLowerCase();
      const now = this.nowSqlite();
      const val = String(row[col] ?? '9999');
      return val <= now;
    }

    // col = ?
    const eqMatch = pred.match(/^(\w+)\s*=\s*\?$/);
    if (eqMatch) {
      const col   = eqMatch[1].toLowerCase();
      const param = params[cursor.idx++];
      // eslint-disable-next-line eqeqeq
      return row[col] == param;
    }

    // col = 'literal'
    const eqLitMatch = pred.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (eqLitMatch) {
      return row[eqLitMatch[1].toLowerCase()] === eqLitMatch[2];
    }

    // col = number
    const eqNumMatch = pred.match(/^(\w+)\s*=\s*(\d+)$/);
    if (eqNumMatch) {
      return row[eqNumMatch[1].toLowerCase()] == parseInt(eqNumMatch[2]);
    }

    return true; // predicado desconhecido — não filtra
  }
}

/** Abre um banco em memória (API expo-sqlite v14). */
export async function openDatabaseAsync(_name: string): Promise<MockSQLiteDatabase> {
  return new MockSQLiteDatabase();
}
