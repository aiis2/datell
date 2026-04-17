import type { AgentToolDefinition } from '../types';

export const dataAnalysisTool: AgentToolDefinition = {
  name: 'data_analysis',
  description: '对数据执行统计分析。支持的操作: mean(均值), median(中位数), sum(求和), min(最小值), max(最大值), std(标准差), count(计数), describe(综合描述)。',
  parameters: [
    { name: 'operation', type: 'string', description: '统计操作: mean, median, sum, min, max, std, count, describe', required: true },
    { name: 'data', type: 'string', description: '数字数组的JSON格式，如: [1,2,3,4,5]', required: true },
    { name: 'label', type: 'string', description: '数据标签/列名', required: false },
  ],
  execute: async (args) => {
    let numbers: number[];
    try {
      numbers = JSON.parse(args.data as string);
      if (!Array.isArray(numbers)) throw new Error('not array');
      numbers = numbers.map(Number).filter((n) => !isNaN(n));
    } catch {
      return '错误: data 参数不是合法的数字数组';
    }

    if (numbers.length === 0) return '错误: 数据为空';

    const label = (args.label as string) || '数据';
    const operation = args.operation as string;
    const sorted = [...numbers].sort((a, b) => a - b);
    const n = numbers.length;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const variance = numbers.reduce((acc, val) => acc + (val - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    switch (operation) {
      case 'mean':
        return `📊 ${label} 的均值: ${mean.toFixed(4)}`;
      case 'median':
        return `📊 ${label} 的中位数: ${median.toFixed(4)}`;
      case 'sum':
        return `📊 ${label} 的总和: ${sum.toFixed(4)}`;
      case 'min':
        return `📊 ${label} 的最小值: ${sorted[0]}`;
      case 'max':
        return `📊 ${label} 的最大值: ${sorted[n - 1]}`;
      case 'std':
        return `📊 ${label} 的标准差: ${std.toFixed(4)}`;
      case 'count':
        return `📊 ${label} 的数据量: ${n}`;
      case 'describe':
        return [
          `📊 ${label} 统计描述:`,
          `  数据量: ${n}`,
          `  均值: ${mean.toFixed(4)}`,
          `  标准差: ${std.toFixed(4)}`,
          `  最小值: ${sorted[0]}`,
          `  25%分位: ${sorted[Math.floor(n * 0.25)]}`,
          `  中位数: ${median.toFixed(4)}`,
          `  75%分位: ${sorted[Math.floor(n * 0.75)]}`,
          `  最大值: ${sorted[n - 1]}`,
        ].join('\n');
      default:
        return `错误: 不支持的操作 "${operation}"。支持: mean, median, sum, min, max, std, count, describe`;
    }
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  getActivityDescription: (args) => {
    const op = String(args.operation ?? '');
    const label = String(args.label ?? '数据');
    return `分析 ${label}${op ? ` (${op})` : ''}`;
  },
};
