import * as XLSX from 'xlsx';
import type { AgentToolDefinition } from '../types';

export const generateExcelTool: AgentToolDefinition = {
  name: 'generate_excel',
  description: '根据结构化数据生成 Excel 文件并触发下载。传入 headers(列名数组) 和 rows(二维数据数组)。',
  parameters: [
    { name: 'title', type: 'string', description: '工作表名称', required: true },
    { name: 'headers', type: 'string', description: '列名，用逗号分隔，如: "姓名,年龄,城市"', required: true },
    { name: 'rows', type: 'string', description: '数据行，JSON格式的二维数组，如: [["张三",25,"北京"],["李四",30,"上海"]]', required: true },
  ],
  execute: async (args) => {
    const title = (args.title as string) || 'Sheet1';
    const headers = (args.headers as string).split(',').map((h) => h.trim());

    let rows: unknown[][];
    try {
      rows = JSON.parse(args.rows as string);
    } catch {
      return '错误: rows 参数不是合法的JSON数组';
    }

    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title);

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    return `✅ Excel 文件 "${title}.xlsx" 已生成并下载 (${headers.length} 列, ${rows.length} 行)`;
  },
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  getActivityDescription: (args) => {
    const title = String(args.title ?? 'Excel');
    return `生成 Excel: ${title}`;
  },
};
