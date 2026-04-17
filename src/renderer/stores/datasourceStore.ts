/**
 * datasourceStore.ts — Renderer-side Zustand store for datasource management.
 * Mirrors DatasourceConfig from the main process via IPC.
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

interface DatasourceState {
  datasources: DatasourceConfig[];
  loading: boolean;
  error: string | null;
  /** The datasource ID currently selected by the user in the chat input bar. */
  activeDatasourceId: string | null;

  // Actions
  setActiveDatasource: (id: string | null) => void;
  loadDatasources: () => Promise<void>;
  saveDatasource: (config: DatasourceConfig) => Promise<void>;
  deleteDatasource: (id: string) => Promise<void>;
  testDatasource: (id: string) => Promise<{ ok: boolean; message: string }>;
  queryDatasource: (id: string, sql: string, params?: unknown[]) => Promise<QueryResult>;
  getDatasourceSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  getTableData: (id: string, tableName: string) => Promise<TableDataResult>;
}

const api = () => window.electronAPI as typeof window.electronAPI & {
  datasourceGetAll: () => Promise<DatasourceConfig[]>;
  datasourceSave: (c: DatasourceConfig) => Promise<DatasourceConfig>;
  datasourceDelete: (id: string) => Promise<void>;
  datasourceTest: (id: string) => Promise<{ ok: boolean; message: string }>;
  datasourceQuery: (id: string, sql: string, params?: unknown[]) => Promise<QueryResult>;
  datasourceGetSchema: (id: string, opts?: { limit?: number; search?: string }) => Promise<SchemaInfo>;
  datasourceGetTableData: (id: string, tableName: string) => Promise<TableDataResult>;
};

export const useDatasourceStore = create<DatasourceState>((set) => ({
  datasources: [],
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
}));
