/**
 * showMiniChart — Agent tool that renders an inline SVG chart / metric card
 * directly inside the chat bubble (no iframe, no external library needed).
 *
 * The tool does NOT produce a file — it returns a special JSON sentinel string
 * that MessageBubble detects and renders as a <MiniChart /> component.
 *
 * Sentinel format:  __MINI_CHART__{"type":"bar","title":"...","labels":[...],"values":[...]}
 */
import type { AgentToolDefinition } from '../types';

export const showMiniChartTool: AgentToolDefinition = {
  name: 'show_mini_chart',
  description:
    '在对话消息内直接渲染一个内联轻量图表或数据指标卡片，无需生成文件。' +
    '支持类型: sparkline（折线迷你图）、bar（柱状图）、pie（饼图）、metric（指标卡）、table（数据表格）。' +
    '适合在分析过程中快速可视化关键数据，例如趋势折线、排名柱图、占比饼图等。',
  parameters: [
    {
      name: 'type',
      type: 'string',
      description: '图表类型: sparkline | bar | pie | metric | table',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: '图表标题或指标名称（可选）',
      required: false,
    },
    {
      name: 'labels',
      type: 'array',
      description: '分类标签数组，适用于 bar、pie、table 类型。例如 ["Q1","Q2","Q3","Q4"]',
      required: false,
    },
    {
      name: 'values',
      type: 'array',
      description: '数值数组，与 labels 一一对应。sparkline 也可用此字段传时序数据。',
      required: false,
    },
    {
      name: 'data',
      type: 'array',
      description: '时序数值数组（sparkline 专用），例如 [120, 135, 128, 145, 162]',
      required: false,
    },
    {
      name: 'value',
      type: 'string',
      description: '指标卡的主要数值（metric 类型）',
      required: false,
    },
    {
      name: 'unit',
      type: 'string',
      description: '数值单位，例如 "万元"、"%"、"次"',
      required: false,
    },
    {
      name: 'delta',
      type: 'number',
      description: '指标卡的变化量（metric 类型，可为负），例如 +12.5 表示上升',
      required: false,
    },
    {
      name: 'deltaLabel',
      type: 'string',
      description: '变化量说明，例如 "较上月"',
      required: false,
    },
    {
      name: 'color',
      type: 'string',
      description: 'CSS 颜色值，用于折线/柱图/指标卡主色，例如 "#3b82f6"',
      required: false,
    },
    {
      name: 'columns',
      type: 'array',
      description: '表格列名数组（table 类型），例如 ["名称","金额","占比"]',
      required: false,
    },
    {
      name: 'rows',
      type: 'array',
      description: '表格数据行（table 类型），二维数组，例如 [["A",100,"10%"],["B",200,"20%"]]',
      required: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    // Validate minimal requirements per type
    const type = String(args.type ?? '').toLowerCase();
    const allowed = ['sparkline', 'bar', 'pie', 'metric', 'table'];
    if (!allowed.includes(type)) {
      return `不支持的图表类型 "${type}"，请使用: ${allowed.join(', ')}`;
    }

    // Build a clean spec object
    const spec: Record<string, unknown> = { type };
    if (args.title)      spec.title      = args.title;
    if (args.labels)     spec.labels     = args.labels;
    if (args.values)     spec.values     = args.values;
    if (args.data)       spec.data       = args.data;
    if (args.value !== undefined) spec.value = args.value;
    if (args.unit)       spec.unit       = args.unit;
    if (args.delta !== undefined) spec.delta = args.delta;
    if (args.deltaLabel) spec.deltaLabel = args.deltaLabel;
    if (args.color)      spec.color      = args.color;
    if (args.columns)    spec.columns    = args.columns;
    if (args.rows)       spec.rows       = args.rows;

    return `__MINI_CHART__${JSON.stringify(spec)}`;
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  getActivityDescription: (args) => {
    const type = String(args.type ?? 'chart');
    return `生成小图表: ${type}`;
  },
};
