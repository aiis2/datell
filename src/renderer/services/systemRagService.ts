/**
 * src/renderer/services/systemRagService.ts
 * 渲染进程 System RAG 服务。
 * 通过 IPC 调用主进程 system-rag:search handler，将结果格式化为 Prompt 片段。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = () => (window as any).electronAPI;

export interface SystemRagResult {
  id: string;
  type: 'card' | 'layout';
  name: string;
  category: string;
  description: string;
  tags: string[];
  htmlClassName?: string;
  exampleHtml?: string;
  cssPath?: string;
  containerClass?: string;
  dataSchema?: Record<string, string>;
  slots?: Record<string, string>;
  useCases?: string[];
}

export interface RetrieveOptions {
  topKCards?: number;
  topKLayouts?: number;
  category?: string;
}

/**
 * 检索与用户请求最相关的卡片和布局。
 * 并发发起两次 IPC 调用，分别查卡片和布局，总耗时等于单次查询时间。
 */
export async function retrieveSystemComponents(
  userRequest: string,
  opts: RetrieveOptions = {}
): Promise<{ cards: SystemRagResult[]; layouts: SystemRagResult[] }> {
  try {
    const [cards, layouts] = await Promise.all([
      api().systemRagSearch(userRequest, {
        type: 'card',
        topK: opts.topKCards ?? 15,
        ...(opts.category ? { category: opts.category } : {}),
      }),
      api().systemRagSearch(userRequest, {
        type: 'layout',
        topK: opts.topKLayouts ?? 5,
        ...(opts.category ? { category: opts.category } : {}),
      }),
    ]);
    return {
      cards: (cards || []) as SystemRagResult[],
      layouts: (layouts || []) as SystemRagResult[],
    };
  } catch (err) {
    // systemRagSearch 不可用时（开发热重载等情况）静默降级
    console.warn('[SystemRAG] retrieveSystemComponents failed, falling back to empty:', err);
    return { cards: [], layouts: [] };
  }
}

/**
 * 将检索结果格式化为注入 Prompt 的描述片段。
 * 只包含 LLM 需要的最精简信息，避免浪费 token。
 */
export function formatSystemComponentsPrompt(
  cards: SystemRagResult[],
  layouts: SystemRagResult[]
): string {
  if (cards.length === 0 && layouts.length === 0) return '';

  // KPI 变体卡片需要附带 exampleHtml 模板（确保 AI 有正确模板可参考，不会退化为基础 kpi-card）
  // 非 KPI 卡片只展示摘要信息以节省 token
  const KPI_VARIANT_CLASSES = new Set([
    'kpi-sparkline', 'kpi-trend', 'kpi-bar-kpi', 'kpi-two-period',
    'kpi-target-bar', 'kpi-rank', 'kpi-multi', 'kpi-single',
    'kpi-comparison-card', 'kpi-segmented',
  ]);

  const cardLines = cards
    .map((c) => {
      const schema = c.dataSchema
        ? Object.keys(c.dataSchema).slice(0, 4).join('/')
        : '';
      const className = c.htmlClassName || '';
      const engineNote = (c as any).engineHint === 'apexcharts'
        ? ' | ⚡ **ApexCharts 卡片**（必须用 generate_chart_apex 工具，颜色用 window.__APEX_PALETTE__，渲染后调用 window.__REPORT_EVENT_BUS__?.registerApex(cardId, chart)）'
        : '';

      const baseLine =
        `- **[${c.id}]** ${c.name}（${c.category}）：${c.description.slice(0, 90)}` +
        (className ? ` | class: \`${className}\`` : '') +
        (schema ? ` | 数据字段: ${schema}` : '') +
        engineNote;

      // 为 KPI 变体卡片附带 exampleHtml（最多前 5 个变体，避免 token 膨胀）
      const specificClasses = className.split(' ').filter((cl: string) => KPI_VARIANT_CLASSES.has(cl));
      if (specificClasses.length > 0 && c.exampleHtml) {
        return baseLine + `\n  模板：\`\`\`html\n  ${c.exampleHtml}\n  \`\`\``;
      }
      return baseLine;
    })
    .join('\n');

  const layoutLines = layouts
    .map((l) => {
      const containerClass = l.containerClass || `layout-${l.id}`;
      return (
        `- **[${l.id}]** ${l.name}（${l.category}）：${l.description.slice(0, 80)}` +
        ` | 容器类: \`${containerClass}\``
      );
    })
    .join('\n');

  const cardSection = cards.length > 0
    ? `### 推荐卡片组件（请从以下卡片类型中按需选用并组合）\n${cardLines}`
    : '';
  const layoutSection = layouts.length > 0
    ? `### 推荐布局（请选择 1 个最匹配的布局）\n${layoutLines}\n\n布局使用方式：在报表容器 class 上追加布局容器类，如 \`class="report-container layout-universal-dashboard-2col"\``
    : '';

  return `## 系统推荐组件（基于当前请求智能检索）

${cardSection}

${layoutSection}

**生成规范提示**：
- 卡片 HTML 结构使用上述推荐卡片的 \`htmlClassName\`（直接作为 class 属性）
- 已在系统中预定义了所有卡片类名对应的 CSS 样式，**禁止写内联 style 或 <style> 标签**
- 如无合适推荐，仍可使用 \`card kpi-card\`、\`card chart-container\`、\`card data-table\` 等基础类名`.trim();
}

/**
 * 预加载索引（在 app 启动时调用，减少首次查询延迟）。
 * 失败时静默忽略。
 */
export async function preloadSystemRagIndex(): Promise<void> {
  try {
    const count = await api().systemRagPreload?.();
    if (count !== undefined) {
      console.log(`[SystemRAG] Index preloaded: ${count} docs`);
    }
  } catch {
    // not critical
  }
}
