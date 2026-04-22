/**
 * validate_report — 报表质量检查工具 (tech-12 D-02)
 * 检查最近生成的报表是否存在常见质量问题并返回结构化问题列表。
 * 目的是让 Agent 在生成报表后立即自动调用该工具，发现问题后尝试修复。
 */
import type { AgentToolDefinition } from '../types';
import { useReportStore } from '../stores/reportStore';
import { validateReportInteractivity } from '../utils/reportInteractivityValidation';

interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

function validateHtml(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // MISSING_HEIGHT: chart containers without explicit height settings
  const chartContainerRe = /class="[^"]*chart[^"]*"/i;
  const hasExplicitHeight = /height\s*:\s*\d+(px|vh|%)/i.test(html);
  if (chartContainerRe.test(html) && !hasExplicitHeight) {
    issues.push({
      code: 'MISSING_HEIGHT',
      severity: 'error',
      message: '图表容器缺少明确的高度设置，可能导致图表不显示或高度为 0',
      suggestion: '为图表容器添加明确的 height（如 height: 400px），或确保 CSS 变量 --chart-height 已定义',
    });
  }

  // EMPTY_DATA: echarts setOption called with empty dataset
  if (/\.setOption\s*\(/.test(html)) {
    const emptySeriesData = /data\s*:\s*\[\s*\]/;
    if (emptySeriesData.test(html)) {
      issues.push({
        code: 'EMPTY_DATA',
        severity: 'warning',
        message: '检测到 ECharts series.data 为空数组，报表可能不显示任何数据',
        suggestion: '检查数据查询结果是否为空，并添加无数据时的友好提示',
      });
    }
  }

  // NO_KPI_CARD: report has no KPI card section (common structural issue)
  const hasKpiCard = /kpi|stat-card|metric|big-number|summary-card/i.test(html);
  const hasChart = /echarts|apexcharts|setOption|ApexCharts/i.test(html);
  if (hasChart && !hasKpiCard) {
    issues.push({
      code: 'NO_KPI_CARD',
      severity: 'info',
      message: '报表包含图表但缺少 KPI 摘要卡片，用户可能难以快速获取关键数字',
      suggestion: '在图表上方添加关键指标卡片（总计、环比、同比等），使用 kpi-card 或 stat-card 样式类',
    });
  }

  // MISSING_TITLE: report body has no h1/h2 level heading
  const hasTitleTag = /<h[12][^>]*>(.+?)<\/h[12]>/i.test(html);
  if (!hasTitleTag) {
    issues.push({
      code: 'MISSING_TITLE',
      severity: 'warning',
      message: '报表缺少 H1/H2 级别标题',
      suggestion: '添加清晰的报表标题（如公司名称 + 报表类型 + 时间段）',
    });
  }

  // INLINE_STYLE_OVERFLOW: detect very wide inline styles that indicate layout issues
  const inlineWidthRe = /style="[^"]*width\s*:\s*(\d+)px[^"]*"/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineWidthRe.exec(html)) !== null) {
    const w = parseInt(m[1], 10);
    if (w > 1400) {
      issues.push({
        code: 'OVERSIZED_WIDTH',
        severity: 'warning',
        message: `检测到固定宽度 ${w}px 的元素，可能超出面板宽度导致横向滚动`,
        suggestion: '改用百分比宽度或 max-width: 100% 以确保响应式显示',
      });
      break; // report once
    }
  }

  for (const issue of validateReportInteractivity(html)) {
    issues.push({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      suggestion: issue.suggestion,
    });
  }

  return issues;
}

export const validateReportTool: AgentToolDefinition = {
  name: 'validate_report',
  description:
    '验证最近生成的报表质量，检查常见问题（缺少高度、空数据、缺少 KPI 卡片、缺少标题、过宽布局）。' +
    '返回问题列表和改进建议。应在 generate_chart / generate_chart_apex 之后调用以确保报表质量。',
  parameters: [
    {
      name: 'report_id',
      type: 'string',
      description: '要验证的报表 ID（可选，省略时验证最新报表）',
      required: false,
    },
  ],
  execute: async (args): Promise<string> => {
    const { reports } = useReportStore.getState();
    if (reports.length === 0) {
      return '❌ 尚未生成任何报表，无法进行验证。';
    }

    const reportId = args.report_id ? String(args.report_id) : null;
    const report = reportId
      ? reports.find((r) => r.id === reportId)
      : reports[reports.length - 1];

    if (!report) {
      return `❌ 未找到报表 ID "${reportId}"。`;
    }

    const issues = validateHtml(report.html);

    if (issues.length === 0) {
      return `✅ 报表 "${report.title}" 验证通过，未发现常见质量问题。`;
    }

    const lines = [`⚠️ 报表 "${report.title}" 发现 ${issues.length} 个问题：\n`];
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`${icon} [${issue.code}] ${issue.message}`);
      lines.push(`   建议：${issue.suggestion}\n`);
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    lines.push(`\n总计：${errorCount} 个错误，${warnCount} 个警告，${issues.length - errorCount - warnCount} 个提示。`);
    if (errorCount > 0) {
      lines.push('ℹ️ 以上质量检查结果仅供参考，无需重新生成报表。可根据需要在下一次报表请求中改进。');
    }

    return lines.join('\n');
  },
  isConcurrencySafe: () => true,
  getActivityDescription: (_args) => '验证报表质量',
};
