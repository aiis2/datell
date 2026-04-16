/**
 * layoutManifest.ts
 *
 * Static layout catalog derived from the 43 layout JSON files in
 * resources/system_knowledge/layouts/. This is the source of truth for
 * the Report Design UI (category filter + search + card grid).
 *
 * The `id` field equals cssPath.replace('.css', '') — i.e. the same value
 * stored in configStore.reportLayoutId and expected by report-shell.html.
 */

/**
 * SVG wireframe preview type — determines which SVG pattern is rendered for this layout.
 * Each type maps to a distinct visual structure in SvgLayoutPreview.tsx.
 */
export type LayoutPreviewType =
  | '1col'        // single full-width column
  | '2col'        // 2-column grid, KPI row at top
  | '3col'        // 3-column grid, KPI row at top
  | 'bento'       // CSS Grid bento layout (varying card sizes)
  | 'magazine'    // 2/3 + 1/3 magazine split
  | 'a4'          // A4 portrait document
  | 'mobile'      // narrow single column (mobile)
  | 'compact'     // dense multi-column grid
  | 'kpi-3col'    // 3-column KPI focused
  | 'timeline'    // vertical timeline / waterfall
  | 'matrix'      // grid matrix layout
  | 'map'         // map-centered layout
  | 'candlestick' // finance chart layout
  | 'funnel'      // funnel chart focus
  | 'calendar'    // calendar grid
  | 'flow';       // process flow / pipeline

export interface LayoutManifestItem {
  /** Canonical ID = cssPath without ".css", e.g. "universal/dashboard-2col" */
  id: string;
  name: string;
  /** English category key, e.g. "universal", "finance" */
  category: string;
  description: string;
  /** Relative CSS path under public/styles/layouts/ */
  cssPath: string;
  tags: string[];
  /** SVG wireframe preview type for the layout preview modal */
  previewType: LayoutPreviewType;
}

export const LAYOUT_MANIFEST: LayoutManifestItem[] = [
  /* ── universal ── */
  { id: 'universal/single-col',           name: '单列布局',         category: 'universal',  cssPath: 'universal/single-col.css',           description: '单列垂直堆叠布局，所有元素全宽排列，适合文档风格报告',                tags: ['单列', '通用', '简洁', '文档', '窄屏'] , previewType: '1col' },
  { id: 'universal/dashboard-2col',       name: '双列仪表盘',       category: 'universal',  cssPath: 'universal/dashboard-2col.css',       description: '通用双列仪表盘布局，顶部4个KPI卡片，图表2列均等分布',              tags: ['双列', '仪表盘', '通用', '均衡', '看板'] , previewType: '2col' },
  { id: 'universal/dashboard-3col',       name: '三列仪表盘',       category: 'universal',  cssPath: 'universal/dashboard-3col.css',       description: '宽屏三列仪表盘，6个KPI，图表3列，适合大屏高密度信息展示',         tags: ['三列', '仪表盘', '大屏', '看板', '高密度'] , previewType: '3col' },
  { id: 'universal/bento-grid',           name: 'Bento 拼图网格',   category: 'universal',  cssPath: 'universal/bento-grid.css',           description: '12列CSS Grid拼图布局，卡片可跨多列，苹果Bento设计风格',          tags: ['bento', '拼图', '12列', '自由布局', '现代', '苹果风'] , previewType: 'bento' },
  { id: 'universal/compact-dashboard',    name: '紧凑看板',         category: 'universal',  cssPath: 'universal/compact-dashboard.css',    description: '高密度紧凑看板，缩小间距，适合运营监控、实时大屏',               tags: ['紧凑', '高密度', '小间距', '运营', '监控'] , previewType: 'compact' },
  { id: 'universal/magazine-wide',        name: '杂志宽屏',         category: 'universal',  cssPath: 'universal/magazine-wide.css',        description: '杂志风宽屏布局，主内容区占2/3，侧边辅助信息占1/3',              tags: ['杂志', '宽屏', '2fr 1fr', '主辅', '编辑'] , previewType: 'magazine' },
  { id: 'universal/print-a4',             name: 'A4 打印布局',      category: 'universal',  cssPath: 'universal/print-a4.css',             description: 'A4纸张打印优化布局，自动分页，适合生成可打印PDF报告',            tags: ['打印', 'A4', 'PDF', '文档', '排版'] , previewType: 'a4' },
  { id: 'universal/mobile-first',         name: '移动端优先',       category: 'universal',  cssPath: 'universal/mobile-first.css',         description: '移动端优先布局，KPI两列，图表单列，适配小屏幕',                  tags: ['移动端', '响应式', '手机', '小屏', '竖屏'] , previewType: 'mobile' },
  /* ── finance ── */
  { id: 'finance/kpi-3col',               name: '金融KPI三列',      category: 'finance',    cssPath: 'finance/kpi-3col.css',               description: '金融行业标准三列KPI看板，顶部3个KPI卡片，中部主图表+辅助指标',   tags: ['金融', '财务', 'KPI', '三列', '看板', '利润', '收入', '风控'] , previewType: 'kpi-3col' },
  { id: 'finance/pnl-report',             name: '财务损益报告',     category: 'finance',    cssPath: 'finance/pnl-report.css',             description: '财务损益报告标准布局，顶部4列KPI，中部利润表+趋势图，底部费用分析', tags: ['财务', '损益表', '利润', '收入', '成本', 'PnL'] , previewType: 'timeline' },
  { id: 'finance/monitoring-realtime',    name: '财务实时监控',     category: 'finance',    cssPath: 'finance/monitoring-realtime.css',    description: '财务日度/实时监控看板，Today关键指标，实时收支流水表',           tags: ['财务监控', '实时', '看板', '预算跟踪', '日度监控'] , previewType: 'compact' },
  { id: 'finance/risk-matrix',            name: '风险矩阵',         category: 'finance',    cssPath: 'finance/risk-matrix.css',            description: '风险评估矩阵布局，左侧风险热力矩阵，右侧风险列表，底部趋势图',   tags: ['金融', '风控', '风险', '矩阵', '评级'] , previewType: 'matrix' },
  { id: 'finance/cashflow-timeline',      name: '现金流时间轴',     category: 'finance',    cssPath: 'finance/cashflow-timeline.css',      description: '现金流专用布局，顶部流入流出KPI，中部时间轴瀑布图',             tags: ['现金流', '时间轴', '财务', '资金', '流水'] , previewType: 'timeline' },
  { id: 'finance/trading-candlestick',    name: '交易行情',         category: 'finance',    cssPath: 'finance/trading-candlestick.css',    description: '金融交易行情专用布局，顶部价格KPI，主区K线图，底部成交量',       tags: ['K线', '股票', '交易', '行情', '金融市场'] , previewType: 'candlestick' },
  /* ── ecommerce ── */
  { id: 'ecommerce/gmv-overview',         name: 'GMV大盘总览',      category: 'ecommerce',  cssPath: 'ecommerce/gmv-overview.css',         description: '电商GMV大盘总览，GMV趋势面积图+品类贡献饼图+渠道GMV排名',      tags: ['电商', 'GMV', '总览', '订单', '转化', '平台大盘'] , previewType: '2col' },
  { id: 'ecommerce/funnel-conversion',    name: '转化漏斗',         category: 'ecommerce',  cssPath: 'ecommerce/funnel-conversion.css',    description: '电商购物转化漏斗布局，顶部核心GMV/订单KPI，中部转化漏斗图',     tags: ['电商', '漏斗', '转化率', '购物流程', 'GMV'] , previewType: 'funnel' },
  { id: 'ecommerce/order-status',         name: '订单状态看板',     category: 'ecommerce',  cssPath: 'ecommerce/order-status.css',         description: '订单状态实时看板，顶部各状态KPI，中部状态分布饼图+趋势',        tags: ['电商', '订单', '状态', '物流', '监控'] , previewType: 'compact' },
  { id: 'ecommerce/product-heatmap',      name: '商品热力矩阵',     category: 'ecommerce',  cssPath: 'ecommerce/product-heatmap.css',      description: '商品销售热力矩阵布局，主区商品×时间热力图，右侧Top商品排行',     tags: ['电商', '商品', '热力图', 'SKU', '销售矩阵'] , previewType: 'matrix' },
  { id: 'ecommerce/user-behavior',        name: '用户行为分析',     category: 'ecommerce',  cssPath: 'ecommerce/user-behavior.css',        description: '电商用户行为深度分析，DAU/新用户/留存率，行为漏斗+来源桑基图',  tags: ['用户行为', '漏斗', '留存', '路径', '电商', '用户分析'] , previewType: 'funnel' },
  /* ── operations ── */
  { id: 'operations/server-monitor',      name: '服务器性能监控',   category: 'operations', cssPath: 'operations/server-monitor.css',      description: '服务器/基础设施性能监控，CPU/内存/告警指标，实时折线图',        tags: ['服务器', '监控', 'CPU', '内存', '响应时间', '运维'] , previewType: 'compact' },
  { id: 'operations/sla-monitor',         name: 'SLA服务监控',      category: 'operations', cssPath: 'operations/sla-monitor.css',         description: 'SLA服务水平协议监控，顶部达标率KPI，中部趋势图+违规清单',       tags: ['SLA', '服务质量', '监控', '运维', '达标率'] , previewType: 'compact' },
  { id: 'operations/incident-flow',       name: '运维故障流程',     category: 'operations', cssPath: 'operations/incident-flow.css',       description: '运维故障事件全流程布局，告警列表+故障流转甘特图，MTTR/MTBF',    tags: ['运维', '故障', '告警', 'ITSM', '事故流程'] , previewType: 'flow' },
  { id: 'operations/capacity-planning',   name: '产能规划看板',     category: 'operations', cssPath: 'operations/capacity-planning.css',   description: '产能规划布局，产能利用率KPI，各产线利用率条形图+趋势折线',       tags: ['产能', '规划', '产线', '利用率', '制造'] , previewType: '2col' },
  { id: 'operations/logistics-map',       name: '物流配送地图',     category: 'operations', cssPath: 'operations/logistics-map.css',       description: '物流运营布局，主区地理配送地图，右侧配送KPI与路线效率',         tags: ['物流', '地图', '配送', '区域覆盖', '运营'] , previewType: 'map' },
  /* ── sales ── */
  { id: 'sales/crm-pipeline',             name: 'CRM销售漏斗',      category: 'sales',      cssPath: 'sales/crm-pipeline.css',             description: 'CRM销售管道布局，顶部线索/商机/成单KPI，中部销售漏斗图',        tags: ['CRM', '销售', '漏斗', '线索', '管道'] , previewType: 'funnel' },
  { id: 'sales/daily-report',             name: '销售日报',         category: 'sales',      cssPath: 'sales/daily-report.css',             description: '销售日报看板，当日目标达成进度条，各成员业绩横向柱状图',         tags: ['销售', '日报', '当日业绩', '目标达成', '销售看板'] , previewType: '2col' },
  { id: 'sales/quota-progress',           name: '销售配额进度',     category: 'sales',      cssPath: 'sales/quota-progress.css',           description: '销售配额跟踪布局，团队总体完成率KPI，个人进度条看板',            tags: ['销售', '配额', '目标', '进度', '团队'] , previewType: 'kpi-3col' },
  { id: 'sales/regional-analysis',        name: '销售区域分析',     category: 'sales',      cssPath: 'sales/regional-analysis.css',        description: '销售区域分析，以地图为核心，大区排名柱状图+区域详情表格',        tags: ['销售', '区域', '地图', '区域对比', '大区分析'] , previewType: 'map' },
  { id: 'sales/territory-map',            name: '区域销售地图',     category: 'sales',      cssPath: 'sales/territory-map.css',            description: '区域销售分布布局，主区各省市销售热力地图，右侧区域排行榜',       tags: ['销售', '地图', '区域', '地理', '分布'] , previewType: 'map' },
  /* ── hr ── */
  { id: 'hr/headcount-dashboard',         name: '人力资本看板',     category: 'hr',         cssPath: 'hr/headcount-dashboard.css',         description: 'HR人力资本布局，在职/招聘中/离职率KPI，部门人数分布+人效趋势', tags: ['HR', '人力', '招聘', '离职', '人效'] , previewType: '2col' },
  { id: 'hr/performance',                 name: 'HR绩效评估',       category: 'hr',         cssPath: 'hr/performance.css',                 description: 'HR绩效评估报告，绩效分级分布柱状图+部门对比雷达图',              tags: ['HR', '绩效', '员工评估', 'KPI考核', '人力资源'] , previewType: 'matrix' },
  { id: 'hr/hr-onboarding',               name: 'HR入职追踪',       category: 'hr',         cssPath: 'hr/hr-onboarding.css',               description: 'HR新员工入职进度追踪，入职流程甘特图+各阶段完成率',              tags: ['HR', '入职', 'Onboarding', '新员工', '流程追踪'] , previewType: 'flow' },
  { id: 'hr/talent-matrix',               name: '人才矩阵',         category: 'hr',         cssPath: 'hr/talent-matrix.css',               description: '人才评估九宫格布局，绩效×潜力二维矩阵，配套人才分布列表',        tags: ['HR', '人才', '9宫格', '绩效', '潜力'] , previewType: 'matrix' },
  /* ── marketing ── */
  { id: 'marketing/campaign-performance', name: '营销活动效果',     category: 'marketing',  cssPath: 'marketing/campaign-performance.css', description: '营销活动效果布局，曝光/点击/转化/ROI KPI，渠道对比+转化漏斗',  tags: ['营销', '活动', 'ROI', '转化', '投放效果'] , previewType: '2col' },
  { id: 'marketing/attribution',          name: '营销归因分析',     category: 'marketing',  cssPath: 'marketing/attribution.css',          description: '营销渠道归因分析，多渠道ROI对比柱状图+归因模型桑基图',          tags: ['营销', '归因', '渠道', 'ROI', '投放效果'] , previewType: 'funnel' },
  { id: 'marketing/mkt-ab-test',          name: 'A/B测试报告',      category: 'marketing',  cssPath: 'marketing/mkt-ab-test.css',          description: 'A/B测试结果展示，实验组vs对照组核心指标对比柱状图',             tags: ['AB测试', '实验', '转化率', '显著性', '营销实验'] , previewType: '2col' },
  { id: 'marketing/social-analytics',     name: '社媒数据分析',     category: 'marketing',  cssPath: 'marketing/social-analytics.css',     description: '社交媒体数据分析，粉丝/互动率KPI，平台对比雷达图+增长趋势',     tags: ['社交媒体', '粉丝', '互动', '内容', '传播'] , previewType: '2col' },
  /* ── logistics ── */
  { id: 'logistics/route-optimizer',      name: '物流路由优化',     category: 'logistics',  cssPath: 'logistics/route-optimizer.css',      description: '物流路由分析布局，主区路线地图+成本对比，右侧时效KPI',          tags: ['物流', '路由', '运输', '成本', '优化'] , previewType: 'map' },
  { id: 'logistics/warehouse-heatmap',    name: '仓储热力布局',     category: 'logistics',  cssPath: 'logistics/warehouse-heatmap.css',    description: '仓储管理布局，主区库位热力图，右侧库存KPI与周转率',             tags: ['仓库', '库存', '热力', '仓储', '分布'] , previewType: 'matrix' },
  /* ── medical ── */
  { id: 'medical/patient-flow',           name: '患者就诊流程',     category: 'medical',    cssPath: 'medical/patient-flow.css',           description: '医疗患者流程布局，挂号/就诊/待诊KPI，科室分布热力图+等待趋势',  tags: ['医疗', '患者', '就诊', '门诊', '流量'] , previewType: 'flow' },
  { id: 'medical/clinical-outcomes',      name: '临床结果分析',     category: 'medical',    cssPath: 'medical/clinical-outcomes.css',      description: '临床结果分析布局，治愈率/并发症率KPI，治疗方案对比雷达图',       tags: ['医疗', '临床', '治愈率', '预后', '效果'] , previewType: '2col' },
  /* ── editorial ── */
  { id: 'editorial/article-analytics',    name: '文章内容分析',     category: 'editorial',  cssPath: 'editorial/article-analytics.css',    description: '内容媒体文章分析布局，阅读/分享/评论KPI，内容分类饼图',         tags: ['内容', '文章', '阅读量', '传播', '媒体'] , previewType: '2col' },
  { id: 'editorial/content-calendar',     name: '内容日历看板',     category: 'editorial',  cssPath: 'editorial/content-calendar.css',     description: '内容排期日历布局，主区月度内容日历，右侧本周待发布队列',         tags: ['内容', '日历', '排期', '计划', '编辑'] , previewType: 'calendar' },
];

/** All unique categories in display order */
export const LAYOUT_CATEGORIES: string[] = [
  'universal', 'finance', 'ecommerce', 'operations', 'sales',
  'hr', 'marketing', 'logistics', 'medical', 'editorial',
];

/** Chinese display names for category keys */
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  universal:  '通用',
  finance:    '财务',
  ecommerce:  '电商',
  operations: '运营',
  sales:      '销售',
  hr:         'HR',
  marketing:  '营销',
  logistics:  '物流',
  medical:    '医疗',
  editorial:  '编辑',
};

/**
 * Look up a layout manifest item by its cssLayoutId
 * (i.e. the value stored in configStore.reportLayoutId).
 */
export function findLayoutById(id: string | undefined): LayoutManifestItem | undefined {
  if (!id) return undefined;
  return LAYOUT_MANIFEST.find((l) => l.id === id);
}
