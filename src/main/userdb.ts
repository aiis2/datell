/**
 * userdb.ts — User-owned embedded SQLite databases.
 *
 * Each user DB is an independent better-sqlite3 file at:
 *   {dataDir}/userdb/{id}.db
 *
 * A metadata registry is kept at:
 *   {dataDir}/userdb/registry.json
 *
 * Unlike the app's internal database.ts, user DBs:
 *   - Support full read/write SQL from the management console
 *   - Are read-only when accessed via chat (IPC: userdb:query)
 *   - Support batch import from Excel/CSV/JSON
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { getDataDir } from './dataDir';
import { isReadOnlyUserDBSql } from './sqlReadOnlyGuard';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserDBConfig {
  id: string;
  name: string;
  type: 'userdb';
  description?: string;
  dbPath: string;
  createdAt: string;
  updatedAt: string;
  tableCount?: number;
}

export interface UserDBQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionMs: number;
}

export interface UserDBSchemaInfo {
  tables: Array<{
    name: string;
    comment?: string;
    columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }>;
  }>;
  total?: number;
}

export interface UserDBTableDataResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  totalCount: number;
}

// ─── Registry helpers ────────────────────────────────────────────────────────

function getUserdbDir(): string {
  return path.join(getDataDir(), 'userdb');
}

function getRegistryFile(): string {
  return path.join(getUserdbDir(), 'registry.json');
}

function ensureUserdbDir(): void {
  fs.mkdirSync(getUserdbDir(), { recursive: true });
}

function readRegistry(): UserDBConfig[] {
  ensureUserdbDir();
  const file = getRegistryFile();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as UserDBConfig[];
  } catch {
    return [];
  }
}

function writeRegistry(configs: UserDBConfig[]): void {
  ensureUserdbDir();
  fs.writeFileSync(getRegistryFile(), JSON.stringify(configs, null, 2), 'utf-8');
}

// ─── DB connection helper ────────────────────────────────────────────────────

/**
 * Open a connection to a user DB by ID.
 * Callers are responsible for closing the connection after use.
 */
function openDB(id: string, readonly = false): Database.Database {
  const configs = readRegistry();
  const cfg = configs.find((c) => c.id === id);
  if (!cfg) throw new Error(`User DB not found: ${id}`);
  if (!fs.existsSync(cfg.dbPath)) throw new Error(`User DB file missing: ${cfg.dbPath}`);
  const db = new Database(cfg.dbPath, { readonly });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export function listUserDBs(): UserDBConfig[] {
  const configs = readRegistry();
  // Attach live table counts
  return configs.map((cfg) => {
    if (!fs.existsSync(cfg.dbPath)) return { ...cfg, tableCount: 0 };
    try {
      const db = new Database(cfg.dbPath, { readonly: true });
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      ).get() as { cnt: number };
      db.close();
      return { ...cfg, tableCount: row?.cnt ?? 0 };
    } catch {
      return { ...cfg, tableCount: 0 };
    }
  });
}

export function createUserDB(name: string, description?: string): UserDBConfig {
  ensureUserdbDir();
  const trimmed = name.trim();
  const all = readRegistry();
  if (all.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`duplicate_name:${trimmed}`);
  }
  const id = `udb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dbPath = path.join(getUserdbDir(), `${id}.db`);
  const now = new Date().toISOString();
  // Touch the file by opening and closing immediately
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.close();
  const cfg: UserDBConfig = { id, name: trimmed, type: 'userdb', description, dbPath, createdAt: now, updatedAt: now };
  all.push(cfg);
  writeRegistry(all);
  return cfg;
}

export function updateUserDB(id: string, patch: Partial<Pick<UserDBConfig, 'name' | 'description'>>): UserDBConfig {
  const all = readRegistry();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error(`User DB not found: ${id}`);
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], ...patch, updatedAt: now };
  writeRegistry(all);
  return all[idx];
}

export function deleteUserDB(id: string): void {
  const all = readRegistry();
  const cfg = all.find((c) => c.id === id);
  if (!cfg) return;
  // Remove the .db file
  try { if (fs.existsSync(cfg.dbPath)) fs.unlinkSync(cfg.dbPath); } catch { /* ignore */ }
  // WAL side-car files
  for (const suffix of ['-wal', '-shm']) {
    try { if (fs.existsSync(cfg.dbPath + suffix)) fs.unlinkSync(cfg.dbPath + suffix); } catch { /* ignore */ }
  }
  writeRegistry(all.filter((c) => c.id !== id));
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export function getUserDBSchema(id: string, opts: { limit?: number; search?: string } = {}): UserDBSchemaInfo {
  const db = openDB(id, true);
  const { limit = 20, search } = opts;
  try {
    let tableRows: { name: string }[];
    if (search) {
      tableRows = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name LIKE ? ORDER BY name LIMIT ?`
      ).all(`%${search}%`, limit) as { name: string }[];
    } else {
      tableRows = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT ?`
      ).all(limit) as { name: string }[];
    }
    const total = (db.prepare(
      search
        ? `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name LIKE ?`
        : `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).get(search ? [`%${search}%`] : []) as { cnt: number }).cnt;

    const tables = tableRows.map(({ name }) => {
      const cols = db.pragma(`table_info("${name.replace(/"/g, '""')}")`) as Array<{
        cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }>;
      return {
        name,
        columns: cols.map((c) => ({
          name: c.name,
          type: c.type || 'TEXT',
          nullable: c.notnull === 0 && c.pk === 0,
        })),
      };
    });
    return { tables, total };
  } finally {
    db.close();
  }
}

// ─── Query execution ─────────────────────────────────────────────────────────

/**
 * Execute SQL against a user DB.
 * @param readOnly  When true (chat mode), restricts to single-statement read-only SQL.
 */
export function executeUserDBSQL(id: string, sql: string, opts: { readOnly?: boolean } = {}): UserDBQueryResult {
  if (opts.readOnly && !isReadOnlyUserDBSql(sql)) {
    throw new Error('聊天模式下仅支持单条 SELECT/WITH/EXPLAIN/安全 PRAGMA 只读查询');
  }
  const db = openDB(id, false); // open RW even for readonly queries (to avoid lock issues)
  const t0 = Date.now();
  try {
    // Detect if it's a SELECT-like statement to return rows, or a write statement
    const isSelect = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)/i.test(sql.trim());
    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : (stmt.columns?.() ?? []).map((c: { name: string }) => c.name);
      return {
        columns,
        rows: rows.map((r) => columns.map((col) => r[col] ?? null)),
        rowCount: rows.length,
        executionMs: Date.now() - t0,
      };
    } else {
      // DML / DDL
      const info = db.prepare(sql).run();
      return {
        columns: ['changes', 'lastInsertRowid'],
        rows: [[info.changes, String(info.lastInsertRowid)]],
        rowCount: info.changes,
        executionMs: Date.now() - t0,
      };
    }
  } finally {
    db.close();
  }
}

// ─── Table management ─────────────────────────────────────────────────────────

export function createTable(id: string, ddl: string): void {
  const db = openDB(id, false);
  try { db.exec(ddl); } finally { db.close(); }
}

export function dropTable(id: string, tableName: string): void {
  const db = openDB(id, false);
  try {
    db.prepare(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}"`).run();
  } finally {
    db.close();
  }
}

export function addColumn(id: string, tableName: string, colName: string, colType: string): void {
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    db.prepare(`ALTER TABLE "${safe(tableName)}" ADD COLUMN "${safe(colName)}" ${colType}`).run();
  } finally {
    db.close();
  }
}

/**
 * Modify a column definition. SQLite doesn't support ALTER COLUMN so we
 * rebuild the table inside a transaction.
 */
export function alterColumn(
  id: string,
  tableName: string,
  colName: string,
  newType?: string,
  newComment?: string,
): void {
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    const cols = db.pragma(`table_info("${safe(tableName)}")`) as Array<{
      name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
    }>;
    if (!cols.length) throw new Error(`Table not found: ${tableName}`);

    const tmpName = `__tmp_${tableName}_${Date.now()}`;
    const newCols = cols.map((c) =>
      c.name === colName
        ? { ...c, type: newType ?? c.type }
        : c
    );
    const colDefs = newCols.map((c) => {
      let def = `"${safe(c.name)}" ${c.type}`;
      if (c.notnull) def += ' NOT NULL';
      if (c.dflt_value != null) def += ` DEFAULT ${c.dflt_value}`;
      if (c.pk) def += ' PRIMARY KEY';
      return def;
    }).join(', ');
    const colNames = newCols.map((c) => `"${safe(c.name)}"`).join(', ');

    const transaction = db.transaction(() => {
      db.exec(`CREATE TABLE "${safe(tmpName)}" (${colDefs})`);
      db.exec(`INSERT INTO "${safe(tmpName)}" (${colNames}) SELECT ${colNames} FROM "${safe(tableName)}"`);
      db.exec(`DROP TABLE "${safe(tableName)}"`);
      db.exec(`ALTER TABLE "${safe(tmpName)}" RENAME TO "${safe(tableName)}"`);
    });
    transaction();
    // Store comment in a meta table (best-effort)
    if (newComment !== undefined) {
      ensureColumnCommentsMeta(db);
      db.prepare(
        `INSERT OR REPLACE INTO __col_comments (table_name, col_name, comment) VALUES (?, ?, ?)`
      ).run(tableName, colName, newComment);
    }
  } finally {
    db.close();
  }
}

function ensureColumnCommentsMeta(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS __col_comments (
      table_name TEXT NOT NULL,
      col_name TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (table_name, col_name)
    )
  `);
}

// ─── Batch insert ──────────────────────────────────────────────────────────

export function batchInsert(
  id: string,
  tableName: string,
  columns: string[],
  rows: unknown[][],
): { inserted: number } {
  if (!rows.length) return { inserted: 0 };
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  const colList = columns.map((c) => `"${safe(c)}"`).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO "${safe(tableName)}" (${colList}) VALUES (${placeholders})`);
  let inserted = 0;
  const BATCH = 500;
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const transaction = db.transaction((batch: unknown[][]) => {
        for (const row of batch) {
          stmt.run(row as any[]);
          inserted++;
        }
      });
      transaction(chunk);
    }
    return { inserted };
  } finally {
    db.close();
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function exportTableData(id: string, tableName: string, format: 'csv' | 'json'): string {
  const db = openDB(id, true);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    const rows = db.prepare(`SELECT * FROM "${safe(tableName)}" LIMIT 100000`).all() as Record<string, unknown>[];
    if (!rows.length) return format === 'csv' ? '' : '[]';
    const columns = Object.keys(rows[0]);
    if (format === 'json') {
      return JSON.stringify(rows, null, 2);
    }
    // CSV
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))];
    return lines.join('\n');
  } finally {
    db.close();
  }
}

// ─── Table data preview ──────────────────────────────────────────────────────

export function getUserDBTableData(id: string, tableName: string, limit = 200, offset = 0): UserDBTableDataResult {
  const db = openDB(id, true);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM "${safe(tableName)}"`
    ).get() as { cnt: number };
    const rows = db.prepare(
      `SELECT * FROM "${safe(tableName)}" LIMIT ? OFFSET ?`
    ).all(limit, offset) as Record<string, unknown>[];
    const columns = rows.length > 0
      ? Object.keys(rows[0])
      : (db.pragma(`table_info("${safe(tableName)}")`) as Array<{ name: string }>).map((c) => c.name);
    return {
      columns,
      rows: rows.map((r) => columns.map((c) => r[c] ?? null)),
      rowCount: rows.length,
      totalCount: totalRow?.cnt ?? 0,
    };
  } finally {
    db.close();
  }
}

// ─── Table / Column DDL ───────────────────────────────────────────────────────

export function renameTable(id: string, oldName: string, newName: string): void {
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    db.prepare(`ALTER TABLE "${safe(oldName)}" RENAME TO "${safe(newName)}"`).run();
  } finally {
    db.close();
  }
}

export function renameColumn(id: string, tableName: string, oldColName: string, newColName: string): void {
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    // SQLite 3.25.0+ supports RENAME COLUMN
    db.prepare(`ALTER TABLE "${safe(tableName)}" RENAME COLUMN "${safe(oldColName)}" TO "${safe(newColName)}"`).run();
  } finally {
    db.close();
  }
}

export function dropColumn(id: string, tableName: string, colName: string): void {
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    // SQLite 3.35.0+ supports DROP COLUMN
    db.prepare(`ALTER TABLE "${safe(tableName)}" DROP COLUMN "${safe(colName)}"`).run();
  } finally {
    db.close();
  }
}

export function updateRow(
  id: string,
  tableName: string,
  updates: Record<string, unknown>,
  whereCol: string,
  whereVal: unknown,
): void {
  if (!Object.keys(updates).length) return;
  const db = openDB(id, false);
  const safe = (s: string) => s.replace(/"/g, '""');
  try {
    const setClauses = Object.keys(updates).map((k) => `"${safe(k)}" = ?`).join(', ');
    const values: unknown[] = [...Object.values(updates), whereVal];
    db.prepare(`UPDATE "${safe(tableName)}" SET ${setClauses} WHERE "${safe(whereCol)}" = ?`).run(...values as any[]);
  } finally {
    db.close();
  }
}
