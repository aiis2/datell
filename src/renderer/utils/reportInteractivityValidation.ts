export interface ReportInteractivityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion: string;
}

function hasAnyPattern(html: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(html));
}

const FILTER_UI_PATTERNS = [
  /data-filter-id\s*=/i,
  /data-filter-field\s*=/i,
  /class=["'][^"']*filter-zone-select/i,
  /class=["'][^"']*filter-global-panel/i,
  /class=["'][^"']*filter-btn-group/i,
  /class=["'][^"']*filter-search-box/i,
  /class=["'][^"']*filter-numeric-range/i,
];

const LEGACY_ZONE_FILTER_PATTERNS = [
  /data-filter-field\s*=/i,
  /class=["'][^"']*filter-zone-select/i,
  /class=["'][^"']*zone-filter/i,
];

const CHART_PATTERNS = [
  /new\s+ApexCharts\s*\(/i,
  /echarts\.init\s*\(/i,
  /\.setOption\s*\(/i,
];

const KPI_CLASS_PATTERN = /\bkpi(?:-[\w]+)?\b/i;
const CARD_TAG_PATTERNS = /<div\b[^>]*>/gi;
const SCRIPT_BLOCK_PATTERNS = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

const FILTER_REBIND_PATTERNS = [
  /(?:document|window)\.addEventListener\(\s*['"]filterChange['"]/i,
  /__FILTER_STATE__/i,
];

const SQL_REBIND_PATTERNS = [
  /data-sql\s*=/i,
];

const INTERACTION_RULE_PATTERNS = [
  /data-interactions\s*=/i,
];

const DRILL_DOWN_RULE_PATTERNS = [
  /"action"\s*:\s*"drill_down"/i,
];

const DRILL_UP_RULE_PATTERNS = [
  /"action"\s*:\s*"drill_up"/i,
];

const DRILL_UI_PATTERNS = [
  /drill-breadcrumb/i,
  /drill-up-btn/i,
];

const DRILL_SQL_PATTERNS = [
  /drillSql/i,
];

const DRILL_DIMENSION_PATTERNS = [
  /drillDimension/i,
];

const DRILL_CONTEXT_PATTERNS = [
  /drillPaths\s*:/i,
];

const EVENT_EMIT_PATTERNS = [
  /__REPORT_EVENT_BUS__\s*\?\.\s*emit\s*\(/i,
  /__REPORT_EVENT_BUS__\s*&&\s*window\.__REPORT_EVENT_BUS__\.emit\s*\(/i,
  /__REPORT_EVENT_BUS__\.emit\s*\(/i,
];

const APEX_REGISTER_PATTERNS = [
  /registerApex\s*\(/i,
];

function extractAttribute(tag: string, attributeName: string): string | null {
  const escapedAttribute = attributeName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = tag.match(new RegExp(`${escapedAttribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractInlineScripts(html: string): string[] {
  const scripts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = SCRIPT_BLOCK_PATTERNS.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  return scripts;
}

function findKpiCards(html: string): Array<{ cardId: string; hasSql: boolean; isStatic: boolean }> {
  const cards: Array<{ cardId: string; hasSql: boolean; isStatic: boolean }> = [];
  let match: RegExpExecArray | null;

  while ((match = CARD_TAG_PATTERNS.exec(html)) !== null) {
    const tag = match[0];
    const className = extractAttribute(tag, 'class') || '';
    const cardId = extractAttribute(tag, 'data-card-id');

    if (!cardId || !KPI_CLASS_PATTERN.test(className)) continue;

    cards.push({
      cardId,
      hasSql: /data-sql\s*=/i.test(tag),
      isStatic: /data-kpi-static\s*=\s*["']true["']/i.test(tag),
    });
  }

  return cards;
}

function hasManualKpiUpdatePath(html: string, cardId: string): boolean {
  const escapedCardId = escapeRegExp(cardId);
  const eventPattern = /(?:document|window)\.addEventListener\(\s*['"](?:filterChange|cardUpdate)['"]|\$\s*\(\s*(?:document|window)\s*\)\.on\(\s*['"](?:filterChange|cardUpdate)['"]/i;
  const domUpdatePattern = /\.(?:textContent|innerText|innerHTML)\s*=|setAttribute\s*\(|\.(?:text|html)\s*\(/i;
  const cardRefPattern = new RegExp(escapedCardId, 'i');

  return extractInlineScripts(html).some((script) => (
    eventPattern.test(script)
    && cardRefPattern.test(script)
    && domUpdatePattern.test(script)
  ));
}

export function validateReportInteractivity(html: string): ReportInteractivityIssue[] {
  const issues: ReportInteractivityIssue[] = [];

  const hasFilterUi = hasAnyPattern(html, FILTER_UI_PATTERNS);
  const hasLegacyZoneFilter = hasAnyPattern(html, LEGACY_ZONE_FILTER_PATTERNS);
  const hasCharts = hasAnyPattern(html, CHART_PATTERNS);
  const hasFilterRebind = hasAnyPattern(html, FILTER_REBIND_PATTERNS);
  const hasSqlRebind = hasAnyPattern(html, SQL_REBIND_PATTERNS);
  const hasInteractionRules = hasAnyPattern(html, INTERACTION_RULE_PATTERNS);
  const hasDrillDownRules = hasAnyPattern(html, DRILL_DOWN_RULE_PATTERNS);
  const hasDrillUpRules = hasAnyPattern(html, DRILL_UP_RULE_PATTERNS);
  const hasDrillUi = hasAnyPattern(html, DRILL_UI_PATTERNS);
  const hasDrillSql = hasAnyPattern(html, DRILL_SQL_PATTERNS);
  const hasDrillDimension = hasAnyPattern(html, DRILL_DIMENSION_PATTERNS);
  const hasDrillContext = hasAnyPattern(html, DRILL_CONTEXT_PATTERNS);
  const hasEventEmit = hasAnyPattern(html, EVENT_EMIT_PATTERNS);
  const hasApexCharts = /new\s+ApexCharts\s*\(/i.test(html);
  const hasRegisterApex = hasAnyPattern(html, APEX_REGISTER_PATTERNS);
  const kpiCards = findKpiCards(html);
  const invalidDynamicKpiCards = kpiCards.filter((card) => !card.isStatic && !card.hasSql && !hasManualKpiUpdatePath(html, card.cardId));

  if (hasFilterUi && hasCharts && !hasFilterRebind && !hasSqlRebind) {
    issues.push({
      code: 'FILTER_UI_WITHOUT_UPDATE_LOGIC',
      severity: 'error',
      message: '报表包含筛选控件，但没有任何图表重绘路径。当前 HTML 既没有 data-sql 驱动的引擎重绑，也没有 filterChange/__FILTER_STATE__ 客户端监听。',
      suggestion: '为受影响图表补上 data-sql + __report_data_context__，或在脚本中监听 filterChange 并基于 window.__FILTER_STATE__ 重算图表数据。禁止只输出筛选 UI。',
    });
  }

  if (hasLegacyZoneFilter) {
    issues.push({
      code: 'LEGACY_ZONE_FILTER_PROTOCOL',
      severity: 'warning',
      message: '报表使用了兼容模式的 zone-filter/data-filter-field 协议。这类控件只负责发出筛选事件，不会自动让图表重绘。',
      suggestion: '优先改用 data-filter-id + data-filter-type 标准控件；若必须保留 zone-filter，务必同时提供 data-sql 或 filterChange 监听。',
    });
  }

  if (hasFilterUi && invalidDynamicKpiCards.length > 0) {
    const cardList = invalidDynamicKpiCards.map((card) => card.cardId).join(', ');
    issues.push({
      code: 'FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC',
      severity: 'error',
      message: `报表包含筛选控件，但以下 KPI 卡片没有随筛选刷新的路径：${cardList}。这些摘要卡默认视为动态 KPI，不能保持初始静态值。`,
      suggestion: '为这些 KPI 卡补上 data-sql 或手写 filterChange/cardUpdate 更新逻辑；如果它们本来就是固定说明卡，请显式添加 data-kpi-static="true"。',
    });
  }

  if (hasEventEmit && !hasInteractionRules) {
    issues.push({
      code: 'CHART_EMIT_WITHOUT_INTERACTIONS',
      severity: 'error',
      message: '图表脚本调用了 window.__REPORT_EVENT_BUS__.emit()，但页面没有任何 data-interactions 规则，点击联动不会生效。',
      suggestion: '在源卡片上添加 data-interactions 规则，或移除无效的 emit() 调用。',
    });
  }

  if (hasDrillDownRules && (!hasDrillSql || !hasDrillDimension || !hasDrillContext)) {
    issues.push({
      code: 'DRILL_RULE_WITHOUT_CONTEXT',
      severity: 'error',
      message: '报表声明了 drill_down 联动，但缺少 drillSql、drillDimension 或 __report_data_context__.drillPaths 之一，上下钻状态无法建立。',
      suggestion: '为 drill_down 规则补齐 drillSql/drillDimension，并在 __report_data_context__ 中声明对应 cardId 的 drillPaths。',
    });
  }

  if ((hasDrillUi || hasDrillUpRules) && !hasDrillDownRules) {
    issues.push({
      code: 'DRILL_UI_WITHOUT_RULES',
      severity: 'warning',
      message: '报表包含 drill breadcrumb / drill_up 入口，但没有任何 drill_down 规则，用户无法进入下级层级。',
      suggestion: '至少为一个源图表声明 action="drill_down" 规则，并补齐 drillSql、drillDimension 与 drillPaths。',
    });
  }

  if (hasApexCharts && hasInteractionRules && !hasRegisterApex) {
    issues.push({
      code: 'APEX_WITHOUT_REGISTER',
      severity: 'error',
      message: '页面声明了联动规则并使用 ApexCharts，但脚本没有调用 registerApex()，引擎无法自动绑定 ApexCharts 事件。',
      suggestion: '在 chart.render().then(...) 中调用 window.__REPORT_EVENT_BUS__?.registerApex(cardId, chart)。',
    });
  }

  return issues;
}

export function formatReportInteractivityIssues(issues: ReportInteractivityIssue[]): string {
  if (issues.length === 0) return '';

  return issues
    .map((issue, index) => `${index + 1}. [${issue.code}] ${issue.message}\n   建议：${issue.suggestion}`)
    .join('\n');
}