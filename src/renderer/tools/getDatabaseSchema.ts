/**
 * getDatabaseSchema — Agent tool that retrieves the full schema (tables + columns)
 * for a configured datasource, so the AI can understand the DB structure before
 * writing queries.
 */
import type { AgentToolDefinition } from '../types';

export const getDatabaseSchemaTool: AgentToolDefinition = {
  name: 'get_database_schema',
  description:
    '获取已配置数据源的表结构信息（所有表名、列名、数据类型、是否可空、字段注释）。' +
    '在使用 query_database 执行查询之前，建议先调用此工具了解数据库结构。',
  parameters: [
    {
      name: 'datasource_id',
      type: 'string',
      description: '数据源 ID（在设置 → 数据源 页面查看）',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const id = String(args.datasource_id ?? '');
    if (!id) return '错误: 缺少 datasource_id 参数';

    try {
      const elAPI = (window as Window & { electronAPI?: { datasourceGetSchema?: (id: string) => Promise<{ tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }> }> }> } }).electronAPI;
      if (!elAPI?.datasourceGetSchema) return '错误: 数据源 API 不可用';
      const schema = await elAPI.datasourceGetSchema(id);

      // Format as human-readable summary for the AI
      const lines: string[] = [`共 ${schema.tables.length} 张表:\n`];
      for (const t of schema.tables) {
        lines.push(`## ${t.name}`);
        for (const c of t.columns) {
          const nullable = c.nullable ? '可空' : '非空';
          const comment = c.comment ? ` — ${c.comment}` : '';
          lines.push(`  - ${c.name}: ${c.type} (${nullable})${comment}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    } catch (err) {
      return `错误: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 20000,
  getActivityDescription: (args) => {
    return `获取数据库结构: ${String(args.datasource_id ?? '')}`;
  },
};
