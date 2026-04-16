/**
 * reportPresets.ts
 * Built-in report preset templates that bundle palette + layout + chart engine
 * + prompt modifier into a single "visual theme pack".
 */

export interface ReportPreset {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  tags: string[];
  category: 'business' | 'finance' | 'tech' | 'marketing' | 'hr' | 'print';
  builtIn: boolean;
  createdBy?: string;
  createdAt?: number;

  // === Core Design References ===
  paletteId: string;
  layoutId: string;
  chartEngine: 'auto' | 'echarts' | 'apexcharts';

  // === Agent Prompt Modifier ===
  promptModifier?: string;
}

export interface PresetCategory {
  key: string;
  label: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { key: '', label: '全部' },
  { key: 'business', label: '商业' },
  { key: 'finance', label: '财务' },
  { key: 'tech', label: '科技' },
  { key: 'marketing', label: '营销' },
  { key: 'hr', label: 'HR' },
  { key: 'print', label: '打印导出' },
];

export const BUILT_IN_PRESETS: ReportPreset[] = [
  // ── 商业 ──────────────────────────────────────────────────────────────────
  {
    id: 'preset-biz-standard',
    name: '企业标准版',
    description: '通用企业报告，平衡展示关键指标与数据趋势，适合董事会汇报',
    tags: ['商业', '企业', '通用', '均衡'],
    category: 'business',
    builtIn: true,
    paletteId: 'palette-classic',
    layoutId: 'universal/dashboard-2col',
    chartEngine: 'auto',
    promptModifier: '报告应平衡展示关键指标与数据趋势，风格正式专业。',
  },
  {
    id: 'preset-biz-executive',
    name: '高管汇报版',
    description: '简洁专业，适合给高层看，突出最关键的 3-5 个指标',
    tags: ['高管', '汇报', '简洁', '极简'],
    category: 'business',
    builtIn: true,
    paletteId: 'palette-minimal',
    layoutId: 'universal/dashboard-3col',
    chartEngine: 'auto',
    promptModifier: '报告应简洁专业，突出最关键的3-5个指标，避免冗余内容，直接给出结论。',
  },
  {
    id: 'preset-biz-brand',
    name: '品牌展示版',
    description: '视觉优先，适合市场材料，注重品牌形象与美感',
    tags: ['品牌', '市场', '视觉', '杂志'],
    category: 'business',
    builtIn: true,
    paletteId: 'palette-coral',
    layoutId: 'universal/magazine-wide',
    chartEngine: 'apexcharts',
    promptModifier: '报告视觉优先，注重美观和品牌形象，现代感强，适合对外展示。',
  },

  // ── 财务 ──────────────────────────────────────────────────────────────────
  {
    id: 'preset-fin-standard',
    name: '财报标准版',
    description: '财务报告标准格式，3列KPI + 趋势图，适合月报/季报',
    tags: ['财务', '季报', 'KPI', '金融'],
    category: 'finance',
    builtIn: true,
    paletteId: 'palette-finance-gold',
    layoutId: 'finance/kpi-3col',
    chartEngine: 'echarts',
    promptModifier: '严格按财务报告格式，数据精确到两位小数，必须包含同比/环比对比指标。',
  },
  {
    id: 'preset-fin-risk',
    name: '风控监控版',
    description: '风险监控信号展示，风险矩阵布局，高亮预警指标',
    tags: ['风控', '监控', '预警', '矩阵'],
    category: 'finance',
    builtIn: true,
    paletteId: 'palette-wealth-mgmt',
    layoutId: 'finance/risk-matrix',
    chartEngine: 'echarts',
    promptModifier: '重点展示风险信号和预警指标，高危项用红色标注，包含风险评分和趋势。',
  },
  {
    id: 'preset-fin-pnl',
    name: '损益分析版',
    description: '完整损益表格式，展示收入成本利润核心链条',
    tags: ['损益', '利润', '财务', 'PnL'],
    category: 'finance',
    builtIn: true,
    paletteId: 'palette-cfo-blue',
    layoutId: 'finance/pnl-report',
    chartEngine: 'echarts',
    promptModifier: '完整展示收入、成本、毛利、净利等损益核心指标，包含瀑布图拆解。',
  },
  {
    id: 'preset-fin-cashflow',
    name: '现金流版',
    description: '现金流专用布局，时间轴展示资金流入流出',
    tags: ['现金流', '时间轴', '资金', '财务'],
    category: 'finance',
    builtIn: true,
    paletteId: 'palette-classic',
    layoutId: 'finance/cashflow-timeline',
    chartEngine: 'echarts',
    promptModifier: '重点展示现金流入流出和净现金流变化趋势，包含期初期末余额对比。',
  },

  // ── 科技 ──────────────────────────────────────────────────────────────────
  {
    id: 'preset-tech-ops',
    name: '运维大屏版',
    description: '深色运维监控屏，紧凑看板，实时指标高亮告警',
    tags: ['运维', '大屏', '暗色', '监控'],
    category: 'tech',
    builtIn: true,
    paletteId: 'palette-dark-tech',
    layoutId: 'universal/compact-dashboard',
    chartEngine: 'apexcharts',
    promptModifier: '使用暗色主题风格HTML，突出实时监控数据和告警信息，颜色鲜明对比强。',
  },
  {
    id: 'preset-tech-server',
    name: '服务器监控版',
    description: '服务器运维大屏，展示CPU/内存/网络关键性能指标',
    tags: ['服务器', '监控', 'CPU', '运维'],
    category: 'tech',
    builtIn: true,
    paletteId: 'palette-slate-dark',
    layoutId: 'operations/server-monitor',
    chartEngine: 'apexcharts',
    promptModifier: '展示CPU、内存、网络、磁盘等服务器关键性能指标，包含历史趋势折线图。',
  },
  {
    id: 'preset-tech-geek',
    name: '极客暗色版',
    description: '极客/技术风格，终端绿配色，适合开发团队展示',
    tags: ['极客', '技术', '暗色', '终端'],
    category: 'tech',
    builtIn: true,
    paletteId: 'palette-terminal',
    layoutId: 'universal/dashboard-3col',
    chartEngine: 'apexcharts',
    promptModifier: '技术极客风格，可在报告中展示代码片段、API数据、系统指标等专业内容。',
  },

  // ── 营销 ──────────────────────────────────────────────────────────────────
  {
    id: 'preset-mkt-campaign',
    name: '营销活动版',
    description: '活动效果展示，ROI、转化率、曝光量营销漏斗',
    tags: ['营销', '活动', 'ROI', '转化'],
    category: 'marketing',
    builtIn: true,
    paletteId: 'palette-coral',
    layoutId: 'marketing/campaign-performance',
    chartEngine: 'apexcharts',
    promptModifier: '重点展示ROI、转化率、曝光量等营销效果指标，包含渠道对比和漏斗分析。',
  },
  {
    id: 'preset-mkt-gmv',
    name: 'GMV 大盘版',
    description: '电商GMV总览，订单量、客单价、渠道贡献分析',
    tags: ['电商', 'GMV', '大盘', '订单'],
    category: 'marketing',
    builtIn: true,
    paletteId: 'palette-amber-gold',
    layoutId: 'ecommerce/gmv-overview',
    chartEngine: 'apexcharts',
    promptModifier: '以GMV为核心指标展示电商整体大盘数据，包含品类贡献和渠道GMV排名。',
  },
  {
    id: 'preset-mkt-social',
    name: '社媒分析版',
    description: '社交媒体数据报告，粉丝互动增长趋势平台对比',
    tags: ['社媒', '粉丝', '互动', '内容'],
    category: 'marketing',
    builtIn: true,
    paletteId: 'palette-lavender',
    layoutId: 'marketing/social-analytics',
    chartEngine: 'apexcharts',
    promptModifier: '展示社交媒体互动率、粉丝增长、内容传播等核心数据，包含各平台对比。',
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  {
    id: 'preset-hr-headcount',
    name: '人力报告版',
    description: 'HR 报告标准格式，在职/招聘/离职率看板',
    tags: ['HR', '人力', '招聘', '离职'],
    category: 'hr',
    builtIn: true,
    paletteId: 'palette-classic',
    layoutId: 'hr/headcount-dashboard',
    chartEngine: 'auto',
    promptModifier: '展示人力资源核心数据，包含在职人数、招聘进度、离职率和人力成本分析。',
  },
  {
    id: 'preset-hr-performance',
    name: '绩效评估版',
    description: '员工绩效报告，分级分布与部门对比雷达图',
    tags: ['绩效', '评估', 'KPI', 'HR'],
    category: 'hr',
    builtIn: true,
    paletteId: 'palette-finance-gold',
    layoutId: 'hr/performance',
    chartEngine: 'echarts',
    promptModifier: '展示员工绩效分布情况和部门绩效对比，包含绩效等级占比和趋势分析。',
  },

  // ── 打印导出 ──────────────────────────────────────────────────────────────
  {
    id: 'preset-print-a4',
    name: 'A4 打印版',
    description: '可直接打印的 A4 文档，极简排版，无阴影边框',
    tags: ['打印', 'A4', 'PDF', '极简', '纸质'],
    category: 'print',
    builtIn: true,
    paletteId: 'palette-minimal',
    layoutId: 'universal/print-a4',
    chartEngine: 'echarts',
    promptModifier: '生成可直接打印的A4格式报告，注意分页和边距，使用极简无装饰风格。',
  },
  {
    id: 'preset-print-mobile',
    name: '移动端版',
    description: '手机屏幕友好，单列大字体，适合分享到移动设备',
    tags: ['移动端', '手机', '响应式', '分享'],
    category: 'print',
    builtIn: true,
    paletteId: 'palette-classic',
    layoutId: 'universal/mobile-first',
    chartEngine: 'auto',
    promptModifier: '优化手机端阅读体验，使用单列布局、大字体和大间距，关键数据突出显示。',
  },
];
