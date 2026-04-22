export type BuiltInSkillLocale = 'zh-CN' | 'en-US';

interface LocalizedSkillText {
  'zh-CN': string;
  'en-US': string;
}

export interface BuiltInSkillManifest {
  id: string;
  toolName: string;
  modulePath: string;
  category: LocalizedSkillText;
  label: LocalizedSkillText;
  description: LocalizedSkillText;
}

export interface LocalizedBuiltInSkillManifest {
  id: string;
  toolName: string;
  modulePath: string;
  category: string;
  label: string;
  description: string;
}

export const BUILT_IN_SKILL_MANIFESTS: BuiltInSkillManifest[] = [
  {
    id: 'chart-echarts',
    toolName: 'generate_chart',
    modulePath: 'src/renderer/tools/generateChart.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '生成 ECharts 报表', 'en-US': 'Generate ECharts Report' },
    description: {
      'zh-CN': '生成包含 ECharts 图表的完整 HTML 报表，适合通用商业与财务分析场景。',
      'en-US': 'Generate a full HTML report with ECharts charts for general business and financial analysis.',
    },
  },
  {
    id: 'chart-apex',
    toolName: 'generate_chart_apex',
    modulePath: 'src/renderer/tools/generateChartApex.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '生成 ApexCharts 报表', 'en-US': 'Generate ApexCharts Report' },
    description: {
      'zh-CN': '生成包含 ApexCharts 的现代 HTML 报表，适合强调动效与视觉风格的数据可视化。',
      'en-US': 'Generate a modern HTML report with ApexCharts for motion-rich data visualizations.',
    },
  },
  {
    id: 'table-vtable',
    toolName: 'generate_table_vtable',
    modulePath: 'src/renderer/tools/generateTableVtable.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '生成 VTable 表格', 'en-US': 'Generate VTable Grid' },
    description: {
      'zh-CN': '生成适合大数据量展示的 VTable 高性能虚拟表格。',
      'en-US': 'Generate a high-performance virtualized VTable grid for large datasets.',
    },
  },
  {
    id: 'excel-export',
    toolName: 'generate_excel',
    modulePath: 'src/renderer/tools/generateExcel.ts',
    category: { 'zh-CN': '导出工具', 'en-US': 'Export Tools' },
    label: { 'zh-CN': '生成 Excel 表格', 'en-US': 'Generate Excel Spreadsheet' },
    description: {
      'zh-CN': '将结构化数据导出为 .xlsx Excel 文件。',
      'en-US': 'Export structured data to a .xlsx Excel file.',
    },
  },
  {
    id: 'pdf-export',
    toolName: 'generate_pdf',
    modulePath: 'src/renderer/tools/generatePdf.ts',
    category: { 'zh-CN': '导出工具', 'en-US': 'Export Tools' },
    label: { 'zh-CN': '生成 PDF 文档', 'en-US': 'Generate PDF Document' },
    description: {
      'zh-CN': '将 HTML 报表渲染并导出为 PDF 文件。',
      'en-US': 'Render an HTML report and export it as a PDF document.',
    },
  },
  {
    id: 'slide-generator',
    toolName: 'generate_slide',
    modulePath: 'src/renderer/tools/generateSlide.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '生成演示文稿', 'en-US': 'Generate Presentation' },
    description: {
      'zh-CN': '生成支持键盘与鼠标翻页的多页 HTML 幻灯片。',
      'en-US': 'Generate a multi-page HTML slideshow with keyboard and mouse navigation.',
    },
  },
  {
    id: 'document-generator',
    toolName: 'generate_document',
    modulePath: 'src/renderer/tools/generateDocument.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '生成专业文档', 'en-US': 'Generate Professional Document' },
    description: {
      'zh-CN': '生成类 Word 版式的 HTML 专业文档，适合打印与归档。',
      'en-US': 'Generate a Word-like HTML document suitable for printing and archival.',
    },
  },
  {
    id: 'sql-query',
    toolName: 'query_database',
    modulePath: 'src/renderer/tools/queryDatabase.ts',
    category: { 'zh-CN': '数据工具', 'en-US': 'Data Tools' },
    label: { 'zh-CN': '查询数据库', 'en-US': 'Query Database' },
    description: {
      'zh-CN': '向已配置数据源执行 SQL 查询并返回结构化结果。',
      'en-US': 'Execute SQL queries against configured datasources and return structured results.',
    },
  },
  {
    id: 'schema-inspector',
    toolName: 'get_database_schema',
    modulePath: 'src/renderer/tools/getDatabaseSchema.ts',
    category: { 'zh-CN': '数据工具', 'en-US': 'Data Tools' },
    label: { 'zh-CN': '获取数据库结构', 'en-US': 'Get Database Schema' },
    description: {
      'zh-CN': '读取外部数据源的表、列与结构信息，帮助 Agent 理解可用数据。',
      'en-US': 'Inspect datasource tables and columns so the agent can understand available data.',
    },
  },
  {
    id: 'data-quality-check',
    toolName: 'check_data_quality',
    modulePath: 'src/renderer/tools/checkDataQuality.ts',
    category: { 'zh-CN': '分析工具', 'en-US': 'Analysis Tools' },
    label: { 'zh-CN': '检查数据质量', 'en-US': 'Check Data Quality' },
    description: {
      'zh-CN': '检查缺失值、异常值与字段分布，快速发现数据质量问题。',
      'en-US': 'Check missing values, outliers, and field distributions to surface data quality issues.',
    },
  },
  {
    id: 'statistical-analysis',
    toolName: 'data_analysis',
    modulePath: 'src/renderer/tools/dataAnalysis.ts',
    category: { 'zh-CN': '分析工具', 'en-US': 'Analysis Tools' },
    label: { 'zh-CN': '数据统计分析', 'en-US': 'Statistical Data Analysis' },
    description: {
      'zh-CN': '执行均值、中位数、方差等基础统计分析。',
      'en-US': 'Run core statistical calculations such as mean, median, and variance.',
    },
  },
  {
    id: 'js-sandbox',
    toolName: 'run_js_sandbox',
    modulePath: 'src/renderer/tools/runJsSandbox.ts',
    category: { 'zh-CN': '分析工具', 'en-US': 'Analysis Tools' },
    label: { 'zh-CN': '运行 JS 沙箱', 'en-US': 'Run JS Sandbox' },
    description: {
      'zh-CN': '在受限的 JavaScript 运行环境中执行计算逻辑。',
      'en-US': 'Execute computation logic inside the app’s restricted JavaScript sandbox.',
    },
  },
  {
    id: 'web-fetch',
    toolName: 'web_fetch',
    modulePath: 'src/renderer/tools/webFetch.ts',
    category: { 'zh-CN': '网络工具', 'en-US': 'Network Tools' },
    label: { 'zh-CN': '获取网页内容', 'en-US': 'Fetch Web Content' },
    description: {
      'zh-CN': '通过主进程代理抓取网页内容，绕过常见 CORS 限制。',
      'en-US': 'Fetch web content through the main-process proxy to bypass common CORS restrictions.',
    },
  },
  {
    id: 'search-assets',
    toolName: 'search_assets',
    modulePath: 'src/renderer/tools/searchAssets.ts',
    category: { 'zh-CN': '网络工具', 'en-US': 'Network Tools' },
    label: { 'zh-CN': '搜索素材库', 'en-US': 'Search Asset Library' },
    description: {
      'zh-CN': '搜索插图、图片与素材资源，辅助报告视觉设计。',
      'en-US': 'Search illustrations and visual assets that can be used inside reports.',
    },
  },
  {
    id: 'card-recommendation',
    toolName: 'suggest_card_combinations',
    modulePath: 'src/renderer/tools/suggestCardCombinations.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '推荐卡片组合', 'en-US': 'Suggest Card Combinations' },
    description: {
      'zh-CN': '基于 System RAG 推荐更适合当前报表主题的卡片组合。',
      'en-US': 'Use System RAG to suggest card combinations that fit the current reporting task.',
    },
  },
  {
    id: 'report-validation',
    toolName: 'validate_report',
    modulePath: 'src/renderer/tools/validateReport.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '校验报表质量', 'en-US': 'Validate Report Quality' },
    description: {
      'zh-CN': '检查报表结构、内容完整性与输出质量。',
      'en-US': 'Validate report structure, completeness, and output quality before handoff.',
    },
  },
  {
    id: 'user-clarification',
    toolName: 'ask_user',
    modulePath: 'src/renderer/tools/askUser.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '向用户提问', 'en-US': 'Ask the User' },
    description: {
      'zh-CN': '在关键信息存在歧义时向用户提出澄清问题。',
      'en-US': 'Ask the user for clarification when critical information is ambiguous.',
    },
  },
  {
    id: 'mini-chart-preview',
    toolName: 'show_mini_chart',
    modulePath: 'src/renderer/tools/showMiniChart.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '迷你内联图表', 'en-US': 'Inline Mini Chart' },
    description: {
      'zh-CN': '在聊天消息中直接渲染小型图表，无需生成完整报表。',
      'en-US': 'Render a small chart directly inside the chat without generating a full report.',
    },
  },
  {
    id: 'widget-display',
    toolName: 'show_widget',
    modulePath: 'src/renderer/tools/showWidget.ts',
    category: { 'zh-CN': '报表工具', 'en-US': 'Report Tools' },
    label: { 'zh-CN': '数据小组件', 'en-US': 'Data Widget' },
    description: {
      'zh-CN': '渲染 KPI 卡片、计数器、进度条等轻量级数据组件。',
      'en-US': 'Render lightweight data widgets such as KPI cards, counters, and progress bars.',
    },
  },
  {
    id: 'task-planner',
    toolName: 'plan_tasks',
    modulePath: 'src/renderer/tools/planTasks.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '规划任务步骤', 'en-US': 'Plan Task Steps' },
    description: {
      'zh-CN': '把复杂目标拆解成可跟踪的任务步骤，并同步到 UI 进度面板。',
      'en-US': 'Break complex goals into trackable task steps and sync them to the UI task panel.',
    },
  },
  {
    id: 'task-completer',
    toolName: 'complete_task',
    modulePath: 'src/renderer/tools/completeTask.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '标记任务完成', 'en-US': 'Mark Task Complete' },
    description: {
      'zh-CN': '标记任务列表中的某个任务已完成。',
      'en-US': 'Mark a task in the task list as completed.',
    },
  },
  {
    id: 'single-subagent',
    toolName: 'run_subagent',
    modulePath: 'src/renderer/tools/runSubagent.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '派发子任务', 'en-US': 'Dispatch Sub-agent' },
    description: {
      'zh-CN': '向单个子 Agent 派发任务并等待结果。',
      'en-US': 'Dispatch work to a single sub-agent and await its result.',
    },
  },
  {
    id: 'parallel-subagents',
    toolName: 'run_subagents_parallel',
    modulePath: 'src/renderer/tools/runSubagentsParallel.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '并行子 Agent', 'en-US': 'Run Sub-agents in Parallel' },
    description: {
      'zh-CN': '并行运行多个子 Agent 以加速独立任务处理。',
      'en-US': 'Run multiple sub-agents in parallel to accelerate independent tasks.',
    },
  },
  {
    id: 'serial-pipeline',
    toolName: 'run_subagents_serial',
    modulePath: 'src/renderer/tools/runSubagentsSerial.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '串行子 Agent 流水线', 'en-US': 'Run Sub-agents Serially' },
    description: {
      'zh-CN': '按步骤串行执行多个子 Agent，适合流水线式工作流。',
      'en-US': 'Run multiple sub-agents in sequence for pipeline-style workflows.',
    },
  },
  {
    id: 'node-aggregator',
    toolName: 'run_node_subagent',
    modulePath: 'src/renderer/tools/runNodeSubagent.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '节点汇聚子 Agent', 'en-US': 'Run Node Aggregator' },
    description: {
      'zh-CN': '调用 Node 聚合子 Agent，对多路结果进行汇总与收敛。',
      'en-US': 'Use a Node-based aggregator sub-agent to consolidate results from multiple branches.',
    },
  },
  {
    id: 'skill-creator',
    toolName: 'skill_creator',
    modulePath: 'src/renderer/tools/skillCreator.ts',
    category: { 'zh-CN': '系统工具', 'en-US': 'System Tools' },
    label: { 'zh-CN': '创建扩展技能', 'en-US': 'Create Extended Skill' },
    description: {
      'zh-CN': '由 AI 动态创建可立即安装的工具，并保存在动态技能兼容层。',
      'en-US': 'Let AI create a tool at runtime and persist it in the dynamic-tool compatibility layer.',
    },
  },
];

export function localizeBuiltInSkillManifest(
  manifest: BuiltInSkillManifest,
  locale: BuiltInSkillLocale,
): LocalizedBuiltInSkillManifest {
  return {
    id: manifest.id,
    toolName: manifest.toolName,
    modulePath: manifest.modulePath,
    category: manifest.category[locale],
    label: manifest.label[locale],
    description: manifest.description[locale],
  };
}
