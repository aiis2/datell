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
  rowLocators: Array<UserDBRowLocator | null>;
  editable: boolean;
  rowCount: number;
  totalCount: number;
}

export type UserDBRowLocator =
  | { kind: 'rowid'; value: string }
  | { kind: 'primary-key'; values: Record<string, unknown> };

export interface UserDBImportColumn {
  name: string;
  type: string;
}

export interface UserDBImportOptions {
  /** Default: 'error' — refuse if the table already exists. */
  ifExists?: 'error' | 'replace';
}

interface UserDBTableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
  hidden: number;
}

interface UserDBTableIdentity {
  objectType: 'table' | 'view';
  columns: UserDBTableColumnInfo[];
  primaryKeyColumns: UserDBTableColumnInfo[];
  rowidAlias: 'rowid' | '_rowid_' | 'oid' | null;
}

interface UserDBTableListEntry {
  schema: string;
  name: string;
  wr: number;
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

const quoteIdentifier = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const SQLITE_ROWID_MIN = BigInt('-9223372036854775808');
const SQLITE_ROWID_MAX = BigInt('9223372036854775807');

function normalizeVisibleInteger(value: unknown): unknown {
  if (typeof value !== 'bigint') return value;
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : value.toString();
}

function normalizePrimaryKeyValue(value: unknown): unknown {
  if (typeof value !== 'bigint') return value;
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) ? numberValue : value;
}

type ColumnAffinity = 'integer' | 'real' | 'numeric' | 'text';

function columnAffinity(typeDecl: string): ColumnAffinity {
  const t = (typeDecl || '').toUpperCase();
  // SQLite affinity rules (simplified, order matters): INT → INTEGER; then REAL/FLOA/DOUB; then NUM; else TEXT.
  if (t.includes('INT')) return 'integer';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'real';
  if (t.includes('NUM')) return 'numeric';
  return 'text';
}

function isColumnNotNull(column: UserDBTableColumnInfo): boolean {
  return column.notnull === 1 || column.pk > 0;
}

/**
 * Coerce a cell-edit value for binding into UPDATE, using declared column type + nullability.
 * Empty strings from the editor become SQL NULL on nullable columns.
 */
function coerceUpdateValue(column: UserDBTableColumnInfo, value: unknown): unknown {
  const affinity = columnAffinity(column.type || '');
  const required = isColumnNotNull(column);

  if (value === undefined || value === null) {
    if (required) throw new Error(`Cannot set NOT NULL column to null: ${column.name}`);
    return null;
  }

  if (typeof value === 'string') {
    if (value === '') {
      if (affinity === 'integer' || affinity === 'real' || affinity === 'numeric') {
        if (required) {
          throw new Error(`Cannot set NOT NULL numeric column to empty: ${column.name}`);
        }
        return null;
      }
      // TEXT-like
      if (required) return '';
      return null;
    }

    if (affinity === 'integer') {
      if (!/^-?\d+$/.test(value)) {
        throw new Error(`Invalid integer value for column ${column.name}`);
      }
      // Prefer Number when safe; otherwise BigInt so large ints stay exact.
      try {
        const asBig = BigInt(value);
        if (asBig >= Number.MIN_SAFE_INTEGER && asBig <= Number.MAX_SAFE_INTEGER) {
          return Number(asBig);
        }
        return asBig;
      } catch {
        throw new Error(`Invalid integer value for column ${column.name}`);
      }
    }

    if (affinity === 'real' || affinity === 'numeric') {
      const trimmed = value.trim();
      if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
        throw new Error(`Invalid numeric value for column ${column.name}`);
      }
      if (affinity === 'numeric' && /^-?\d+$/.test(trimmed)) {
        const asBig = BigInt(trimmed);
        if (asBig >= Number.MIN_SAFE_INTEGER && asBig <= Number.MAX_SAFE_INTEGER) {
          return Number(asBig);
        }
        return asBig;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid numeric value for column ${column.name}`);
      }
      return n;
    }

    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for column ${column.name}`);
    }
    if (affinity === 'integer' && !Number.isInteger(value)) {
      throw new Error(`Invalid integer value for column ${column.name}`);
    }
    return value;
  }

  if (typeof value === 'bigint') {
    if (affinity === 'text') return value.toString();
    return value;
  }

  if (typeof value === 'boolean') {
    if (affinity === 'integer' || affinity === 'numeric') return value ? 1 : 0;
    return value ? '1' : '0';
  }

  // Buffers / other: pass through for BLOB-ish use; reject plain objects.
  if (typeof value === 'object') {
    throw new Error(`Unsupported value type for column ${column.name}`);
  }
  return value;
}

function inspectTableIdentity(db: Database.Database, tableName: string): UserDBTableIdentity {
  const object = db.prepare(
    `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type IN ('table', 'view')`
  ).get(tableName) as { name: string; type: 'table' | 'view' } | undefined;
  if (!object) throw new Error(`Unknown table: ${tableName}`);

  const allColumns = db.pragma(`table_xinfo(${quoteIdentifier(object.name)})`) as UserDBTableColumnInfo[];
  const columns = allColumns.filter((column) => column.hidden !== 1);
  const primaryKeyColumns = columns
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk);
  const columnNames = new Set(columns.map((column) => column.name.toLowerCase()));
  const tableListEntry = (db.pragma('table_list') as UserDBTableListEntry[])
    .find((entry) => entry.schema === 'main' && entry.name === object.name);
  if (!tableListEntry) throw new Error(`Unable to inspect table identity: ${tableName}`);
  const withoutRowid = object.type !== 'table' || tableListEntry.wr === 1;
  const rowidAlias = withoutRowid
    ? null
    : (['rowid', '_rowid_', 'oid'] as const).find((alias) => !columnNames.has(alias)) ?? null;

  return { objectType: object.type, columns, primaryKeyColumns, rowidAlias };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

const USER_TABLE_FILTER = `type='table' AND name NOT LIKE 'sqlite_%' AND name != '__col_comments'`;

export function listUserDBs(): UserDBConfig[] {
  const configs = readRegistry();
  // Attach live table counts
  return configs.map((cfg) => {
    if (!fs.existsSync(cfg.dbPath)) return { ...cfg, tableCount: 0 };
    try {
      const db = new Database(cfg.dbPath, { readonly: true });
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE ${USER_TABLE_FILTER}`
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
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('User DB name cannot be empty or blank');
  }
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

  const next: UserDBConfig = { ...all[idx] };
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    const name = patch.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('User DB name cannot be empty or blank');
    }
    const trimmed = name.trim();
    if (all.some((c) => c.id !== id && c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`duplicate_name:${trimmed}`);
    }
    next.name = trimmed;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
    next.description = patch.description;
  }
  next.updatedAt = new Date().toISOString();
  all[idx] = next;
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
        `SELECT name FROM sqlite_master WHERE ${USER_TABLE_FILTER} AND name LIKE ? ORDER BY name LIMIT ?`
      ).all(`%${search}%`, limit) as { name: string }[];
    } else {
      tableRows = db.prepare(
        `SELECT name FROM sqlite_master WHERE ${USER_TABLE_FILTER} ORDER BY name LIMIT ?`
      ).all(limit) as { name: string }[];
    }
    const total = (db.prepare(
      search
        ? `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE ${USER_TABLE_FILTER} AND name LIKE ?`
        : `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE ${USER_TABLE_FILTER}`
    ).get(search ? [`%${search}%`] : []) as { cnt: number }).cnt;

    // Load column comments once if the meta table exists.
    const commentMap = new Map<string, string>();
    const hasComments = db.prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='__col_comments' LIMIT 1`
    ).get() as { ok: number } | undefined;
    if (hasComments) {
      const commentRows = db.prepare(
        `SELECT table_name, col_name, comment FROM __col_comments`
      ).all() as Array<{ table_name: string; col_name: string; comment: string }>;
      for (const row of commentRows) {
        const key = `${row.table_name.toLowerCase()}\0${row.col_name.toLowerCase()}`;
        commentMap.set(key, row.comment ?? '');
      }
    }

    const tables = tableRows.map(({ name }) => {
      const cols = db.pragma(`table_info("${name.replace(/"/g, '""')}")`) as Array<{
        cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }>;
      return {
        name,
        columns: cols.map((c) => {
          const comment = commentMap.get(`${name.toLowerCase()}\0${c.name.toLowerCase()}`);
          return {
            name: c.name,
            type: c.type || 'TEXT',
            nullable: c.notnull === 0 && c.pk === 0,
            ...(comment !== undefined ? { comment } : {}),
          };
        }),
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
    // Classify via the prepared statement: WITH/PRAGMA prefixes alone are not enough
    // (WITH … INSERT and assignment PRAGMAs are writers with reader === false).
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      // safeIntegers + normalize: same fidelity as table preview / export.
      const rows = stmt.safeIntegers(true).all() as Record<string, unknown>[];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : (stmt.columns?.() ?? []).map((c: { name: string }) => c.name);
      return {
        columns,
        rows: rows.map((r) => columns.map((col) => {
          const value = r[col];
          if (value === undefined) return null;
          return normalizeVisibleInteger(value);
        })),
        rowCount: rows.length,
        executionMs: Date.now() - t0,
      };
    }
    // DML / DDL / write PRAGMA
    const info = stmt.run();
    return {
      columns: ['changes', 'lastInsertRowid'],
      rows: [[info.changes, String(info.lastInsertRowid)]],
      rowCount: info.changes,
      executionMs: Date.now() - t0,
    };
  } finally {
    db.close();
  }
}

// ─── Table management ─────────────────────────────────────────────────────────

function extractSingleCreateTableSql(ddl: string): string {
  if (typeof ddl !== 'string' || ddl.trim().length === 0) {
    throw new Error('Empty CREATE TABLE statement');
  }

  let i = 0;
  const len = ddl.length;

  const skipWhitespaceAndComments = () => {
    while (i < len) {
      const ch = ddl[i]!;
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '-' && ddl[i + 1] === '-') {
        i += 2;
        while (i < len && ddl[i] !== '\n' && ddl[i] !== '\r') i += 1;
        continue;
      }
      if (ch === '/' && ddl[i + 1] === '*') {
        i += 2;
        while (i < len && !(ddl[i] === '*' && ddl[i + 1] === '/')) i += 1;
        if (i < len) i += 2;
        continue;
      }
      break;
    }
  };

  skipWhitespaceAndComments();
  if (i >= len) throw new Error('Empty CREATE TABLE statement');

  const start = i;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let statementEnd = -1;

  while (i < len) {
    const ch = ddl[i]!;
    const next = ddl[i + 1];

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === ';') {
      statementEnd = i;
      i += 1;
      break;
    }
    i += 1;
  }

  const end = statementEnd >= 0 ? statementEnd : len;
  const statement = ddl.slice(start, end).trim();
  if (!statement) throw new Error('Empty CREATE TABLE statement');

  if (!/^CREATE\s+TABLE\b/i.test(statement)) {
    throw new Error('createTable accepts only CREATE TABLE DDL');
  }

  // After the first statement, only whitespace/comments are allowed.
  skipWhitespaceAndComments();
  if (i < len) {
    throw new Error('Only a single CREATE TABLE statement is allowed');
  }

  return statement;
}

/**
 * Read one SQL identifier from the start of `input` (after leading trim by caller).
 * Supports double-quoted, [bracket], `backtick`, and bare forms (SQLite).
 * Returns the unescaped identifier text and the remainder after the identifier.
 */
function readSqlIdentifier(input: string): { name: string; rest: string } {
  if (!input) throw new Error('Identifier cannot be empty or blank');
  const ch0 = input[0]!;

  // "double-quoted" with "" escape
  if (ch0 === '"') {
    let i = 1;
    let name = '';
    while (i < input.length) {
      if (input[i] === '"' && input[i + 1] === '"') {
        name += '"';
        i += 2;
        continue;
      }
      if (input[i] === '"') {
        return { name, rest: input.slice(i + 1) };
      }
      name += input[i];
      i += 1;
    }
    throw new Error('Unterminated quoted identifier');
  }

  // [bracket-quoted] with ]] escape
  if (ch0 === '[') {
    let i = 1;
    let name = '';
    while (i < input.length) {
      if (input[i] === ']' && input[i + 1] === ']') {
        name += ']';
        i += 2;
        continue;
      }
      if (input[i] === ']') {
        return { name, rest: input.slice(i + 1) };
      }
      name += input[i];
      i += 1;
    }
    throw new Error('Unterminated bracket identifier');
  }

  // `backtick-quoted` with `` escape
  if (ch0 === '`') {
    let i = 1;
    let name = '';
    while (i < input.length) {
      if (input[i] === '`' && input[i + 1] === '`') {
        name += '`';
        i += 2;
        continue;
      }
      if (input[i] === '`') {
        return { name, rest: input.slice(i + 1) };
      }
      name += input[i];
      i += 1;
    }
    throw new Error('Unterminated backtick identifier');
  }

  // Bare identifier: stop at whitespace, '(', ',', or quote openers that start another token.
  const m = input.match(/^([^\s(\[\]"`',]+)([\s\S]*)$/);
  if (!m) throw new Error('Identifier cannot be empty or blank');
  return { name: m[1]!, rest: m[2]! };
}

/**
 * Validate table/column identifiers in a single CREATE TABLE statement.
 * Rejects empty/blank names that SQLite would otherwise accept when quoted
 * with "", [], or `` forms.
 */
function validateCreateTableIdentifiers(statement: string): void {
  const header = statement.match(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/is,
  );
  if (!header) {
    throw new Error('createTable accepts only CREATE TABLE DDL');
  }
  let rest = header[1]!.trimStart();
  if (!rest) throw new Error('Table name cannot be empty or blank');

  const tableId = readSqlIdentifier(rest);
  const tableName = tableId.name;
  rest = tableId.rest.trimStart();

  if (tableName.trim().length === 0) {
    throw new Error('Table name cannot be empty or blank');
  }
  if (/^sqlite_/i.test(tableName) || tableName === '__col_comments') {
    throw new Error(`Invalid reserved table name: ${tableName}`);
  }

  if (!rest.startsWith('(')) {
    throw new Error('CREATE TABLE requires a column list');
  }

  // Extract top-level column-list body (balanced parentheses after the opening '(').
  // Track ", ', `, and [] so nested commas inside string/id quotes are ignored.
  let depth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBracket = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]!;
    const next = rest[i + 1];
    if (inSingle) {
      if (ch === "'" && next === "'") { i += 1; continue; }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && next === '"') { i += 1; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`' && next === '`') { i += 1; continue; }
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (inBracket) {
      if (ch === ']' && next === ']') { i += 1; continue; }
      if (ch === ']') inBracket = false;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === '[') { inBracket = true; continue; }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) bodyStart = i + 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  if (bodyStart < 0 || bodyEnd < 0) {
    throw new Error('CREATE TABLE requires a column list');
  }
  const body = rest.slice(bodyStart, bodyEnd);

  // Split top-level comma-separated definitions.
  const defs: string[] = [];
  {
    let start = 0;
    let d = 0;
    inSingle = false;
    inDouble = false;
    inBacktick = false;
    inBracket = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      const next = body[i + 1];
      if (inSingle) {
        if (ch === "'" && next === "'") { i += 1; continue; }
        if (ch === "'") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (ch === '"' && next === '"') { i += 1; continue; }
        if (ch === '"') inDouble = false;
        continue;
      }
      if (inBacktick) {
        if (ch === '`' && next === '`') { i += 1; continue; }
        if (ch === '`') inBacktick = false;
        continue;
      }
      if (inBracket) {
        if (ch === ']' && next === ']') { i += 1; continue; }
        if (ch === ']') inBracket = false;
        continue;
      }
      if (ch === "'") { inSingle = true; continue; }
      if (ch === '"') { inDouble = true; continue; }
      if (ch === '`') { inBacktick = true; continue; }
      if (ch === '[') { inBracket = true; continue; }
      if (ch === '(') { d += 1; continue; }
      if (ch === ')') { d -= 1; continue; }
      if (ch === ',' && d === 0) {
        defs.push(body.slice(start, i));
        start = i + 1;
      }
    }
    defs.push(body.slice(start));
  }

  const TABLE_CONSTRAINT = /^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i;
  const seen = new Set<string>();
  let columnCount = 0;
  for (const rawDef of defs) {
    const def = rawDef.trim();
    if (!def) continue;
    if (TABLE_CONSTRAINT.test(def)) continue;

    const colId = readSqlIdentifier(def);
    const colName = colId.name;

    if (colName.trim().length === 0) {
      throw new Error('Column name cannot be empty or blank');
    }
    const key = colName.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate column name: ${colName}`);
    }
    seen.add(key);
    columnCount += 1;
  }

  if (columnCount === 0) {
    throw new Error('CREATE TABLE requires at least one column');
  }
}

export function createTable(id: string, ddl: string): void {
  const statement = extractSingleCreateTableSql(ddl);
  validateCreateTableIdentifiers(statement);
  const db = openDB(id, false);
  try {
    db.prepare(statement).run();
  } finally {
    db.close();
  }
}

function validateImportTableName(tableName: string): string {
  if (typeof tableName !== 'string' || tableName.trim().length === 0) {
    throw new Error('Table name cannot be empty or blank');
  }
  const trimmed = tableName.trim();
  if (/^sqlite_/i.test(trimmed) || trimmed === '__col_comments') {
    throw new Error(`Unknown table: ${trimmed}`);
  }
  return trimmed;
}

function validateImportColumns(columns: UserDBImportColumn[]): Array<{ name: string; type: string }> {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Import requires at least one column');
  }
  const seen = new Set<string>();
  return columns.map((column, index) => {
    if (!column || typeof column !== 'object') {
      throw new Error(`Invalid column definition at index ${index}`);
    }
    if (typeof column.name !== 'string' || column.name.trim().length === 0) {
      throw new Error('Column name cannot be empty or blank');
    }
    if (typeof column.type !== 'string' || column.type.trim().length === 0) {
      throw new Error('Column type cannot be empty');
    }
    const name = column.name.trim();
    const type = column.type.trim();
    if (/[;\n\r]/.test(type) || /--/.test(type) || /\/\*/.test(type)) {
      throw new Error('Invalid column type');
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate column name: ${name}`);
    }
    seen.add(key);
    return { name, type };
  });
}

/**
 * Managed file import: create one table and insert all rows atomically.
 * Default policy refuses an existing table name (no silent append).
 */
export function importTable(
  id: string,
  tableName: string,
  columns: UserDBImportColumn[],
  rows: unknown[][],
  options: UserDBImportOptions = {},
): { inserted: number } {
  const resolvedTable = validateImportTableName(tableName);
  const resolvedColumns = validateImportColumns(columns);
  const ifExists = options.ifExists ?? 'error';
  if (ifExists !== 'error' && ifExists !== 'replace') {
    throw new Error(`Unknown ifExists policy: ${String(ifExists)}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error('Import rows must be an array');
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== resolvedColumns.length) {
      throw new Error(`Row ${i} width does not match column count`);
    }
  }

  const db = openDB(id, false);
  try {
    const existing = db.prepare(
      `SELECT name FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type = 'table'`
    ).get(resolvedTable) as { name: string } | undefined;

    if (existing && ifExists === 'error') {
      throw new Error(`Table already exists: ${existing.name}`);
    }

    const colDefs = resolvedColumns
      .map((column) => `${quoteIdentifier(column.name)} ${column.type}`)
      .join(', ');
    const createSql = `CREATE TABLE ${quoteIdentifier(resolvedTable)} (${colDefs})`;
    const colList = resolvedColumns.map((column) => quoteIdentifier(column.name)).join(', ');
    const placeholders = resolvedColumns.map(() => '?').join(', ');
    const insertSql = `INSERT INTO ${quoteIdentifier(resolvedTable)} (${colList}) VALUES (${placeholders})`;

    const runImport = db.transaction(() => {
      if (existing && ifExists === 'replace') {
        db.prepare(`DROP TABLE ${quoteIdentifier(existing.name)}`).run();
        deleteTableComments(db, existing.name);
      }
      db.prepare(createSql).run();
      if (rows.length === 0) return { inserted: 0 };
      const stmt = db.prepare(insertSql);
      let inserted = 0;
      for (const row of rows) {
        stmt.run(row as any[]);
        inserted += 1;
      }
      return { inserted };
    });
    return runImport();
  } finally {
    db.close();
  }
}

export function dropTable(id: string, tableName: string): void {
  const db = openDB(id, false);
  try {
    const object = db.prepare(
      `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type = 'table'`
    ).get(tableName) as { name: string; type: 'table' } | undefined;
    if (!object) {
      // Preserve previous IF EXISTS behavior for missing tables.
      db.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`).run();
      return;
    }
    db.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(object.name)}`).run();
    deleteTableComments(db, object.name);
  } finally {
    db.close();
  }
}

export function addColumn(id: string, tableName: string, colName: string, colType: string): void {
  if (typeof colName !== 'string' || colName.trim().length === 0) {
    throw new Error('Column name cannot be empty or blank');
  }
  if (typeof colType !== 'string' || colType.trim().length === 0) {
    throw new Error('Column type cannot be empty');
  }
  const trimmedName = colName.trim();
  const trimmedType = colType.trim();
  // Managed addColumn accepts a single type expression only.
  if (/[;\n\r]/.test(trimmedType) || /--/.test(trimmedType) || /\/\*/.test(trimmedType)) {
    throw new Error('Invalid column type');
  }

  const db = openDB(id, false);
  try {
    if (!tableName || /^sqlite_/i.test(tableName) || tableName === '__col_comments') {
      throw new Error(`Unknown table: ${tableName}`);
    }
    const object = db.prepare(
      `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type = 'table'`
    ).get(tableName) as { name: string; type: 'table' } | undefined;
    if (!object) throw new Error(`Unknown table: ${tableName}`);

    db.prepare(
      `ALTER TABLE ${quoteIdentifier(object.name)} ADD COLUMN ${quoteIdentifier(trimmedName)} ${trimmedType}`
    ).run();
  } finally {
    db.close();
  }
}

const COLUMN_CONSTRAINT_START =
  /^(CONSTRAINT|PRIMARY|NOT|UNIQUE|CHECK|DEFAULT|COLLATE|REFERENCES|GENERATED|AS|NULL|ON)\b/i;

function identifiersEqual(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function extractLeadingIdentifier(sql: string): { raw: string; name: string } | null {
  const trimmed = sql.trimStart();
  const match = trimmed.match(/^(?:"((?:[^"]|"")*)"|\[([^\]]+)\]|`([^`]+)`|([A-Za-z_][\w$]*))/);
  if (!match) return null;
  const raw = match[0];
  const name = match[1] != null
    ? match[1].replace(/""/g, '"')
    : match[2] != null
      ? match[2]
      : match[3] != null
        ? match[3]
        : match[4];
  return { raw, name };
}

function splitTopLevelCsv(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBracket = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inDouble) {
      current += ch;
      if (ch === '"' && input[i + 1] === '"') {
        current += input[++i];
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'" && input[i + 1] === "'") {
        current += input[++i];
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inBracket) {
      current += ch;
      if (ch === ']') inBracket = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }
    if (ch === '[') {
      inBracket = true;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

function isTableConstraintClause(clause: string): boolean {
  return /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(clause.trim());
}

function skipSqlTypeName(sql: string): string {
  let i = 0;
  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i]!)) i += 1;
    if (i >= sql.length) break;
    const tail = sql.slice(i);
    if (COLUMN_CONSTRAINT_START.test(tail)) break;
    if (sql[i] === '(') {
      let depth = 0;
      for (; i < sql.length; i++) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
      }
      continue;
    }
    if (!/[A-Za-z_]/.test(sql[i]!)) break;
    while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i]!)) i += 1;
  }
  return sql.slice(i);
}

function replaceColumnTypeInDefinition(columnDef: string, newType: string): string {
  const leadingWs = columnDef.match(/^\s*/)?.[0] ?? '';
  const body = columnDef.slice(leadingWs.length);
  const ident = extractLeadingIdentifier(body);
  if (!ident) throw new Error('Malformed column definition');
  const afterName = body.slice(ident.raw.length);
  const afterNameTrimStart = afterName.match(/^\s*/)?.[0] ?? '';
  const remainder = afterName.slice(afterNameTrimStart.length);
  const afterType = skipSqlTypeName(remainder).replace(/^\s*/, '');
  const typePart = newType.trim();
  return afterType.length > 0
    ? `${leadingWs}${ident.raw} ${typePart} ${afterType}`
    : `${leadingWs}${ident.raw} ${typePart}`;
}

function rewriteCreateTableSql(
  createSql: string,
  columnName: string,
  newType: string,
  tempTableName: string,
): string {
  const openParen = createSql.indexOf('(');
  if (openParen < 0) throw new Error('Malformed CREATE TABLE statement');
  let depth = 0;
  let closeParen = -1;
  let inSingle = false;
  let inDouble = false;
  for (let i = openParen; i < createSql.length; i++) {
    const ch = createSql[i]!;
    if (inDouble) {
      if (ch === '"' && createSql[i + 1] === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && createSql[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen < 0) throw new Error('Malformed CREATE TABLE statement');

  const header = createSql.slice(0, openParen).replace(
    /^(\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|\w+)\s*\.\s*)?)(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|\w+)/i,
    `$1${quoteIdentifier(tempTableName)}`,
  );
  const body = createSql.slice(openParen + 1, closeParen);
  const suffix = createSql.slice(closeParen + 1);
  const parts = splitTopLevelCsv(body);
  let found = false;
  const rewrittenParts = parts.map((part) => {
    if (isTableConstraintClause(part)) return part;
    const ident = extractLeadingIdentifier(part);
    if (!ident || !identifiersEqual(ident.name, columnName)) return part;
    found = true;
    return replaceColumnTypeInDefinition(part, newType);
  });
  if (!found) throw new Error(`Unknown column: ${columnName}`);
  return `${header}(${rewrittenParts.join(',')})${suffix}`;
}

function sqlReferencesIdentifier(sql: string, identifier: string): boolean {
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "'" ) {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let name = '';
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') {
          name += '"';
          j += 2;
          continue;
        }
        if (sql[j] === '"') {
          j += 1;
          break;
        }
        name += sql[j];
        j += 1;
      }
      if (identifiersEqual(name, identifier)) return true;
      i = j;
      continue;
    }
    if (ch === '[') {
      const end = sql.indexOf(']', i + 1);
      if (end < 0) break;
      const name = sql.slice(i + 1, end);
      if (identifiersEqual(name, identifier)) return true;
      i = end + 1;
      continue;
    }
    if (ch === '`') {
      const end = sql.indexOf('`', i + 1);
      if (end < 0) break;
      const name = sql.slice(i + 1, end);
      if (identifiersEqual(name, identifier)) return true;
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j]!)) j += 1;
      const name = sql.slice(i, j);
      if (identifiersEqual(name, identifier)) return true;
      i = j;
      continue;
    }
    i += 1;
  }
  return false;
}

function tableConstraintReferencesColumn(clause: string, columnName: string): boolean {
  return sqlReferencesIdentifier(clause, columnName);
}

function removeColumnFromCreateTableSql(
  createSql: string,
  columnName: string,
  tempTableName: string,
): string {
  const openParen = createSql.indexOf('(');
  if (openParen < 0) throw new Error('Malformed CREATE TABLE statement');
  let depth = 0;
  let closeParen = -1;
  let inSingle = false;
  let inDouble = false;
  for (let i = openParen; i < createSql.length; i++) {
    const ch = createSql[i]!;
    if (inDouble) {
      if (ch === '"' && createSql[i + 1] === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && createSql[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen < 0) throw new Error('Malformed CREATE TABLE statement');

  const header = createSql.slice(0, openParen).replace(
    /^(\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|\w+)\s*\.\s*)?)(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|\w+)/i,
    `$1${quoteIdentifier(tempTableName)}`,
  );
  const body = createSql.slice(openParen + 1, closeParen);
  const suffix = createSql.slice(closeParen + 1);
  const parts = splitTopLevelCsv(body);
  let found = false;
  const rewrittenParts = parts.filter((part) => {
    if (isTableConstraintClause(part)) {
      // Drop table-level constraints that still name the removed column.
      return !tableConstraintReferencesColumn(part, columnName);
    }
    const ident = extractLeadingIdentifier(part);
    if (ident && identifiersEqual(ident.name, columnName)) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) throw new Error(`Unknown column: ${columnName}`);
  if (rewrittenParts.length === 0) {
    throw new Error(`Cannot drop the last column from table`);
  }
  return `${header}(${rewrittenParts.join(',')})${suffix}`;
}

/**
 * Modify a column definition. SQLite doesn't support ALTER COLUMN so we
 * rebuild the table inside a transaction while preserving the original DDL
 * constraints and secondary indexes.
 */
export function alterColumn(
  id: string,
  tableName: string,
  colName: string,
  newType?: string,
  newComment?: string,
): void {
  const db = openDB(id, false);
  try {
    if (!tableName || /^sqlite_/i.test(tableName) || tableName === '__col_comments') {
      throw new Error(`Unknown table: ${tableName}`);
    }

    const object = db.prepare(
      `SELECT name, type, sql FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type IN ('table', 'view')`
    ).get(tableName) as { name: string; type: 'table' | 'view'; sql: string | null } | undefined;
    if (!object || object.type !== 'table' || !object.sql) {
      throw new Error(`Unknown table: ${tableName}`);
    }

    const cols = db.pragma(`table_info(${quoteIdentifier(object.name)})`) as Array<{
      name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
    }>;
    const targetCol = cols.find((column) => identifiersEqual(column.name, colName));
    if (!targetCol) throw new Error(`Unknown column: ${colName}`);

    const trimmedType = typeof newType === 'string' ? newType.trim() : undefined;
    const typeProvided = trimmedType !== undefined && trimmedType.length > 0;
    const typeUnchanged = !typeProvided
      || trimmedType!.localeCompare(targetCol.type ?? '', undefined, { sensitivity: 'accent' }) === 0;

    if (!typeProvided || typeUnchanged) {
      if (newComment !== undefined) {
        ensureColumnCommentsMeta(db);
        db.prepare(
          `INSERT OR REPLACE INTO __col_comments (table_name, col_name, comment) VALUES (?, ?, ?)`
        ).run(object.name, targetCol.name, newComment);
      }
      return;
    }

    const indexes = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`
    ).all(object.name) as Array<{ sql: string }>;
    const triggers = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql IS NOT NULL`
    ).all(object.name) as Array<{ sql: string }>;

    const tmpName = `__tmp_${object.name}_${Date.now()}`;
    const rewrittenDdl = rewriteCreateTableSql(object.sql, targetCol.name, trimmedType!, tmpName);
    const colNames = cols.map((column) => quoteIdentifier(column.name)).join(', ');

    const transaction = db.transaction(() => {
      db.exec(rewrittenDdl);
      db.exec(
        `INSERT INTO ${quoteIdentifier(tmpName)} (${colNames}) SELECT ${colNames} FROM ${quoteIdentifier(object.name)}`
      );
      db.exec(`DROP TABLE ${quoteIdentifier(object.name)}`);
      db.exec(`ALTER TABLE ${quoteIdentifier(tmpName)} RENAME TO ${quoteIdentifier(object.name)}`);
      for (const index of indexes) db.exec(index.sql);
      for (const trigger of triggers) db.exec(trigger.sql);
    });
    transaction();

    if (newComment !== undefined) {
      ensureColumnCommentsMeta(db);
      db.prepare(
        `INSERT OR REPLACE INTO __col_comments (table_name, col_name, comment) VALUES (?, ?, ?)`
      ).run(object.name, targetCol.name, newComment);
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

function hasColumnCommentsMeta(db: Database.Database): boolean {
  const row = db.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = '__col_comments'`
  ).get() as { ok: number } | undefined;
  return Boolean(row);
}

function rewriteTableComments(db: Database.Database, oldTable: string, newTable: string): void {
  if (!hasColumnCommentsMeta(db)) return;
  db.prepare(
    `UPDATE __col_comments SET table_name = ? WHERE table_name = ? COLLATE NOCASE`
  ).run(newTable, oldTable);
}

function rewriteColumnComment(
  db: Database.Database,
  tableName: string,
  oldColName: string,
  newColName: string,
): void {
  if (!hasColumnCommentsMeta(db)) return;
  db.prepare(
    `UPDATE __col_comments
     SET col_name = ?
     WHERE table_name = ? COLLATE NOCASE
       AND col_name = ? COLLATE NOCASE`
  ).run(newColName, tableName, oldColName);
}

function deleteColumnComment(db: Database.Database, tableName: string, colName: string): void {
  if (!hasColumnCommentsMeta(db)) return;
  db.prepare(
    `DELETE FROM __col_comments
     WHERE table_name = ? COLLATE NOCASE
       AND col_name = ? COLLATE NOCASE`
  ).run(tableName, colName);
}

function deleteTableComments(db: Database.Database, tableName: string): void {
  if (!hasColumnCommentsMeta(db)) return;
  db.prepare(
    `DELETE FROM __col_comments WHERE table_name = ? COLLATE NOCASE`
  ).run(tableName);
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
  try {
    const safe = (s: string) => s.replace(/"/g, '""');
    const colList = columns.map((c) => `"${safe(c)}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO "${safe(tableName)}" (${colList}) VALUES (${placeholders})`);
    // One outer transaction for the entire payload: partial success is not allowed.
    const runAll = db.transaction((allRows: unknown[][]) => {
      let inserted = 0;
      for (const row of allRows) {
        stmt.run(row as any[]);
        inserted += 1;
      }
      return { inserted };
    });
    return runAll(rows);
  } finally {
    db.close();
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function exportTableData(id: string, tableName: string, format: 'csv' | 'json'): string {
  const db = openDB(id, true);
  try {
    if (!tableName || typeof tableName !== 'string' || /^sqlite_/i.test(tableName) || tableName === '__col_comments') {
      throw new Error(`Unknown table: ${tableName}`);
    }
    const object = db.prepare(
      `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type IN ('table', 'view')`
    ).get(tableName) as { name: string; type: 'table' | 'view' } | undefined;
    if (!object) throw new Error(`Unknown table: ${tableName}`);

    const colInfo = db.pragma(`table_info(${quoteIdentifier(object.name)})`) as Array<{ name: string }>;
    const columns = colInfo.map((c) => c.name);
    // safeIntegers: preserve INTEGER magnitude beyond Number.MAX_SAFE_INTEGER.
    const rows = db.prepare(
      `SELECT * FROM ${quoteIdentifier(object.name)}`
    ).safeIntegers(true).all() as Record<string, unknown>[];

    const normalizeCell = (value: unknown): unknown => {
      if (value === undefined) return null;
      return normalizeVisibleInteger(value);
    };

    if (format === 'json') {
      if (!rows.length) return '[]';
      // Prefer schema column order for stable export.
      return JSON.stringify(
        rows.map((row) => {
          const ordered: Record<string, unknown> = {};
          for (const col of columns) ordered[col] = normalizeCell(row[col]);
          return ordered;
        }),
        null,
        2,
      );
    }

    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const header = columns.join(',');
    if (!rows.length) return header;
    const lines = [
      header,
      ...rows.map((r) => columns.map((c) => escape(normalizeCell(r[c]))).join(',')),
    ];
    return lines.join('\n');
  } finally {
    db.close();
  }
}

// ─── Table data preview ──────────────────────────────────────────────────────

export function getUserDBTableData(id: string, tableName: string, limit = 200, offset = 0): UserDBTableDataResult {
  const db = openDB(id, true);
  try {
    const identity = inspectTableIdentity(db, tableName);
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM ${quoteIdentifier(tableName)}`
    ).get() as { cnt: number };
    const identityColumns = identity.rowidAlias
      ? [`CAST(${quoteIdentifier(identity.rowidAlias)} AS TEXT)`]
      : identity.primaryKeyColumns.map((column) => quoteIdentifier(column.name));
    const identitySelection = identityColumns.length > 0 ? `${identityColumns.join(', ')}, ` : '';
    const selectedRows = db.prepare(
      `SELECT ${identitySelection}* FROM ${quoteIdentifier(tableName)} LIMIT ? OFFSET ?`
    ).safeIntegers(true).raw(true).all(limit, offset) as unknown[][];
    const columns = identity.columns.map((column) => column.name);
    const identityOffset = identityColumns.length;
    const rows = selectedRows.map((row) => row.slice(identityOffset).map(normalizeVisibleInteger));
    const rowLocators = selectedRows.map((selectedRow): UserDBRowLocator | null => {
      if (identity.rowidAlias) {
        const value = selectedRow[0];
        return typeof value === 'string' ? { kind: 'rowid', value } : null;
      }
      if (identity.primaryKeyColumns.length > 0) {
        const entries: Array<[string, unknown]> = [];
        for (const [index, column] of identity.primaryKeyColumns.entries()) {
          const value = selectedRow[index];
          if (value === undefined || value === null) return null;
          entries.push([column.name, normalizePrimaryKeyValue(value)]);
        }
        return { kind: 'primary-key', values: Object.fromEntries(entries) };
      }
      return null;
    });
    return {
      columns,
      rows,
      rowLocators,
      editable: identity.objectType === 'table'
        && (identity.rowidAlias !== null || identity.primaryKeyColumns.length > 0),
      rowCount: rows.length,
      totalCount: totalRow?.cnt ?? 0,
    };
  } finally {
    db.close();
  }
}

// ─── Table / Column DDL ───────────────────────────────────────────────────────

function validateUserObjectName(name: string, kind: 'table' | 'column'): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`${kind === 'table' ? 'Table' : 'Column'} name cannot be empty or blank`);
  }
  const trimmed = name.trim();
  if (kind === 'table' && (/^sqlite_/i.test(trimmed) || trimmed === '__col_comments')) {
    throw new Error(`Invalid reserved table name: ${trimmed}`);
  }
  return trimmed;
}

export function renameTable(id: string, oldName: string, newName: string): void {
  const resolvedNew = validateUserObjectName(newName, 'table');
  const db = openDB(id, false);
  try {
    const object = db.prepare(
      `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type = 'table'`
    ).get(oldName) as { name: string; type: 'table' } | undefined;
    if (!object) throw new Error(`Unknown table: ${oldName}`);
    db.prepare(
      `ALTER TABLE ${quoteIdentifier(object.name)} RENAME TO ${quoteIdentifier(resolvedNew)}`
    ).run();
    rewriteTableComments(db, object.name, resolvedNew);
  } finally {
    db.close();
  }
}

export function renameColumn(id: string, tableName: string, oldColName: string, newColName: string): void {
  const resolvedNew = validateUserObjectName(newColName, 'column');
  const db = openDB(id, false);
  try {
    const object = db.prepare(
      `SELECT name, type FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type = 'table'`
    ).get(tableName) as { name: string; type: 'table' } | undefined;
    if (!object) throw new Error(`Unknown table: ${tableName}`);
    const cols = db.pragma(`table_info(${quoteIdentifier(object.name)})`) as Array<{ name: string }>;
    const targetCol = cols.find((column) => identifiersEqual(column.name, oldColName));
    if (!targetCol) throw new Error(`Unknown column: ${oldColName}`);
    // SQLite 3.25.0+ supports RENAME COLUMN
    db.prepare(
      `ALTER TABLE ${quoteIdentifier(object.name)} RENAME COLUMN ${quoteIdentifier(targetCol.name)} TO ${quoteIdentifier(resolvedNew)}`
    ).run();
    rewriteColumnComment(db, object.name, targetCol.name, resolvedNew);
  } finally {
    db.close();
  }
}

export function dropColumn(id: string, tableName: string, colName: string): void {
  const db = openDB(id, false);
  try {
    if (!tableName || /^sqlite_/i.test(tableName) || tableName === '__col_comments') {
      throw new Error(`Unknown table: ${tableName}`);
    }

    const object = db.prepare(
      `SELECT name, type, sql FROM sqlite_master WHERE name = ? COLLATE NOCASE AND type IN ('table', 'view')`
    ).get(tableName) as { name: string; type: 'table' | 'view'; sql: string | null } | undefined;
    if (!object || object.type !== 'table' || !object.sql) {
      throw new Error(`Unknown table: ${tableName}`);
    }

    const cols = db.pragma(`table_info(${quoteIdentifier(object.name)})`) as Array<{
      name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
    }>;
    const targetCol = cols.find((column) => identifiersEqual(column.name, colName));
    if (!targetCol) throw new Error(`Unknown column: ${colName}`);
    if (cols.length <= 1) {
      throw new Error('Cannot drop the last column from table');
    }

    const indexes = db.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`
    ).all(object.name) as Array<{ name: string; sql: string }>;
    const triggers = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql IS NOT NULL`
    ).all(object.name) as Array<{ sql: string }>;

    const dependentIndexes = indexes.filter((index) => sqlReferencesIdentifier(index.sql, targetCol.name));
    const retainedIndexes = indexes.filter((index) => !sqlReferencesIdentifier(index.sql, targetCol.name));
    const retainedTriggers = triggers.filter((trigger) => !sqlReferencesIdentifier(trigger.sql, targetCol.name));

    const tryNativeDrop = db.transaction(() => {
      for (const index of dependentIndexes) {
        db.exec(`DROP INDEX IF EXISTS ${quoteIdentifier(index.name)}`);
      }
      db.prepare(
        `ALTER TABLE ${quoteIdentifier(object.name)} DROP COLUMN ${quoteIdentifier(targetCol.name)}`
      ).run();
    });

    try {
      tryNativeDrop();
      deleteColumnComment(db, object.name, targetCol.name);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Residual CHECK / generated-column / constraint dependencies need a rebuild.
      if (!/CHECK|generated|constraint|dependency|references|error in/i.test(message)
        && !/no such column|cannot drop/i.test(message)) {
        throw error;
      }
    }

    const tmpName = `__tmp_${object.name}_${Date.now()}`;
    const rewrittenDdl = removeColumnFromCreateTableSql(object.sql, targetCol.name, tmpName);
    const remainingCols = cols
      .filter((column) => !identifiersEqual(column.name, targetCol.name))
      .map((column) => quoteIdentifier(column.name))
      .join(', ');

    const rebuild = db.transaction(() => {
      // Dependent indexes may already have been dropped by the native attempt; recreate only retained ones.
      for (const index of dependentIndexes) {
        db.exec(`DROP INDEX IF EXISTS ${quoteIdentifier(index.name)}`);
      }
      db.exec(rewrittenDdl);
      db.exec(
        `INSERT INTO ${quoteIdentifier(tmpName)} (${remainingCols}) SELECT ${remainingCols} FROM ${quoteIdentifier(object.name)}`
      );
      db.exec(`DROP TABLE ${quoteIdentifier(object.name)}`);
      db.exec(`ALTER TABLE ${quoteIdentifier(tmpName)} RENAME TO ${quoteIdentifier(object.name)}`);
      for (const index of retainedIndexes) db.exec(index.sql);
      for (const trigger of retainedTriggers) db.exec(trigger.sql);
      deleteColumnComment(db, object.name, targetCol.name);
    });
    rebuild();
  } finally {
    db.close();
  }
}

export function updateRow(
  id: string,
  tableName: string,
  locator: UserDBRowLocator,
  updates: Record<string, unknown>,
): { changes: 1 } {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Malformed row updates');
  }
  const updateEntries = Object.entries(updates);
  if (updateEntries.length === 0) throw new Error('Empty row update');
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    throw new Error('Malformed row locator');
  }
  const db = openDB(id, false);
  try {
    const identity = inspectTableIdentity(db, tableName);
    if (identity.objectType !== 'table') throw new Error(`Table is not editable: ${tableName}`);

    const columnByName = new Map(identity.columns.map((column) => [column.name, column]));
    const coercedValues: unknown[] = [];
    for (const [columnName, rawValue] of updateEntries) {
      const column = columnByName.get(columnName);
      if (!column) throw new Error(`Unknown column: ${columnName}`);
      if (column.hidden !== 0) throw new Error(`Generated column is read-only: ${columnName}`);
      coercedValues.push(coerceUpdateValue(column, rawValue));
    }

    let whereClause: string;
    let whereValues: unknown[];
    if (locator.kind === 'rowid') {
      if (!identity.rowidAlias) throw new Error('Rowid locator is not valid for this table');
      if (typeof locator.value !== 'string' || locator.value.length > 20 || !/^-?\d+$/.test(locator.value)) {
        throw new Error('Malformed rowid locator');
      }
      const rowidValue = BigInt(locator.value);
      if (rowidValue < SQLITE_ROWID_MIN || rowidValue > SQLITE_ROWID_MAX) {
        throw new Error('Malformed rowid locator');
      }
      whereClause = `${quoteIdentifier(identity.rowidAlias)} = ?`;
      whereValues = [rowidValue];
    } else if (locator.kind === 'primary-key') {
      if (!locator.values || typeof locator.values !== 'object' || Array.isArray(locator.values)) {
        throw new Error('Malformed primary key locator');
      }
      const expectedColumns = identity.primaryKeyColumns.map((column) => column.name);
      const suppliedColumns = Object.keys(locator.values);
      if (
        expectedColumns.length === 0
        || suppliedColumns.length !== expectedColumns.length
        || expectedColumns.some((column) => !Object.prototype.hasOwnProperty.call(locator.values, column))
      ) {
        throw new Error('Primary key locator does not match the live table primary key');
      }
      whereClause = expectedColumns.map((column) => `${quoteIdentifier(column)} IS ?`).join(' AND ');
      whereValues = expectedColumns.map((column) => locator.values[column]);
    } else {
      throw new Error('Unknown row locator');
    }

    const setClauses = updateEntries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(', ');
    const statement = db.prepare(
      `UPDATE ${quoteIdentifier(tableName)} SET ${setClauses} WHERE ${whereClause}`
    );
    const runUpdate = db.transaction(() => {
      const result = statement.run(...([...coercedValues, ...whereValues] as any[]));
      if (result.changes !== 1) {
        throw new Error(`Stale or ambiguous row locator: expected exactly one row, changed ${result.changes}`);
      }
      return { changes: 1 as const };
    });
    return runUpdate();
  } finally {
    db.close();
  }
}
