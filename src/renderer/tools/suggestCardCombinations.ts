/**
 * suggest_card_combinations — 报表前置卡片规划工具
 *
 * AI 在调用 generate_chart / generate_chart_apex 之前必须先调用此工具。
 * 工具会：
 *   1. 通过 System RAG 搜索最合适的卡片类型
 *   2. 基于数据特征主动推荐适配的 KPI 变体
 *   3. 返回内部参考建议，AI 据此决策卡片结构（建议不可追加到最终回复）
 */
import type { AgentToolDefinition } from '../types';
import { retrieveSystemComponents } from '../services/systemRagService';
import { useConfigStore } from '../stores/configStore';

export const suggestCardCombinationsTool: AgentToolDefinition = {
  name: 'suggest_card_combinations',
  description:
    '**报表生成前必须调用**。根据数据上下文从卡片库中推荐最优卡片组合方案，用于指导 generate_chart 生成什么样的卡片结构和布局。' +
    '在调用 generate_chart 或 generate_chart_apex 之前立即调用此工具，获取卡片建议后再生成报表 HTML。' +
    '工具返回的卡片建议仅供 AI 内部参考，用于决策报表结构，不要将建议文字追加到最终回复输出中。',
  parameters: [
    {
      name: 'current_cards',
      type: 'string',
      description:
        '当前报告中已确定使用的卡片变体专属类名列表，逗号分隔。' +
        '首次生成报告时传空字符串 ""。' +
        '已有报告追加卡片时，传已使用的卡片变体专属类名（如 "kpi-sparkline,kpi-comparison-two-period,bar-chart-grouped"）。' +
        '注意：不要传通用基础类名（如 "kpi-card"、"chart-card"），否则会导致所有同类卡片被误排除。',
      required: true,
    },
    {
      name: 'data_context',
      type: 'string',
      description:
        '报告内容摘要：数据类型、核心维度和指标。' +
        '例如："销售数据，经办人/门店/品牌/商品四维度，20笔订单，近3个月时序趋势"',
      required: true,
    },
    {
      name: 'report_type',
      type: 'string',
      description:
        '报表类型标签（用于生成针对性探索建议）：' +
        'summary（汇总看板）/ time_series（时序趋势）/ comparison（多维对比）/ ' +
        'distribution（分布分析）/ mixed（综合）。不确定时填 mixed。',
      required: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const currentCards = String(args.current_cards ?? '');
    const dataContext  = String(args.data_context  ?? '');
    const reportType   = String(args.report_type   ?? 'mixed');

    // ── 公共类名工具（在 try 块外定义，RAG 过滤和主动变体建议均可使用）──────────
    // 通用基础类名集合（不作为排重依据，几乎出现在所有卡片中）
    const BASE_CLASSES = new Set(['card', 'kpi-card', 'chart-card', 'table-card', 'filter-card', 'data-card']);

    /**
     * 从 htmlClassName 中提取专属变体类名（去除通用基础类后的部分）。
     * 例如："card kpi-card kpi-sparkline" → ["kpi-sparkline"]
     *       "card kpi-card" → []（纯基础类，无专属类）
     */
    const getSpecificClasses = (cls: string): string[] =>
      cls.split(' ').map(c => c.trim()).filter(c => c && !BASE_CLASSES.has(c));

    // 解析 current_cards：只识别专属变体类名（遇到纯基础类名无效）
    // 在 try 块外声明，供 RAG 过滤和主动建议的去重双重使用
    const usedSpecificClasses = new Set(
      currentCards.toLowerCase().split(',')
        .map(s => s.trim())
        .filter(s => s && !BASE_CLASSES.has(s))
    );

    // ── 1. RAG 检索更优卡片 ──────────────────────────────────────────────
    let alternativeCards: Array<{ id?: string; name: string; description: string; category: string; htmlClassName?: string; exampleHtml?: string }> = [];
    try {
      const { cards } = await retrieveSystemComponents(dataContext, { topKCards: 12 });

      alternativeCards = cards
        .filter((c) => {
          const rawClassName = (c.htmlClassName || '').toLowerCase();
          const cardId = (c.id || '').toLowerCase();
          const specificClasses = getSpecificClasses(rawClassName);

          if (specificClasses.length > 0) {
            // 有专属类名时：只要专属类名集合与已用集合不重叠即可通过
            return !specificClasses.some(sc => usedSpecificClasses.has(sc));
          } else {
            // 无专属类名（纯基础类卡片）：按卡片 ID 排重
            return !usedSpecificClasses.has(cardId);
          }
        })
        .slice(0, 8)  // 保留更多候选，后续 variantSpecificClasses 过滤后仍有足够 RAG 槽位
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          category: c.category,
          htmlClassName: c.htmlClassName,
          exampleHtml: c.exampleHtml,
        }));
    } catch {
      // RAG 不可用时静默降级，不影响主流程
    }

    // ── 2. 生成联动探索建议 ──────────────────────────────────────────────
    const text = dataContext.toLowerCase();
    const hasMultipleDims =
      (text.match(/[/、]/g) || []).length >= 2 ||
      (text.match(/[，,]/g) || []).length >= 4 ||
      text.includes('维度') ||
      text.includes('多维') ||
      text.includes('按分类') ||
      text.includes('按区域') ||
      text.includes('按部门') ||
      text.includes('按渠道');
    // hasTimeSeries: 严格匹配「时序性」语境，避免普通「月份」「日期」触发迷你趋势图
    // 单字「月」「日」在中文业务描述中极其普遍（「本月」「日期」「工作日」），不能用于判断
    const hasTimeSeries =
      reportType === 'time_series' ||
      text.includes('时序') ||
      text.includes('时间序列') ||
      text.includes('历史走势') ||
      text.includes('趋势图') ||
      text.includes('走势') ||
      text.includes('日活') ||
      text.includes('日销') ||
      text.includes('日均') ||
      text.includes('按日') ||
      text.includes('每日') ||
      text.includes('月度趋势') ||
      text.includes('月环比') ||
      text.includes('月同比') ||
      text.includes('按月') ||
      text.includes('每月') ||
      /近\d+[天日月周]/.test(text) ||
      /过去\d+[天日月]/.test(text) ||
      /最近\d+[天日月]/.test(text);
    // hasComparison: 仅在明确对比结构（双期并排、两组对比）时触发，避免 "GMV同比增长12%" 这类
    // 单纯描述增长率的文字误触发双期对比卡。
    // '同比'/'环比' 已从此列表移除——它们在几乎所有业务描述中都出现，应由 hasGrowth 处理。
    const hasComparison =
      text.includes('对比') ||
      text.includes('双期') ||
      text.includes('两期') ||
      text.includes('期间对比') ||
      text.includes('前后对比') ||
      text.includes('vs ') || text.includes(' vs') ||
      reportType === 'comparison';
    const hasDistribution =
      text.includes('分布') || text.includes('占比') || text.includes('比例') ||
      reportType === 'distribution';
    const hasTarget =
      text.includes('目标') || text.includes('完成率') || text.includes('达成') ||
      text.includes('进度');
    const hasRanking =
      text.includes('排行') || text.includes('排名') || text.includes('名次') ||
      /top[\s\d]|top$|第[\d一二三四五六七八九十]+名/.test(text);
    // hasMultiMetric: 去掉通用词 '综合'/'汇总'（几乎所有报表描述都含这两个字），
    // 保留明确指向多指标并排场景的词汇。
    const hasMultiMetric =
      text.includes('多指标') ||
      text.includes('多维指标') ||
      text.includes('看板') ||
      text.includes('概览') ||
      text.includes('核心指标') ||
      text.includes('综合指标');
    const hasGrowth =
      text.includes('增长') || text.includes('增速') || text.includes('涨跌') ||
      text.includes('涨') || text.includes('跌');
    // hasCategories: 数据集中有明确分类维度（门店/品类/渠道/人员/品牌/区域等），适合 kpi-bar-kpi
    const hasCategories =
      text.includes('门店') || text.includes('店铺') ||
      text.includes('品类') || text.includes('类别') || text.includes('类型') ||
      text.includes('品牌') || text.includes('渠道') ||
      text.includes('人员') || text.includes('经办人') || text.includes('销售员') ||
      text.includes('区域') || text.includes('地区') ||
      text.includes('部门') || text.includes('团队') ||
      text.includes('产品') || text.includes('商品') ||
      hasComparison;

    // ── 2b. 基于数据特征主动推荐 KPI 变体（安全网：独立于 RAG，防止 RAG 遗漏）──
    // 变体建议使用双重去重：① ragSpecificClasses（RAG 已有同类 class）② usedSpecificClasses（已在报表中使用）
    // 注意：使用 specific class 而非 card ID 去重，避免 kpi-multi-column / kpi-multi-metric 等
    // 同class异ID问题：只要 RAG 已返回任意 kpi-XXX class 的卡片，就不再主动推荐同类变体。
    const kpiVariantSuggestions: Array<{ name: string; description: string; category: string; htmlClassName: string; exampleHtml?: string }> = [];
    const ragSpecificClasses = new Set(
      alternativeCards.flatMap(c => getSpecificClasses(c.htmlClassName || ''))
    );

    if (hasTimeSeries && !ragSpecificClasses.has('kpi-sparkline') && !usedSpecificClasses.has('kpi-sparkline')) {
      kpiVariantSuggestions.push({
        name: '迷你趋势 KPI 卡',
        description: '紧凑型 KPI 卡片，主值旁附带一条 7-30 天的迷你折线趋势图，直观呈现波动方向。适合周报/月报核心指标速览。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-sparkline',
        // ⚠️ 重要：data-card-id 和 sparkline 容器 id 必须每张卡片保持唯一！
        // 将下方所有 kpi_YOUR_METRIC 替换为实际指标标识符（如 kpi_dau、kpi_gmv）
        exampleHtml: `<div class="card kpi-card kpi-sparkline" data-card-id="kpi_YOUR_METRIC">
  <span class="kpi-title icon-text">
    <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-chart-line"></use></svg>
    指标名称（替换）
  </span>
  <span class="kpi-value">128万 <span style="font-size:14px;font-weight:400;color:var(--text-sub)">人</span></span>
  <span class="kpi-trend up">
    <svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-trending-up"></use></svg>
    +8% 今日
  </span>
  <div id="kpi_YOUR_METRIC_spark" style="width:100%;height:48px;margin-top:6px"></div>
  <script>
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('kpi_YOUR_METRIC_spark'); if (!el) return;
    var col = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#3b82f6';
    var c = echarts.init(el);
    c.setOption({ animation:false, tooltip:{trigger:'axis',axisPointer:{type:'line',lineStyle:{color:col,opacity:0.4}},textStyle:{fontSize:12},formatter:function(p){return p[0].name+': '+p[0].value;}}, grid:{top:2,bottom:2,left:0,right:0}, xAxis:{type:'category',show:false,data:['d1','d2','d3','d4','d5','d6','d7']}, yAxis:{type:'value',show:false}, series:[{type:'line',smooth:true,data:[85,92,88,105,98,112,128],lineStyle:{color:col,width:1.5},areaStyle:{color:col,opacity:0.12},symbol:'none'}] });
  });
  </script>
</div>`,
      });
    }

    // kpi-bar-kpi: 当数据集有明确分类维度时主动推荐
    if (hasCategories && !ragSpecificClasses.has('kpi-bar-kpi') && !usedSpecificClasses.has('kpi-bar-kpi')) {
      kpiVariantSuggestions.push({
        name: '迷你柱状图 KPI 卡',
        description: '紧凑型 KPI 卡片，底部附带分类迷你柱状图（各门店/品类/渠道/人员数值对比），最后一根柱子高亮为当期/重点值。适合覆盖门店、商品类别、经办人等分类汇总指标。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-bar-kpi',
        exampleHtml: `<div class="card kpi-card kpi-bar-kpi" data-card-id="kpi_YOUR_BAR_METRIC">
  <span class="kpi-title icon-text">
    <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-chart-bar"></use></svg>
    指标名称（替换）
  </span>
  <span class="kpi-value">¥45,000 <span style="font-size:14px;font-weight:400;color:var(--text-sub)">元</span></span>
  <span class="kpi-trend up">
    <svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-trending-up"></use></svg>
    +5% 环比
  </span>
  <div id="kpi_YOUR_BAR_METRIC_bar" style="width:100%;height:48px;margin-top:6px"></div>
  <script>
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('kpi_YOUR_BAR_METRIC_bar'); if (!el) return;
    var col = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#3b82f6';
    var c = echarts.init(el);
    c.setOption({ animation:false, tooltip:{trigger:'axis',axisPointer:{type:'shadow'},textStyle:{fontSize:12},formatter:function(p){return p[0].name+': '+p[0].value;}}, grid:{top:2,bottom:2,left:0,right:0}, xAxis:{type:'category',show:false,data:['类刨1','类刨2','类刨3']}, yAxis:{type:'value',show:false}, series:[{type:'bar',barMaxWidth:14,data:[3120,2657,{value:4669,itemStyle:{color:col,opacity:1}}],itemStyle:{color:col,opacity:0.45},borderRadius:[2,2,0,0]}] });
  });
  </script>
</div>`,
      });
    }

    if ((hasComparison || reportType === 'comparison') && !ragSpecificClasses.has('kpi-two-period') && !usedSpecificClasses.has('kpi-two-period')) {
      kpiVariantSuggestions.push({
        name: '双期对比 KPI 卡',
        description: '本期与上期数值并排展示，带 delta 箭头和变化率，适合同比/环比对比分析。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-two-period',
        exampleHtml: `<div class="card kpi-card kpi-two-period" data-card-id="kpi_period_compare">
  <div class="kpi-label">月度 GMV</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
    <div style="text-align:center;padding:10px;border-radius:6px;background:var(--accent-bg,#eff6ff)">
      <div style="font-size:0.75rem;opacity:0.6">本月</div>
      <div class="kpi-value" style="font-size:1.6rem">¥12.8亿</div>
    </div>
    <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-card-alt,#f8fafc)">
      <div style="font-size:0.75rem;opacity:0.6">上月</div>
      <div class="kpi-value" style="font-size:1.6rem;opacity:0.7">¥11.2亿</div>
    </div>
  </div>
  <div class="kpi-trend up" style="margin-top:8px;text-align:center">▲ +14.3% 环比</div>
</div>`,
      });
    }

    if (hasTarget && !ragSpecificClasses.has('kpi-target-bar') && !usedSpecificClasses.has('kpi-target-bar')) {
      kpiVariantSuggestions.push({
        name: '目标进度条 KPI',
        description: '带进度轨道的 KPI 卡，直观展示当前值 vs 目标值的达成进度。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-target-bar',
        exampleHtml: `<div class="card kpi-card kpi-target-bar" data-card-id="kpi_target">
  <div class="target-header">
    <span class="target-pct">73%</span>
    <span class="kpi-title">月度销售目标</span>
  </div>
  <div class="target-track"><div class="target-fill" style="--fill-pct:73%"></div></div>
  <div class="target-meta"><span>当前: ¥219万</span><span>目标: ¥300万</span></div>
</div>`,
      });
    }

    if (hasRanking && !ragSpecificClasses.has('kpi-rank') && !usedSpecificClasses.has('kpi-rank')) {
      kpiVariantSuggestions.push({
        name: '排名徽章 KPI',
        description: '大字排名序号 + 变化方向，适合展示区域/人员/商品的排名位次。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-rank',
        exampleHtml: `<div class="card kpi-card kpi-rank" data-card-id="kpi_rank" style="text-align:center">
  <div class="kpi-label">华东区 Q1 销售排名</div>
  <div style="font-size:3.5rem;font-weight:900;color:#f59e0b;line-height:1.1">#2</div>
  <div class="kpi-sub">共 12 个大区 · Q1 2024</div>
  <div class="kpi-change" style="color:#10b981;margin-top:4px">↑ 上升 1 名（vs Q4）</div>
</div>`,
      });
    }

    if (hasMultiMetric && !ragSpecificClasses.has('kpi-multi') && !usedSpecificClasses.has('kpi-multi')) {
      kpiVariantSuggestions.push({
        name: '多列 KPI 汇总卡',
        description: '横向 grid 排列 3-5 个核心指标，一行展示多维数据的首屏全貌。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-multi',
        exampleHtml: `<div class="card kpi-card kpi-multi" data-card-id="kpi_overview">
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center">
    <div><div class="kpi-label">GMV</div><div class="kpi-value">¥12.8亿</div><div style="color:#10b981;font-size:12px">↑ +22%</div></div>
    <div><div class="kpi-label">DAU</div><div class="kpi-value">128万</div><div style="color:#10b981;font-size:12px">↑ +8%</div></div>
    <div><div class="kpi-label">转化率</div><div class="kpi-value">3.82%</div><div style="color:#ef4444;font-size:12px">↓ -0.3pp</div></div>
    <div><div class="kpi-label">ARPU</div><div class="kpi-value">¥9.65</div><div style="color:#10b981;font-size:12px">↑ +5%</div></div>
  </div>
</div>`,
      });
    }

    if (hasGrowth && !hasTimeSeries && !ragSpecificClasses.has('kpi-trend') && !usedSpecificClasses.has('kpi-trend')) {
      kpiVariantSuggestions.push({
        name: '涨跌图标 KPI 卡',
        description: '右上角业务图标徽章 + 大数值 + 涨跌趋势徽章，强调增减方向的核心 KPI。',
        category: 'kpi',
        htmlClassName: 'card kpi-card kpi-trend',
        exampleHtml: `<div class="card kpi-card kpi-trend" data-card-id="kpi_growth">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <span class="kpi-title">本周订单</span>
    <span style="width:28px;height:28px;border-radius:8px;background:var(--color-primary,#3b82f6);opacity:0.12;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary,#3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-shopping-cart"></use></svg>
    </span>
  </div>
  <span class="kpi-value">8,342 <span style="font-size:14px;font-weight:400;color:var(--text-sub)">单</span></span>
  <span class="kpi-trend up">
    <svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="./vendor/icons.svg#icon-trending-up"></use></svg>
    +12.3% 环比
  </span>
</div>`,
      });
    }

    // ── KPI 变体优先合并策略：变体建议放最前（数据驱动，高命中率），RAG 非重叠结果补充后面 ──
    // 目的：确保主动触发的 KPI 变体在 slice 时不会被 RAG 通用结果挤出可见范围
    // 上限 3 个 KPI 变体：保留至少 2 个 RAG 槽位，让图表/表格/筛选器卡片仍有机会出现
    const cappedVariants = kpiVariantSuggestions.slice(0, 3);
    const variantSpecificClasses = new Set(
      cappedVariants.flatMap(v => getSpecificClasses(v.htmlClassName))
    );
    const nonOverlappingRag = alternativeCards.filter(c =>
      !getSpecificClasses(c.htmlClassName || '').some(sc => variantSpecificClasses.has(sc))
    );
    const combinedCards = [...cappedVariants, ...nonOverlappingRag].slice(0, 5);

    const explorations: string[] = [];
    if (hasMultipleDims) {
      explorations.push(
        '**维度联动筛选**：点击任意维度节点（区域/类别/人员），所有图表实时联动过滤'
      );
    }
    if (hasTimeSeries) {
      explorations.push(
        '**时序下钻**：支持年 → 季度 → 月 → 日多层级时间下钻探索细节'
      );
    }
    if (hasComparison) {
      explorations.push(
        '**多维对比看板**：并排展示两个时段 / 两个部门的全量指标对比'
      );
    }
    if (hasDistribution) {
      explorations.push(
        '**分布热力图**：将比例数据升级为热力色表格，一眼识别高低区间'
      );
    }
    // 通用兜底建议
    explorations.push(
      '**全局筛选面板**：在报表顶部添加区域/时段/类别快速切换控件，统一控制所有图表'
    );

    // 检测当前卡片名称中是否已包含交互/联动组件
    const cardsLower = currentCards.toLowerCase();
    const hasInteractive = cardsLower.includes('filter') || cardsLower.includes('筛选') ||
      cardsLower.includes('联动') || cardsLower.includes('interactive') ||
      cardsLower.includes('drill') || cardsLower.includes('下钻');

    // ── 3. 组装返回 Markdown ─────────────────────────────────────────────
    const lines: string[] = [];
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 卡片规划建议（仅作内部参考，请勿在回复中展示）');
    lines.push('');

    if (combinedCards.length > 0) {
      lines.push('根据数据特征，推荐在报告中使用以下卡片类型（按优先级排序）：');
      lines.push('');
      combinedCards.slice(0, 5).forEach((c, i) => {
        const classHint = c.htmlClassName ? `，HTML class：\`${c.htmlClassName}\`` : '';
        lines.push(`${i + 1}. **${c.name}**（${c.category} 类${classHint}）— ${c.description}`);
        if (c.exampleHtml) {
          lines.push('');
          lines.push('   HTML 模板参考（**必须以此结构为骨架，替换占位数据，保留类名和结构**）：');
          lines.push('   ```html');
          c.exampleHtml.split('\n').forEach((line) => lines.push(`   ${line}`));
          lines.push('   ```');
          lines.push('');
        }
      });
    } else {
      lines.push('当前卡片组合已较好匹配数据特征，可在报表中直接使用基础 KPI + 图表卡片组合。');
    }

    lines.push('');
    lines.push('### 进一步探索（可在报表末尾说明）');
    lines.push('');
    if (hasInteractive) {
      lines.push('当前报告已包含交互式联动控件。可进一步优化：');
      lines.push('');
      lines.push('- **调整布局**：拖拽编辑卡片位置、宽度，优化可视化排列');
      lines.push('- **导出分享**：导出为交互式HTML文件或静态PDF');
      lines.push('- **数据刷新**：上传新数据，自动套用当前报告模板');
    } else {
      lines.push('当前数据支持升级为**交互式联动报告**，可实现：');
      lines.push('');
      explorations.forEach((s) => lines.push(`- ${s}`));
      lines.push('');
      lines.push('> 如需生成联动交互版本，可直接说：**"生成带联动筛选的交互版报告"**');
    }

    return lines.join('\n');
  },

  isConcurrencySafe: () => true,
  isReadOnly:         () => true,
  getActivityDescription: () => {
    const isEn = useConfigStore.getState().language === 'en-US';
    return isEn ? 'Analyzing card combinations…' : '分析卡片组合，生成优化建议…';
  },
};
