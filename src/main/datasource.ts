/**
 * datasource.ts — Main-process datasource manager.
 *
 * Handles multiple external DB connections (MySQL / MariaDB / Doris, PostgreSQL).
 * Config is persisted as a JSON file inside the user-data directory.
 *
 * NOTE: All query execution happens in the main process so that DB credentials
 * never leave the Electron backend.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataDir } from './dataDir';

// ─── Types (duplicated here for main-process use) ──────────────────────────

export type DatasourceType = 'mysql' | 'doris' | 'postgresql' | 'presto';

export interface DatasourceConfig {
  id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** Character encoding, e.g. 'UTF-8' */
  charset?: string;
  /** JDBC FetchSize hint (-1 = driver default) */
  fetchSize?: number;
  /** Socket timeout in seconds */
  socketTimeout?: number;
  /** Maximum pool active connections */
  maxPoolSize?: number;
  /** Validate connection before borrow */
  validateOnBorrow?: boolean;
  /** Extra options, e.g. ssl, schema */
  options?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionMs: number;
}

export interface SchemaInfo {
  tables: Array<{
    name: string;
    comment?: string;
    columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }>;
  }>;
  total?: number;
}

export interface SchemaOptions {
  limit?: number;
  search?: string;
}

export interface TableDataResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

// ─── Persistence ────────────────────────────────────────────────────────────

function getDatasourceFile(): string {
  const dir = getDataDir();
  return path.join(dir, 'datasources.json');
}

function readDatasources(): DatasourceConfig[] {
  const file = getDatasourceFile();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as DatasourceConfig[];
  } catch {
    return [];
  }
}

function writeDatasources(configs: DatasourceConfig[]): void {
  const file = getDatasourceFile();
  fs.writeFileSync(file, JSON.stringify(configs, null, 2), 'utf-8');
}

// ─── Manager ────────────────────────────────────────────────────────────────

/** Sentinel value sent to renderer instead of the real password */
export const MASKED_PW = '__MASKED__';

export function getAllDatasources(): DatasourceConfig[] {
  return readDatasources();
}

/** Return datasources with passwords replaced by the masked sentinel — safe to send to renderer */
export function getMaskedDatasources(): DatasourceConfig[] {
  return readDatasources().map((c) => ({
    ...c,
    password: c.password ? MASKED_PW : '',
  }));
}

export function saveDatasource(config: DatasourceConfig): DatasourceConfig {
  const all = readDatasources();
  const idx = all.findIndex((c) => c.id === config.id);
  const now = new Date().toISOString();
  // Preserve the stored password when the renderer sent back the masked sentinel
  const realPassword = config.password === MASKED_PW
    ? (all[idx]?.password ?? '')
    : config.password;
  const updated: DatasourceConfig = { ...config, password: realPassword, updatedAt: now };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    updated.createdAt = now;
    all.push(updated);
  }
  writeDatasources(all);
  return { ...updated, password: updated.password ? MASKED_PW : '' };
}

export function deleteDatasource(id: string): void {
  const all = readDatasources().filter((c) => c.id !== id);
  writeDatasources(all);
}

// ─── MySQL / Doris Connection ────────────────────────────────────────────────

async function mysqlQuery(
  cfg: DatasourceConfig,
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  // Dynamic import so the package is only loaded when needed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mysql2 = require('mysql2/promise') as typeof import('mysql2/promise');
  const t0 = Date.now();
  const conn = await mysql2.createConnection({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    connectTimeout: 10000,
    ...(cfg.options ?? {}),
  });
  try {
    const [rawRows, fields] = await conn.query(sql, params ?? []);
    const rows = rawRows as Record<string, unknown>[];
    const columns = (fields as { name: string }[]).map((f) => f.name);
    const result: QueryResult = {
      columns,
      rows: rows.map((r) => columns.map((c) => r[c] ?? null)),
      rowCount: rows.length,
      executionMs: Date.now() - t0,
    };
    return result;
  } finally {
    await conn.end();
  }
}

async function mysqlSchema(cfg: DatasourceConfig, opts: SchemaOptions = {}): Promise<SchemaInfo> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mysql2 = require('mysql2/promise') as typeof import('mysql2/promise');
  const conn = await mysql2.createConnection({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    connectTimeout: 10000,
  });
  const { limit = 10, search } = opts;
  try {
    const db = cfg.database;
    // Count total tables
    const [countRows] = await conn.query<import('mysql2').RowDataPacket[]>(
      search
        ? `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE ?`
        : `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
      search ? [db, `%${search}%`] : [db]
    );
    const total = Number((countRows[0] as any).cnt ?? 0);
    // Fetch table list with comments
    const [tableRows] = await conn.query<import('mysql2').RowDataPacket[]>(
      search
        ? `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE ? ORDER BY TABLE_NAME LIMIT ?`
        : `SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME LIMIT ?`,
      search ? [db, `%${search}%`, limit] : [db, limit]
    );
    const tables: SchemaInfo['tables'] = [];
    for (const tr of tableRows) {
      const tName = tr['TABLE_NAME'] as string;
      const tComment = (tr['TABLE_COMMENT'] as string) || undefined;
      const [colRows] = await conn.query<import('mysql2').RowDataPacket[]>(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [db, tName]
      );
      tables.push({
        name: tName,
        comment: tComment,
        columns: colRows.map((c) => ({
          name: c['COLUMN_NAME'] as string,
          type: c['COLUMN_TYPE'] as string,
          nullable: (c['IS_NULLABLE'] as string) === 'YES',
          comment: (c['COLUMN_COMMENT'] as string) || undefined,
        })),
      });
    }
    return { tables, total };
  } finally {
    await conn.end();
  }
}

async function mysqlTableData(cfg: DatasourceConfig, tableName: string): Promise<TableDataResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mysql2 = require('mysql2/promise') as typeof import('mysql2/promise');
  const conn = await mysql2.createConnection({
    host: cfg.host, port: cfg.port, database: cfg.database,
    user: cfg.username, password: cfg.password, connectTimeout: 10000,
  });
  try {
    const safeName = tableName.replace(/`/g, '');
    const [rawRows, fields] = await conn.query(`SELECT * FROM \`${safeName}\` LIMIT 100`);
    const rows = rawRows as Record<string, unknown>[];
    const columns = (fields as { name: string }[]).map((f) => f.name);
    return { columns, rows: rows.map((r) => columns.map((c) => r[c] ?? null)), rowCount: rows.length };
  } finally {
    await conn.end();
  }
}

// ─── PostgreSQL Connection ───────────────────────────────────────────────────

async function pgQuery(
  cfg: DatasourceConfig,
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg') as typeof import('pg');
  const t0 = Date.now();
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    connectionTimeoutMillis: 10000,
    ...(cfg.options ?? {}),
  });
  await client.connect();
  try {
    const res = await client.query(sql, params as never[] ?? []);
    const columns = res.fields.map((f) => f.name);
    return {
      columns,
      rows: res.rows.map((r: Record<string, unknown>) => columns.map((c) => r[c] ?? null)),
      rowCount: res.rowCount ?? res.rows.length,
      executionMs: Date.now() - t0,
    };
  } finally {
    await client.end();
  }
}

async function pgSchema(cfg: DatasourceConfig, opts: SchemaOptions = {}): Promise<SchemaInfo> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({
    host: cfg.host, port: cfg.port, database: cfg.database,
    user: cfg.username, password: cfg.password, connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const { limit = 10, search } = opts;
  try {
    const schema = (cfg.options?.schema as string) ?? 'public';
    // Count total
    const countRes = await client.query<{ cnt: string }>(
      search
        ? `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name ILIKE $2`
        : `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      search ? [schema, `%${search}%`] : [schema]
    );
    const total = Number(countRes.rows[0]?.cnt ?? 0);
    const tableRes = await client.query<{ table_name: string }>(
      search
        ? `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name ILIKE $2 ORDER BY table_name LIMIT $3`
        : `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT $2`,
      search ? [schema, `%${search}%`, limit] : [schema, limit]
    );
    const tables: SchemaInfo['tables'] = [];
    for (const tr of tableRes.rows) {
      // Get table comment and column info together
      const { rows: tableCommentRows } = await client.query<{ tbl_description: string | null }>(
        `SELECT pg_catalog.obj_description(t.oid) AS tbl_description
         FROM pg_catalog.pg_class t
         JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
         WHERE t.relname = $1 AND n.nspname = $2`,
        [tr.table_name, schema]
      );
      const tComment = tableCommentRows[0]?.tbl_description ?? undefined;
      const { rows: colRows } = await client.query<{
        column_name: string; data_type: string; is_nullable: string; col_description: string;
      }>(
        `SELECT c.column_name, c.data_type, c.is_nullable,
                pg_catalog.col_description(t.oid, c.ordinal_position::int) AS col_description
         FROM   information_schema.columns c
         JOIN   pg_catalog.pg_class t ON t.relname = c.table_name
         JOIN   pg_catalog.pg_namespace n ON n.oid = t.relnamespace AND n.nspname = c.table_schema
         WHERE  c.table_schema = $1 AND c.table_name = $2
         ORDER  BY c.ordinal_position`,
        [schema, tr.table_name]
      );
      tables.push({
        name: tr.table_name,
        comment: tComment,
        columns: colRows.map((c) => ({
          name: c.column_name, type: c.data_type,
          nullable: c.is_nullable === 'YES', comment: c.col_description ?? undefined,
        })),
      });
    }
    return { tables, total };
  } finally {
    await client.end();
  }
}

async function pgTableData(cfg: DatasourceConfig, tableName: string): Promise<TableDataResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({
    host: cfg.host, port: cfg.port, database: cfg.database,
    user: cfg.username, password: cfg.password, connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    const safe = tableName.replace(/"/g, '');
    const res = await client.query(`SELECT * FROM "${safe}" LIMIT 100`);
    const columns = res.fields.map((f) => f.name);
    return { columns, rows: res.rows.map((r: Record<string,unknown>) => columns.map(c => r[c] ?? null)), rowCount: res.rowCount ?? res.rows.length };
  } finally {
    await client.end();
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function testDatasource(id: string): Promise<{ ok: boolean; message: string }> {
  const cfg = readDatasources().find((c) => c.id === id);
  if (!cfg) return { ok: false, message: '找不到数据源' };
  try {
    if (cfg.type === 'mysql' || cfg.type === 'doris' || cfg.type === 'presto') {
      await mysqlQuery(cfg, 'SELECT 1');
    } else if (cfg.type === 'postgresql') {
      await pgQuery(cfg, 'SELECT 1');
    }
    return { ok: true, message: '连接成功' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function queryDatasource(
  id: string,
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  const cfg = readDatasources().find((c) => c.id === id);
  if (!cfg) throw new Error(`数据源 "${id}" 不存在`);

  // Safety: only allow SELECT / WITH / SHOW / DESCRIBE / EXPLAIN  (no DDL/DML)
  const normalised = sql.trimStart().toUpperCase();
  const allowed = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'];
  if (!allowed.some((k) => normalised.startsWith(k))) {
    throw new Error('仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 查询');
  }

  if (cfg.type === 'mysql' || cfg.type === 'doris' || cfg.type === 'presto') {
    return mysqlQuery(cfg, sql, params);
  } else if (cfg.type === 'postgresql') {
    return pgQuery(cfg, sql, params);
  }
  throw new Error(`不支持的数据源类型: ${cfg.type}`);
}

export async function getDatasourceSchema(id: string, opts: SchemaOptions = {}): Promise<SchemaInfo> {
  const cfg = readDatasources().find((c) => c.id === id);
  if (!cfg) throw new Error(`数据源 "${id}" 不存在`);

  if (cfg.type === 'mysql' || cfg.type === 'doris' || cfg.type === 'presto') {
    return mysqlSchema(cfg, opts);
  } else if (cfg.type === 'postgresql') {
    return pgSchema(cfg, opts);
  }
  throw new Error(`不支持的数据源类型: ${cfg.type}`);
}

export async function getTableData(id: string, tableName: string): Promise<TableDataResult> {
  const cfg = readDatasources().find((c) => c.id === id);
  if (!cfg) throw new Error(`数据源 "${id}" 不存在`);
  if (cfg.type === 'mysql' || cfg.type === 'doris' || cfg.type === 'presto') {
    return mysqlTableData(cfg, tableName);
  } else if (cfg.type === 'postgresql') {
    return pgTableData(cfg, tableName);
  }
  throw new Error(`不支持的数据源类型: ${cfg.type}`);
}
