/**
 * datasourceStore.ts — Renderer-side Zustand store for datasource management.
 * Mirrors DatasourceConfig from the main process via IPC.
 * Also manages user-owned embedded SQLite databases (UserDB).
 */

import { create } from 'zustand';

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
  // Advanced
  charset?: string;
  fetchSize?: number;
  socketTimeout?: number;
  // Connection pool
  maxPoolSize?: number;
  validateOnBorrow?: boolean;
  // SSH tunnel
  sshEnabled?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPrivateKey?: string;
  /** Auto-generated, read-only connection URL */
  connUrl?: string;
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

export interface TableDataResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

// ─── User DB types (mirrors src/main/userdb.ts) ──────────────────────────────

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

// ─── Combined active datasource (external or userdb) ─────────────────────────

export type ActiveDatasource = DatasourceConfig | UserDBConfig;

interface DatasourceState {
  datasources: DatasourceConfig[];
  userDBs: UserDBConfig[];
  loading: boolean;
  error: string | null;
  /** The datasource ID currently selected by the user in the chat input bar. */
  activeDatasourceId: string | null;

  // Actions — external datasources
  setActiveDatasource: (id: string | null) => void;
  loadDatasources: () => Promise<void>;
  saveDatasource: (config: DatasourceConfig) => Promise<void>;
  deleteDatasource: (id: string) => Promise<void>;
  testDatasource: (id: string) => Promise<{ ok: boolean; message: string }>;
  queryDatasource: (id: string, sql: string, params?: unknown[]) => Promise<QueryResult>;
  getDatasourceSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  getTableData: (id: string, tableName: string) => Promise<TableDataResult>;

  // Actions — user DBs
  loadUserDBs: () => Promise<void>;
  createUserDB: (name: string, description?: string) => Promise<UserDBConfig>;
  updateUserDB: (id: string, patch: { name?: string; description?: string }) => Promise<UserDBConfig>;
  deleteUserDB: (id: string) => Promise<void>;
  getUserDBSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  executeUserDBSQL: (id: string, sql: string) => Promise<UserDBQueryResult>;

  /** All datasources (external + userdb) merged for display in ChatInput */
  allDatasources: () => ActiveDatasource[];
  /** Find active datasource (external or userdb) */
  getActiveDatasource: () => ActiveDatasource | undefined;
}

const api = () => window.electronAPI as typeof window.electronAPI & {
  datasourceGetAll: () => Promise<DatasourceConfig[]>;
  datasourceSave: (c: DatasourceConfig) => Promise<DatasourceConfig>;
  datasourceDelete: (id: string) => Promise<void>;
  datasourceTest: (id: string) => Promise<{ ok: boolean; message: string }>;
  datasourceQuery: (id: string, sql: string, params?: unknown[]) => Promise<QueryResult>;
  datasourceGetSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  datasourceGetTableData: (id: string, tableName: string) => Promise<TableDataResult>;
  userdbList: () => Promise<UserDBConfig[]>;
  userdbCreate: (name: string, description?: string) => Promise<UserDBConfig>;
  userdbUpdate: (id: string, patch: { name?: string; description?: string }) => Promise<UserDBConfig>;
  userdbDelete: (id: string) => Promise<void>;
  userdbGetSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  userdbExecute: (id: string, sql: string) => Promise<UserDBQueryResult>;
};

export const useDatasourceStore = create<DatasourceState>((set, get) => ({
  datasources: [],
  userDBs: [],
  loading: false,
  error: null,
  activeDatasourceId: null,

  setActiveDatasource: (id) => set({ activeDatasourceId: id }),

  loadDatasources: async () => {
    set({ loading: true, error: null });
    try {
      const list = await api().datasourceGetAll();
      set({ datasources: list, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  saveDatasource: async (config) => {
    const saved = await api().datasourceSave(config);
    const list = await api().datasourceGetAll();
    set({ datasources: list });
    return saved as unknown as void;
  },

  deleteDatasource: async (id) => {
    await api().datasourceDelete(id);
    set((s) => ({
      datasources: s.datasources.filter((d) => d.id !== id),
      activeDatasourceId: s.activeDatasourceId === id ? null : s.activeDatasourceId,
    }));
  },

  testDatasource: (id) => api().datasourceTest(id),

  queryDatasource: (id, sql, params) => api().datasourceQuery(id, sql, params),

  getDatasourceSchema: (id, opts) => api().datasourceGetSchema(id, opts),
  getTableData: (id, tableName) => api().datasourceGetTableData(id, tableName),

  // ─── User DB actions ─────────────────────────────────────────────────────

  loadUserDBs: async () => {
    try {
      const list = await api().userdbList();
      set({ userDBs: list });
    } catch { /* ignore */ }
  },

  createUserDB: async (name, description) => {
    const cfg = await api().userdbCreate(name, description);
    set((s) => ({ userDBs: [...s.userDBs, cfg] }));
    return cfg;
  },

  updateUserDB: async (id, patch) => {
    const cfg = await api().userdbUpdate(id, patch);
    set((s) => ({ userDBs: s.userDBs.map((d) => d.id === id ? cfg : d) }));
    return cfg;
  },

  deleteUserDB: async (id) => {
    await api().userdbDelete(id);
    set((s) => ({
      userDBs: s.userDBs.filter((d) => d.id !== id),
      activeDatasourceId: s.activeDatasourceId === id ? null : s.activeDatasourceId,
    }));
  },

  getUserDBSchema: (id, opts) => api().userdbGetSchema(id, opts),

  executeUserDBSQL: (id, sql) => api().userdbExecute(id, sql),

  // ─── Computed helpers ─────────────────────────────────────────────────────

  allDatasources: () => {
    const s = get();
    return [...(s.userDBs as ActiveDatasource[]), ...(s.datasources as ActiveDatasource[])];
  },

  getActiveDatasource: () => {
    const s = get();
    if (!s.activeDatasourceId) return undefined;
    return (
      s.userDBs.find((d) => d.id === s.activeDatasourceId) as ActiveDatasource | undefined
      ?? s.datasources.find((d) => d.id === s.activeDatasourceId) as ActiveDatasource | undefined
    );
  },
}));
