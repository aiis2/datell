/**
 * queryDatabase — Agent tool that executes a read-only SQL query on a
 * configured datasource and returns the results as a formatted JSON string.
 *
 * For security, only SELECT / WITH / SHOW / DESCRIBE / EXPLAIN are permitted
 * (enforced by the main process).
 */
import type { AgentToolDefinition } from '../types';
import { useConfigStore } from '../stores/configStore';

export const queryDatabaseTool: AgentToolDefinition = {
  name: 'query_database',
  description:
    '在已配置的外部数据库数据源上执行 SQL 查询（仅支持 SELECT/SHOW/DESCRIBE）。' +
    '返回列名、数据行和执行时间。支持 MySQL、Doris、PostgreSQL 数据源。' +
    '使用前请先调用 get_database_schema 了解表结构。',
  parameters: [
    {
      name: 'datasource_id',
      type: 'string',
      description: '数据源 ID（在设置 → 数据源 页面查看）',
      required: true,
    },
    {
      name: 'sql',
      type: 'string',
      description: '要执行的 SQL 查询语句，仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN',
      required: true,
    },
    {
      name: 'max_rows',
      type: 'number',
      description: '返回的最大行数，默认 200，最多 2000',
      required: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const id = String(args.datasource_id ?? '');
    const sql = String(args.sql ?? '');
    const dbMaxRows = useConfigStore.getState().dataParsingLimits.dbQueryMaxRows;
    const maxRows = Math.min(typeof args.max_rows === 'number' ? args.max_rows : dbMaxRows, Math.max(dbMaxRows, 2000));

    if (!id) return '错误: 缺少 datasource_id 参数';
    if (!sql.trim()) return '错误: 缺少 sql 参数';

    // Read-only guard: only allow SELECT/WITH/SHOW/DESCRIBE/EXPLAIN
    const firstKeyword = sql.trim().match(/^\s*(\w+)/)?.[1]?.toUpperCase() ?? '';
    const allowedKeywords = new Set(['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN']);
    if (!allowedKeywords.has(firstKeyword)) {
      return `安全拒绝: SQL 语句以 "${firstKeyword}" 开头。query_database 仅允许只读查询（SELECT/WITH/SHOW/DESCRIBE/EXPLAIN），禁止写操作。`;
    }

    try {
      const elAPI = (window as Window & { electronAPI?: { datasourceQuery?: (id: string, sql: string) => Promise<{ columns: string[]; rows: unknown[][]; rowCount: number; executionMs: number }> } }).electronAPI;
      if (!elAPI?.datasourceQuery) return '错误: 数据源 API 不可用，请在 Electron 环境中运行';
      const result = await elAPI.datasourceQuery(id, sql);
      const trimmed = result.rows.slice(0, maxRows);
      return JSON.stringify({
        columns: result.columns,
        rows: trimmed,
        rowCount: result.rowCount,
        returnedRows: trimmed.length,
        executionMs: result.executionMs,
      }, null, 2);
    } catch (err) {
      return `错误: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 30000,
  getActivityDescription: (args) => {
    const sql = String(args.sql ?? '');
    const preview = sql.slice(0, 50).replace(/\s+/g, ' ').trim();
    return `SQL: ${preview}${sql.length > 50 ? '…' : ''}`;
  },
};
