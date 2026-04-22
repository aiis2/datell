import type { ExternalSkill, RegistrySkillManifest } from '../../shared/skills';

/* ========== Chat & Messages ========== */

export type MessageRole = 'user' | 'assistant' | 'system';

export interface FileAttachment {
  id: string;
  name: string;
  type: 'image' | 'excel' | 'csv' | 'pdf' | 'unknown';
  size: number;
  /** base64-encoded data for images, or raw text content for text-based files */
  data: string;
  /** Extracted text summary for non-image files (e.g. Excel parsed content) */
  textContent?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

/* ========== SubAgent Support ========== */

export type SubAgentStatus = 'queued' | 'running' | 'done' | 'error';

export interface SubAgentTask {
  id: string;
  /** Short display label for this sub-agent */
  name: string;
  /** Longer description of what this agent is doing */
  description: string;
  status: SubAgentStatus;
  /** Streaming partial text from this sub-agent */
  partialContent: string;
  /** Final result returned to coordinator */
  result?: string;
  /** Error message if failed */
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface SubAgentDispatchArgs {
  agents: Array<{
    id: string;
    name: string;
    description: string;
    task: string;
  }>;
}

export interface SubAgentResultsArgs {
  results: Array<{
    id: string;
    result: string;
  }>;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  attachments?: FileAttachment[];
  toolCalls?: ToolCallInfo[];
  /** Sub-agent tasks dispatched during this message (coordinator-side) */
  subAgentTasks?: SubAgentTask[];
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/* ========== Model & Provider ========== */

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible' | 'anthropic-compatible' | 'openrouter';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  /** When true, this is a built-in model that cannot be edited or removed */
  locked?: boolean;
  /**
   * For locked enterprise models: which activation tier unlocks this model.
   * 'pro' = requires Pro activation; 'basic' = requires Basic activation.
   */
  lockedTier?: 'pro' | 'basic';
  /**
   * Maximum context window in tokens. -1 = unlimited.
   * Used to warn/block users who upload oversized files.
   * Default: -1 (no limit enforced).
   */
  maxContextTokens?: number;
}

export const DEFAULT_MODELS: ModelConfig[] = [];

/* ========== Tools ========== */

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
  /**
   * Whether this tool can safely be executed in parallel with other tools.
   * Defaults to false (serial execution) when unset.
   * Tools that only read data or produce isolated outputs can set this to true.
   */
  isConcurrencySafe?: () => boolean;
  /** True if the tool only reads data without modifying any state. */
  isReadOnly?: () => boolean;
  /** True if the tool performs irreversible operations (e.g. write to disk, API call). */
  isDestructive?: () => boolean;
  /**
   * Maximum result size in characters. When the tool result exceeds this limit,
   * it is truncated with a notice rather than being injected verbatim into the context window.
   */
  maxResultSizeChars?: number;
  /**
   * Returns a short, human-readable present-tense description of what this tool
   * is currently doing, based on its arguments. Used for spinner labels in the UI.
   * Return null to fall back to the tool name.
   */
  getActivityDescription?: (args: Record<string, unknown>) => string | null;
  /**
   * Validate tool arguments before execution.
   * Return { valid: true } to allow, or { valid: false, error: '...' } to reject.
   * Returning invalid causes the agent loop to inject the error as the tool result
   * without calling execute().
   */
  validateInput?: (args: Record<string, unknown>) => { valid: boolean; error?: string };
}

/* ========== Dynamic Tools (created via skill_creator) ========== */

export interface DynamicToolDef {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  /** JavaScript async function body; receives `args: Record<string, unknown>` */
  code: string;
  createdAt: number;
}

/* ========== Report Layout ========== */

export interface ReportLayout {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Relative CSS path under public/styles/layouts/ */
  cssPath: string;
}

export const REPORT_LAYOUTS: ReportLayout[] = [
  /* ── 通用 ── */
  { id: 'universal/single-col',           name: '单列布局',         category: '通用', description: '单列垂直堆叠，适合文档风格报告',            cssPath: 'universal/single-col.css' },
  { id: 'universal/poster-single',        name: '竖版海报（单卡）', category: '通用', description: '全页单卡自由布局，适合数据海报、信息图表',   cssPath: 'universal/poster-single.css' },
  { id: 'universal/poster-wide',          name: '横版海报（宽屏）', category: '通用', description: '横版16:9单卡海报，适合横版宣传海报、大屏截图', cssPath: 'universal/poster-wide.css' },
  { id: 'universal/dashboard-2col',       name: '双列仪表盘',       category: '通用', description: '通用双列仪表盘布局',                        cssPath: 'universal/dashboard-2col.css' },
  { id: 'universal/dashboard-3col',       name: '三列仪表盘',       category: '通用', description: '宽屏三列仪表盘',                            cssPath: 'universal/dashboard-3col.css' },
  { id: 'universal/bento-grid',           name: 'Bento 拼图网格',   category: '通用', description: '12列CSS Grid拼图，苹果Bento风格',           cssPath: 'universal/bento-grid.css' },
  { id: 'universal/compact-dashboard',    name: '紧凑看板',         category: '通用', description: '高密度紧凑看板，适合监控大屏',               cssPath: 'universal/compact-dashboard.css' },
  { id: 'universal/magazine-wide',        name: '杂志宽屏',         category: '通用', description: '主内容区2/3，侧边辅助1/3',                  cssPath: 'universal/magazine-wide.css' },
  { id: 'universal/print-a4',             name: 'A4 打印布局',      category: '通用', description: 'A4比例打印优化，适合导出PDF',               cssPath: 'universal/print-a4.css' },
  { id: 'universal/mobile-first',         name: '移动端优先',       category: '通用', description: '移动端优先单列布局',                        cssPath: 'universal/mobile-first.css' },
  /* ── 财务 ── */
  { id: 'finance/kpi-3col',               name: '金融KPI三列',      category: '财务', description: '财务专项3列指标看板',                       cssPath: 'finance/kpi-3col.css' },
  { id: 'finance/pnl-report',             name: '财务损益报告',     category: '财务', description: '财务损益报告标准布局',                      cssPath: 'finance/pnl-report.css' },
  { id: 'finance/monitoring-realtime',    name: '财务实时监控',     category: '财务', description: '财务日度/实时监控看板',                     cssPath: 'finance/monitoring-realtime.css' },
  { id: 'finance/risk-matrix',            name: '风险矩阵',         category: '财务', description: '风险评估矩阵布局',                          cssPath: 'finance/risk-matrix.css' },
  { id: 'finance/cashflow-timeline',      name: '现金流时间轴',     category: '财务', description: '现金流专用布局',                            cssPath: 'finance/cashflow-timeline.css' },
  { id: 'finance/trading-candlestick',    name: '交易行情',         category: '财务', description: '金融交易行情专用布局',                      cssPath: 'finance/trading-candlestick.css' },
  /* ── 电商 ── */
  { id: 'ecommerce/gmv-overview',         name: 'GMV大盘总览',      category: '电商', description: '电商GMV大盘总览布局',                       cssPath: 'ecommerce/gmv-overview.css' },
  { id: 'ecommerce/funnel-conversion',    name: '转化漏斗',         category: '电商', description: '电商购物转化漏斗布局',                      cssPath: 'ecommerce/funnel-conversion.css' },
  { id: 'ecommerce/order-status',         name: '订单状态看板',     category: '电商', description: '订单状态实时看板',                          cssPath: 'ecommerce/order-status.css' },
  { id: 'ecommerce/product-heatmap',      name: '商品热力矩阵',     category: '电商', description: '商品销售热力矩阵布局',                      cssPath: 'ecommerce/product-heatmap.css' },
  { id: 'ecommerce/user-behavior',        name: '用户行为分析',     category: '电商', description: '电商用户行为深度分析',                      cssPath: 'ecommerce/user-behavior.css' },
  /* ── 运营 ── */
  { id: 'operations/server-monitor',      name: '服务器性能监控',   category: '运营', description: '服务器/基础设施性能监控看板',               cssPath: 'operations/server-monitor.css' },
  { id: 'operations/sla-monitor',         name: 'SLA服务监控',      category: '运营', description: 'SLA服务水平协议监控布局',                   cssPath: 'operations/sla-monitor.css' },
  { id: 'operations/incident-flow',       name: '运维故障流程',     category: '运营', description: '运维故障事件处理全流程布局',                cssPath: 'operations/incident-flow.css' },
  { id: 'operations/capacity-planning',   name: '产能规划看板',     category: '运营', description: '产能规划布局',                              cssPath: 'operations/capacity-planning.css' },
  { id: 'operations/logistics-map',       name: '物流配送地图',     category: '运营', description: '物流运营布局',                              cssPath: 'operations/logistics-map.css' },
  /* ── 销售 ── */
  { id: 'sales/crm-pipeline',             name: 'CRM销售漏斗',      category: '销售', description: 'CRM销售管道布局',                           cssPath: 'sales/crm-pipeline.css' },
  { id: 'sales/daily-report',             name: '销售日报',         category: '销售', description: '销售日报看板布局',                          cssPath: 'sales/daily-report.css' },
  { id: 'sales/quota-progress',           name: '销售配额进度',     category: '销售', description: '销售配额跟踪布局',                          cssPath: 'sales/quota-progress.css' },
  { id: 'sales/regional-analysis',        name: '销售区域分析',     category: '销售', description: '销售区域分析布局',                          cssPath: 'sales/regional-analysis.css' },
  { id: 'sales/territory-map',            name: '区域销售地图',     category: '销售', description: '区域销售分布布局',                          cssPath: 'sales/territory-map.css' },
  /* ── HR ── */
  { id: 'hr/headcount-dashboard',         name: '人力资本看板',     category: 'HR',   description: 'HR人力资本布局',                            cssPath: 'hr/headcount-dashboard.css' },
  { id: 'hr/performance',                 name: 'HR绩效评估',       category: 'HR',   description: 'HR绩效评估报告布局',                        cssPath: 'hr/performance.css' },
  { id: 'hr/hr-onboarding',               name: 'HR入职追踪',       category: 'HR',   description: 'HR新员工入职进度追踪布局',                  cssPath: 'hr/hr-onboarding.css' },
  { id: 'hr/talent-matrix',               name: '人才矩阵',         category: 'HR',   description: '人才评估九宫格矩阵布局',                    cssPath: 'hr/talent-matrix.css' },
  /* ── 营销 ── */
  { id: 'marketing/campaign-performance', name: '营销活动效果',     category: '营销', description: '营销活动效果布局',                          cssPath: 'marketing/campaign-performance.css' },
  { id: 'marketing/attribution',          name: '营销归因分析',     category: '营销', description: '营销渠道归因分析布局',                      cssPath: 'marketing/attribution.css' },
  { id: 'marketing/mkt-ab-test',          name: 'A/B测试报告',      category: '营销', description: 'A/B测试结果展示布局',                       cssPath: 'marketing/mkt-ab-test.css' },
  { id: 'marketing/social-analytics',     name: '社媒数据分析',     category: '营销', description: '社交媒体数据分析布局',                      cssPath: 'marketing/social-analytics.css' },
  /* ── 物流 ── */
  { id: 'logistics/route-optimizer',      name: '物流路由优化',     category: '物流', description: '物流路由分析布局',                          cssPath: 'logistics/route-optimizer.css' },
  { id: 'logistics/warehouse-heatmap',    name: '仓储热力布局',     category: '物流', description: '仓储管理布局',                              cssPath: 'logistics/warehouse-heatmap.css' },
  /* ── 医疗 ── */
  { id: 'medical/patient-flow',           name: '患者就诊流程',     category: '医疗', description: '医疗患者流程布局',                          cssPath: 'medical/patient-flow.css' },
  { id: 'medical/clinical-outcomes',      name: '临床结果分析',     category: '医疗', description: '临床结果分析布局',                          cssPath: 'medical/clinical-outcomes.css' },
  /* ── 编辑 ── */
  { id: 'editorial/article-analytics',    name: '文章内容分析',     category: '编辑', description: '内容媒体文章分析布局',                      cssPath: 'editorial/article-analytics.css' },
  { id: 'editorial/content-calendar',     name: '内容日历看板',     category: '编辑', description: '内容排期日历布局',                          cssPath: 'editorial/content-calendar.css' },
];

/* ========== Palette Preset ========== */

export type PaletteCategory = 'business' | 'dark' | 'nature' | 'fashion' | 'finance' | 'tech' | 'minimal' | 'custom';

export const PALETTE_CATEGORIES: PaletteCategory[] = ['business', 'dark', 'nature', 'fashion', 'finance', 'tech', 'minimal', 'custom'];

export const PALETTE_CATEGORY_NAMES: Record<PaletteCategory, string> = {
  business: '商业',
  dark:     '暗色',
  nature:   '自然',
  fashion:  '时尚',
  finance:  '财务',
  tech:     '科技',
  minimal:  '极简',
  custom:   '自定义',
};

export interface PalettePreset {
  id: string;
  name: string;
  /** Category for grouping in the palette browser */
  category?: PaletteCategory;
  /** Brief description */
  description?: string;
  /** Chart color palette (for __REPORT_PALETTE__ / __APEX_PALETTE__) */
  colors: string[];
  /** Primary accent color */
  primary: string;
  /** Body/page background CSS value */
  bodyBg: string;
  /** Card/panel background CSS value */
  cardBg: string;
  /** Main text color */
  textColor: string;
  /** Secondary/muted text color */
  subTextColor?: string;
  /** Whether this is a dark-mode palette */
  isDark: boolean;
  /** Whether this is a user-created custom palette */
  isCustom?: boolean;

  // === Typography ===
  /** Heading/title font family (CSS font-family value) */
  titleFontFamily?: string;
  /** Body text font family */
  bodyFontFamily?: string;
  /** Heading font size CSS value, e.g. "1.5rem" */
  titleFontSize?: string;
  /** Body font size CSS value, e.g. "0.875rem" */
  bodyFontSize?: string;
  /** Heading/title color (overrides textColor for h1/h2/h3) */
  headingColor?: string;

  // === Card Styles ===
  /** Card border/outline color */
  cardBorderColor?: string;
  /** Card CSS background override (color or gradient) */
  cardBgImage?: string;
  /** Card box-shadow CSS value */
  cardShadow?: string;
  /** Card border-radius CSS value */
  cardRadius?: string;
  /** Card border width CSS value */
  cardBorderWidth?: string;

  // === Page Background ===
  /** Page background override (CSS color or gradient) */
  bodyBgImage?: string;
  /** Page background image URL (applied as background-image) */
  bodyBgUrl?: string;

  // === Chart Colors ===
  /** ApexCharts-specific color overrides (defaults to colors[]) */
  apexColors?: string[];
  /** ECharts built-in theme name: 'default'|'dark'|'vintage'|'macarons'|'shine'|'walden'|'westeros'|'wonderland'|'roma' */
  echartsTheme?: string;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  /* ── 商业 (business) ── */
  {
    id: 'palette-classic',
    name: '经典蓝',
    category: 'business',
    description: '经典专业蓝色系，适合大多数企业报告',
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'],
    primary: '#3b82f6',
    bodyBg: '#f8fafc',
    cardBg: '#ffffff',
    textColor: '#1e293b',
    subTextColor: '#64748b',
    isDark: false,
  },
  {
    id: 'palette-royal-blue',
    name: '皇家蓝',
    category: 'business',
    description: '深邃皇家蓝，高端商务感',
    colors: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#10b981', '#f59e0b'],
    primary: '#1d4ed8',
    bodyBg: '#eff6ff',
    cardBg: '#ffffff',
    textColor: '#1e3a8a',
    subTextColor: '#3b82f6',
    isDark: false,
  },
  {
    id: 'palette-crimson-biz',
    name: '企业红',
    category: 'business',
    description: '大气企业红，适合需要强烈视觉冲击的报告',
    colors: ['#dc2626', '#ef4444', '#f97316', '#fbbf24', '#10b981', '#3b82f6', '#8b5cf6'],
    primary: '#dc2626',
    bodyBg: '#fff5f5',
    cardBg: '#ffffff',
    textColor: '#1a1a1a',
    subTextColor: '#6b7280',
    isDark: false,
  },
  {
    id: 'palette-amber-gold',
    name: '琥珀金',
    category: 'business',
    description: '温暖琥珀金色调，适合品牌展示和年度报告',
    colors: ['#d97706', '#f59e0b', '#fbbf24', '#fde68a', '#10b981', '#3b82f6', '#8b5cf6'],
    primary: '#d97706',
    bodyBg: '#fffbeb',
    cardBg: '#ffffff',
    textColor: '#1c1917',
    subTextColor: '#78716c',
    isDark: false,
  },
  {
    id: 'palette-teal-corp',
    name: '青绿商务',
    category: 'business',
    description: '清新青绿商务风格，平衡专业与活力',
    colors: ['#0d9488', '#14b8a6', '#2dd4bf', '#99f6e4', '#3b82f6', '#f59e0b', '#ec4899'],
    primary: '#0d9488',
    bodyBg: '#f0fdfa',
    cardBg: '#ffffff',
    textColor: '#134e4a',
    subTextColor: '#5eead4',
    isDark: false,
  },
  /* ── 暗色 (dark) ── */
  {
    id: 'palette-dark-tech',
    name: '暗色科技',
    category: 'dark',
    description: '深色科技风，ECharts蓝紫配色',
    colors: ['#38bdf8', '#818cf8', '#a78bfa', '#e879f9', '#f472b6', '#34d399', '#fb923c'],
    primary: '#38bdf8',
    bodyBg: '#0f172a',
    cardBg: '#1e293b',
    textColor: '#f1f5f9',
    subTextColor: '#94a3b8',
    isDark: true,
  },
  {
    id: 'palette-slate-dark',
    name: '深石板',
    category: 'dark',
    description: '深石板蓝黑，渐变紫蓝图表色',
    colors: ['#6366f1', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c'],
    primary: '#6366f1',
    bodyBg: '#1a1a2e',
    cardBg: '#16213e',
    textColor: '#e2e8f0',
    subTextColor: '#94a3b8',
    isDark: true,
  },
  {
    id: 'palette-cyberpunk',
    name: '赛博朋克',
    category: 'dark',
    description: '赛博朋克风格，霓虹青+品红配色',
    colors: ['#00fff5', '#ff007c', '#9d00ff', '#ffd300', '#00ff41', '#0096ff', '#ff6b35'],
    primary: '#00fff5',
    bodyBg: '#0d0d0d',
    cardBg: '#1a0a2e',
    textColor: '#e0e0ff',
    subTextColor: '#a0a0c0',
    isDark: true,
    cardBorderColor: '#00fff530',
    cardShadow: '0 0 20px rgba(0,255,245,0.1)',
  },
  {
    id: 'palette-midnight',
    name: '午夜蓝',
    category: 'dark',
    description: '深邃午夜蓝，稳重大气',
    colors: ['#4f8ef7', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#fb923c'],
    primary: '#4f8ef7',
    bodyBg: '#0a1628',
    cardBg: '#0f2040',
    textColor: '#e8f0fe',
    subTextColor: '#8fa8d0',
    isDark: true,
  },
  {
    id: 'palette-dark-emerald',
    name: '暗翠绿',
    category: 'dark',
    description: '暗底翠绿，适合展示增长与自然主题',
    colors: ['#10b981', '#34d399', '#6ee7b7', '#3b82f6', '#fbbf24', '#f87171', '#a78bfa'],
    primary: '#10b981',
    bodyBg: '#022c22',
    cardBg: '#064e3b',
    textColor: '#ecfdf5',
    subTextColor: '#6ee7b7',
    isDark: true,
  },
  /* ── 自然 (nature) ── */
  {
    id: 'palette-forest',
    name: '森林绿意',
    category: 'nature',
    description: '清新森林绿，自然清洁感',
    colors: ['#166534', '#15803d', '#22c55e', '#86efac', '#4ade80', '#14532d', '#3b82f6'],
    primary: '#16a34a',
    bodyBg: '#f0fdf4',
    cardBg: '#ffffff',
    textColor: '#14532d',
    subTextColor: '#4b7a57',
    isDark: false,
  },
  {
    id: 'palette-coral',
    name: '珊瑚暖调',
    category: 'nature',
    description: '珊瑚橙粉，活泼温暖',
    colors: ['#f97316', '#fb923c', '#fdba74', '#ef4444', '#ec4899', '#f59e0b', '#3b82f6'],
    primary: '#f97316',
    bodyBg: '#fff7ed',
    cardBg: '#ffffff',
    textColor: '#1c1917',
    subTextColor: '#78716c',
    isDark: false,
  },
  {
    id: 'palette-ocean',
    name: '海洋蓝绿',
    category: 'nature',
    description: '深海蓝绿渐变，静谧清凉',
    colors: ['#0c4a6e', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#06b6d4', '#14b8a6'],
    primary: '#0284c7',
    bodyBg: '#f0f9ff',
    cardBg: '#ffffff',
    textColor: '#0c4a6e',
    subTextColor: '#0369a1',
    isDark: false,
  },
  {
    id: 'palette-autumn',
    name: '秋日暖系',
    category: 'nature',
    description: '秋日橙黄红，温暖收获感',
    colors: ['#b45309', '#d97706', '#f59e0b', '#fbbf24', '#ef4444', '#dc2626', '#84cc16'],
    primary: '#d97706',
    bodyBg: '#fefce8',
    cardBg: '#fffbeb',
    textColor: '#451a03',
    subTextColor: '#92400e',
    isDark: false,
  },
  {
    id: 'palette-lavender',
    name: '薰衣草',
    category: 'nature',
    description: '优雅薰衣草紫，浪漫柔和',
    colors: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ec4899', '#06b6d4'],
    primary: '#8b5cf6',
    bodyBg: '#f5f3ff',
    cardBg: '#ffffff',
    textColor: '#2e1065',
    subTextColor: '#7c3aed',
    isDark: false,
  },
  /* ── 时尚 (fashion) ── */
  {
    id: 'palette-editorial',
    name: '杂志灰调',
    category: 'fashion',
    description: '高端黑白灰杂志风格，极致克制',
    colors: ['#111111', '#555555', '#999999', '#dddddd', '#3b82f6', '#ef4444', '#10b981'],
    primary: '#000000',
    bodyBg: '#ffffff',
    cardBg: '#ffffff',
    textColor: '#222222',
    subTextColor: '#777777',
    isDark: false,
  },
  {
    id: 'palette-rose-gold',
    name: '玫瑰金',
    category: 'fashion',
    description: '时尚玫瑰金，优雅女性化',
    colors: ['#be123c', '#e11d48', '#fb7185', '#fda4af', '#fce7f3', '#f59e0b', '#818cf8'],
    primary: '#e11d48',
    bodyBg: '#fff1f2',
    cardBg: '#ffffff',
    textColor: '#881337',
    subTextColor: '#9f1239',
    isDark: false,
  },
  {
    id: 'palette-morandi',
    name: '莫兰迪',
    category: 'fashion',
    description: '莫兰迪灰粉色系，低饱和度文艺感',
    colors: ['#c9b99a', '#b8a89a', '#a89888', '#d4b8a8', '#b0c4b8', '#a8b8c8', '#d4c8b8'],
    primary: '#b8a89a',
    bodyBg: '#f5f0eb',
    cardBg: '#faf7f4',
    textColor: '#4a4035',
    subTextColor: '#8a7868',
    isDark: false,
  },
  {
    id: 'palette-lilac',
    name: '丁香紫',
    category: 'fashion',
    description: '柔和丁香紫，甜美温柔',
    colors: ['#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#ede9fe', '#ec4899', '#f472b6'],
    primary: '#a855f7',
    bodyBg: '#faf5ff',
    cardBg: '#ffffff',
    textColor: '#3b0764',
    subTextColor: '#9333ea',
    isDark: false,
  },
  {
    id: 'palette-cream',
    name: '奶油米白',
    category: 'fashion',
    description: '温暖奶油色调，舒适自然',
    colors: ['#92400e', '#b45309', '#d97706', '#f59e0b', '#84cc16', '#10b981', '#3b82f6'],
    primary: '#d97706',
    bodyBg: '#fdfaf5',
    cardBg: '#fffef9',
    textColor: '#1c1711',
    subTextColor: '#6b5e4a',
    isDark: false,
  },
  /* ── 财务 (finance) ── */
  {
    id: 'palette-finance-gold',
    name: '金融青蓝',
    category: 'finance',
    description: '金融专用深蓝，专业严谨',
    colors: ['#1e3a8a', '#2563eb', '#0ea5e9', '#64748b', '#0284c7', '#16a34a', '#dc2626'],
    primary: '#1e3a8a',
    bodyBg: '#e2e8f0',
    cardBg: '#ffffff',
    textColor: '#0f172a',
    subTextColor: '#475569',
    isDark: false,
  },
  {
    id: 'palette-cfo-blue',
    name: 'CFO专业蓝',
    category: 'finance',
    description: '财务总监配色，沉稳权威',
    colors: ['#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#475569', '#16a34a', '#dc2626'],
    primary: '#1e40af',
    bodyBg: '#f1f5f9',
    cardBg: '#ffffff',
    textColor: '#0f172a',
    subTextColor: '#334155',
    isDark: false,
    cardBorderColor: '#cbd5e1',
  },
  {
    id: 'palette-risk-board',
    name: '风控红绿',
    category: 'finance',
    description: 'RAG红绿黄信号色，适合风险报告',
    colors: ['#dc2626', '#f59e0b', '#16a34a', '#3b82f6', '#7c3aed', '#0891b2', '#9ca3af'],
    primary: '#dc2626',
    bodyBg: '#f8fafc',
    cardBg: '#ffffff',
    textColor: '#0f172a',
    subTextColor: '#475569',
    isDark: false,
  },
  {
    id: 'palette-wealth-mgmt',
    name: '财富管理',
    category: 'finance',
    description: '高端深金色，私人财富管理风格',
    colors: ['#92400e', '#b45309', '#d97706', '#f59e0b', '#1e3a8a', '#047857', '#7c3aed'],
    primary: '#b45309',
    bodyBg: '#1a1208',
    cardBg: '#241a08',
    textColor: '#fde68a',
    subTextColor: '#d97706',
    isDark: true,
  },
  /* ── 科技 (tech) ── */
  {
    id: 'palette-quantum',
    name: '量子蓝',
    category: 'tech',
    description: '量子科技感，电子蓝+白',
    colors: ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#6366f1', '#8b5cf6', '#10b981'],
    primary: '#0ea5e9',
    bodyBg: '#f0f9ff',
    cardBg: '#ffffff',
    textColor: '#0c4a6e',
    subTextColor: '#0369a1',
    isDark: false,
  },
  {
    id: 'palette-terminal',
    name: '终端绿',
    category: 'tech',
    description: '黑客终端绿，极客暗色风',
    colors: ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#38bdf8', '#fbbf24', '#f87171'],
    primary: '#22c55e',
    bodyBg: '#051005',
    cardBg: '#0a1a0a',
    textColor: '#22c55e',
    subTextColor: '#16a34a',
    isDark: true,
    titleFontFamily: '"Courier New", Courier, monospace',
    bodyFontFamily: '"Courier New", Courier, monospace',
    cardBorderColor: '#22c55e40',
    cardShadow: '0 0 10px rgba(34,197,94,0.15)',
  },
  {
    id: 'palette-neon-nights',
    name: '霓虹夜',
    category: 'tech',
    description: '霓虹灯效果，现代科幻感',
    colors: ['#f0abfc', '#c084fc', '#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#fb7185'],
    primary: '#c084fc',
    bodyBg: '#030014',
    cardBg: '#0f0928',
    textColor: '#e2d9f3',
    subTextColor: '#a78bfa',
    isDark: true,
    cardBorderColor: '#c084fc30',
    cardShadow: '0 0 20px rgba(192,132,252,0.12)',
  },
  {
    id: 'palette-ice-crystal',
    name: '冰晶',
    category: 'tech',
    description: '冰晶蓝白，清冷科技感',
    colors: ['#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#6366f1', '#a5f3fc', '#e0f2fe'],
    primary: '#38bdf8',
    bodyBg: '#f0f9ff',
    cardBg: '#f8fbff',
    textColor: '#0c4a6e',
    subTextColor: '#0369a1',
    isDark: false,
  },
  {
    id: 'palette-solar-flare',
    name: '太阳耀斑',
    category: 'tech',
    description: '明亮橙黄，活力科技感',
    colors: ['#f97316', '#fb923c', '#fbbf24', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4'],
    primary: '#f97316',
    bodyBg: '#0a0501',
    cardBg: '#1a0e05',
    textColor: '#fde68a',
    subTextColor: '#fb923c',
    isDark: true,
  },
  /* ── 极简 (minimal) ── */
  {
    id: 'palette-minimal',
    name: '极简黑白',
    category: 'minimal',
    description: '纯粹黑白，极简主义',
    colors: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#3b82f6', '#10b981'],
    primary: '#111827',
    bodyBg: '#ffffff',
    cardBg: '#ffffff',
    textColor: '#111827',
    subTextColor: '#6b7280',
    isDark: false,
  },
  {
    id: 'palette-mono-navy',
    name: '单色海军',
    category: 'minimal',
    description: '单色海军蓝，沉着统一',
    colors: ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
    primary: '#1e3a8a',
    bodyBg: '#f8fafc',
    cardBg: '#ffffff',
    textColor: '#1e3a8a',
    subTextColor: '#3b82f6',
    isDark: false,
  },
  {
    id: 'palette-warm-neutral',
    name: '暖中性',
    category: 'minimal',
    description: '暖米白中性调，亲和舒适',
    colors: ['#78716c', '#57534e', '#44403c', '#292524', '#a8a29e', '#3b82f6', '#16a34a'],
    primary: '#57534e',
    bodyBg: '#fafaf9',
    cardBg: '#ffffff',
    textColor: '#1c1917',
    subTextColor: '#78716c',
    isDark: false,
  },
  {
    id: 'palette-zen-gray',
    name: '禅意灰',
    category: 'minimal',
    description: '禅宗灰白，静谧克制',
    colors: ['#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6'],
    primary: '#4b5563',
    bodyBg: '#f9fafb',
    cardBg: '#ffffff',
    textColor: '#111827',
    subTextColor: '#9ca3af',
    isDark: false,
  },
  {
    id: 'palette-earth-tone',
    name: '大地色系',
    category: 'minimal',
    description: '大地陶土色系，自然质朴',
    colors: ['#92400e', '#78350f', '#d97706', '#b45309', '#16a34a', '#0f766e', '#7c3aed'],
    primary: '#92400e',
    bodyBg: '#fdf8f3',
    cardBg: '#fdfaf6',
    textColor: '#292524',
    subTextColor: '#78716c',
    isDark: false,
  },
];

/* ========== Illustration Assets ========== */

export interface IllustrationAsset {
  id: string;
  /** Display name shown in settings */
  name: string;
  /** Category tag, e.g. '商务协作'|'数据分析'|'团队展示'|'成功庆典'|'其他' */
  category: string;
  /** Scene tags for AI matching, e.g. ['会议', '握手', '方案对比'] */
  tags: string[];
  /** Full SVG markup (the complete <svg>...</svg> element) */
  svgContent: string;
  /** Whether this is a built-in asset (cannot be removed) */
  builtIn: boolean;
  /** Prompt-facing description of suitable usage scenarios */
  description: string;
}

/** An uploaded background image stored as a base64 data URL */
export interface ImageAsset {
  id: string;
  name: string;
  /** base64 data URL (e.g. "data:image/png;base64,...") */
  dataUrl: string;
  /** Timestamp of upload */
  createdAt: number;
}

/* ========== User System Prompt Hints (hallucination correction) ========== */

export interface UserSystemPrompt {
  id: string;
  name: string;
  /** The actual prompt text injected into system message */
  content: string;
  /** Whether this hint is active */
  enabled: boolean;
}

/* ========== MCP ========== */

export interface McpDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  /** Transport type: 'stdio' = subprocess, 'sse' = SSE endpoint (legacy), 'streamableHttp' = Streamable HTTP POST endpoint */
  type: 'stdio' | 'sse' | 'streamableHttp';
  // stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http fields
  url?: string;             // e.g. http://localhost:3001/mcp
  /** Connection timeout in milliseconds (0 = no timeout). Default: 15000 */
  timeout?: number;
  enabled: boolean;
  /** Discovered tools (cached after connect/refresh) */
  discoveredTools?: McpDiscoveredTool[];
}

/* ========== Skills ========== */

export interface InstalledSkill {
  id: string;
  name: string;
  source: string;
  installedAt: number;
  description: string;
}

/* ========== Sandbox Report ========== */

export interface SandboxReport {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  conversationId?: string;
}

/* ========== Report Template ========== */

export interface ReportTemplate {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  templateName: string;
  templateDescription?: string;
}

/* ========== LLM Streaming Events ========== */

export type StreamEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'think-delta'; content: string }
  | { type: 'tool-call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; callId: string; result: string }
  | { type: 'ask-user'; callId: string; question: string; options?: string[] }
  | { type: 'subagent-dispatch'; tasks: SubAgentTask[] }
  | { type: 'subagent-update'; taskId: string; status: SubAgentStatus; partialContent?: string; result?: string; error?: string }
  /** Emitted at the start of each ReAct step to track progress. */
  | { type: 'turn-info'; current: number; max: number; estimatedTokens: number }
  /** Agent status message: shown in the streaming indicator (e.g. 正在准备/推理/分析…) */
  | { type: 'agent-status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

/* ========== Windows Identity ========== */

export interface WindowsIdentity {
  /** Windows 用户名（不含域名） */
  username: string;
  /** Windows 域名或本地计算机名 */
  domain: string;
  /** 完整展示名，例如 DOMAIN\username 或本地 username */
  displayName: string;
  /**
   * Windows 安全标识符 (SID)，格式 S-1-5-21-…
   * 是后续权限控制的稳定主键；本地降级时为空字符串
   */
  sid: string;
  /** 获取来源：whoami 命令成功时为 'whoami'，降级时为 'env' */
  source: 'whoami' | 'env';
  /** 是否为降级模式（缺少 SID 或非 Windows 平台） */
  isFallback: boolean;
  /** 身份读取时的 Unix 时间戳（毫秒） */
  lastSeenAt: number;
}

/* ========== Activation (hardware-based license) ========== */

export interface ActivationStatus {
  activated: boolean;
  machineCode: string;
  /** ISO date string of expiry, null if not activated */
  expiry: string | null;
  /** Days remaining until expiry, null if not activated */
  daysRemaining: number | null;
  reason: string;
  /** True when activated with a Pro-tier key */
  isPro?: boolean;
}

export type DatasourceType = 'mysql' | 'doris' | 'postgresql';

export interface DatasourceConfigPublic {
  id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ElectronAPI {
  savePdf: (args: { html: string; title: string; themeId?: string; layoutId?: string; palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean } }) => Promise<boolean>;
  captureReport: (args: { html: string; title: string; themeId?: string; layoutId?: string; palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean } }) => Promise<boolean>;
  saveFile: (data: Uint8Array, defaultName: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getEnterprisePluginStatus: () => Promise<{ available: boolean; meta: { name: string; version: string; description?: string } | null }>;
  setNativeTheme: (theme: 'light' | 'dark') => Promise<void>;
  testModelConnection: (config: { provider: ModelProvider; modelId: string; apiKey: string; baseUrl: string }) => Promise<{ ok: boolean; status?: number; latencyMs?: number; message: string }>;
  fetchStream: (requestId: string, url: string, options: { method: string; headers: Record<string, string>; body: string }) => Promise<void>;
  fetchStreamAbort: (requestId: string) => Promise<void>;
  onFetchStreamData: (callback: (requestId: string, data: { type: string; status?: number; statusText?: string; text?: string }) => void) => () => void;

  // DB: Conversations
  dbGetConversations: () => Promise<any[]>;
  dbGetMessages: (convId: string) => Promise<any[]>;
  dbUpsertConversation: (conv: any) => Promise<void>;
  dbUpsertMessage: (msg: any) => Promise<void>;
  dbDeleteConversation: (id: string) => Promise<void>;
  dbDeleteMessage: (id: string) => Promise<void>;
  dbUpdateConversationTitle: (id: string, title: string) => Promise<void>;

  // DB: Reports
  dbGetReports: () => Promise<any[]>;
  dbUpsertReport: (report: any) => Promise<void>;
  dbDeleteReport: (id: string) => Promise<void>;
  dbGetReportById: (id: string) => Promise<any>;

  // DB: Templates
  dbGetTemplates: () => Promise<any[]>;
  dbSaveTemplate: (report: any) => Promise<void>;
  dbDeleteTemplate: (id: string) => Promise<void>;

  // DB: Config
  dbGetConfig: (key: string) => Promise<string | null>;
  dbSetConfig: (key: string, value: string) => Promise<void>;
  dbGetAllConfig: () => Promise<Record<string, string>>;

  // FS
  fsGetDataDir: () => Promise<string>;
  fsSetDataDir: (dir: string) => Promise<void>;
  fsOpenDataDir: () => Promise<void>;
  fsExportExcel: (html: string, title: string) => Promise<{ ok: boolean; message?: string }>;
  fsSelectDirectory: () => Promise<string | null>;
  fsMigrateDataDir: (newDir: string) => Promise<{ ok: boolean; message: string }>;

  // Skills
  skillsList: () => Promise<ExternalSkill[]>;
  skillsOpenDir: () => Promise<void>;
  skillsInstallFromUrl: (url: string) => Promise<{ ok: boolean; name?: string; toolCount?: number; error?: string }>;
  skillsRegistryList: () => Promise<RegistrySkillManifest[]>;
  skillsRegistrySave: (manifest: RegistrySkillManifest) => Promise<{ ok: boolean; id: string }>;
  skillsRegistryDelete: (id: string) => Promise<{ ok: boolean }>;
  skillsRegistryExport: (id: string, targetPath: string) => Promise<{ ok: boolean; path: string }>;
  skillsRegistryImport: (sourcePath: string) => Promise<{ ok: boolean; id: string }>;

  // MCP HTTP Transport
  mcpHttpDiscover: (url: string, timeoutMs?: number) => Promise<{ ok: boolean; tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>; error?: string }>;
  mcpHttpCall: (url: string, toolName: string, toolArgs: Record<string, unknown>, timeoutMs?: number) => Promise<{ ok: boolean; result?: string; error?: string }>;

  // Web Fetch (proxied through main to bypass CORS)
  webFetch: (url: string, options?: { timeoutMs?: number }) => Promise<{ ok: boolean; status: number; text: string; error?: string }>;

  // File Picker & Reader
  fsSelectFile: (extensions: string[]) => Promise<string | null>;
  fsReadTextFile: (filePath: string) => Promise<string | null>;

  // System Identity
  getWindowsIdentity: () => Promise<WindowsIdentity>;

  // Activation
  activationGetMachineCode: () => Promise<string>;
  activationGetStatus: () => Promise<ActivationStatus>;
  activationSubmit: (authCode: string) => Promise<{ ok: boolean; message: string; status?: ActivationStatus }>;
  activationClear: () => Promise<void>;

  // Datasource
  datasourceGetAll: () => Promise<DatasourceConfigPublic[]>;
  datasourceSave: (config: DatasourceConfigPublic) => Promise<DatasourceConfigPublic>;
  datasourceDelete: (id: string) => Promise<void>;
  datasourceTest: (id: string) => Promise<{ ok: boolean; message: string }>;
  datasourceQuery: (id: string, sql: string, params?: unknown[]) => Promise<{ columns: string[]; rows: unknown[][]; rowCount: number; executionMs: number }>;
  datasourceGetSchema: (id: string) => Promise<{ tables: Array<{ name: string; columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }> }> }>;

  // Vendor file reader (for inlining chart libs into exported HTML)
  readVendorFile: (filename: string) => Promise<string | null>;

  // Theme CSS reader (for inlining theme styles into exported HTML)
  readStyleFile: (filename: string) => Promise<string | null>;

  // Export HTML bundle (interactive with DuckDB or lightweight static)
  exportHtmlBundle: (args: { html: string; title: string; mode: 'interactive' | 'static'; themeId?: string; layoutId?: string; palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean } }) => Promise<boolean>;

  // Notify main process of current language for native dialog localisation
  appSetLanguage?: (lang: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
