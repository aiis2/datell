import type { AgentToolDefinition } from '../types';
import { useConfigStore } from '../stores/configStore';

/**
 * check_data_quality — 数据质量检查工具 (Tech-12 Task-3)
 *
 * 在生成报表前对原始数据执行结构化质量检查，输出问题清单。
 * AI 应在所有 data_analysis 或 query_database 调用之后、generate_chart 之前调用此工具。
 * 如发现 error 级别问题，AI 必须在报告中注明并酌情调整分析逻辑。
 */

interface QualityIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  column?: string;
  message: string;
  suggestion: string;
}

interface QualityReport {
  passed: boolean;
  rowCount: number;
  columnCount: number;
  issues: QualityIssue[];
  summary: string;
}

function detectDataType(values: unknown[]): 'numeric' | 'date' | 'string' | 'mixed' | 'empty' {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'empty';

  let numericCount = 0;
  let dateCount = 0;
  const dateRe = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;

  for (const v of nonNull) {
    const s = String(v).trim();
    if (s !== '' && !isNaN(Number(s.replace(/[,￥$%]/g, '')))) {
      numericCount++;
    } else if (dateRe.test(s)) {
      dateCount++;
    }
  }

  const total = nonNull.length;
  if (numericCount / total > 0.8) return 'numeric';
  if (dateCount / total > 0.8) return 'date';
  if (numericCount / total < 0.2 && dateCount / total < 0.2) return 'string';
  return 'mixed';
}

function parseValue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[,￥$%]/g, '').trim());
  return isNaN(n) ? null : n;
}

function checkColumn(
  colName: string,
  values: unknown[],
  issues: QualityIssue[],
  isEn: boolean
): void {
  const tr = (zh: string, en: string) => isEn ? en : zh;
  const total = values.length;
  if (total === 0) return;

  // -- Null / missing check
  const nullCount = values.filter((v) => v === null || v === undefined || v === '' || v === 'null' || v === 'NULL' || v === 'N/A').length;
  const nullRatio = nullCount / total;
  if (nullRatio > 0.5) {
    issues.push({
      severity: 'error',
      code: 'HIGH_NULL_RATIO',
      column: colName,
      message: tr(
        `列 "${colName}" 中 ${(nullRatio * 100).toFixed(1)}% 的值为空 (${nullCount}/${total} 行)，数据严重不完整`,
        `Column "${colName}" has ${(nullRatio * 100).toFixed(1)}% missing values (${nullCount}/${total} rows) — severely incomplete`
      ),
      suggestion: tr('核实数据来源，考虑用均值/中位数填充或排除此列', 'Verify data source; consider filling with mean/median or excluding this column'),
    });
  } else if (nullRatio > 0.1) {
    issues.push({
      severity: 'warning',
      code: 'MODERATE_NULL_RATIO',
      column: colName,
      message: tr(
        `列 "${colName}" 有 ${nullCount} 个空值 (${(nullRatio * 100).toFixed(1)}%)`,
        `Column "${colName}" has ${nullCount} missing value(s) (${(nullRatio * 100).toFixed(1)}%)`
      ),
      suggestion: tr('分析结果时注意缺失值影响，避免直接计算总量对比', 'Account for missing values in analysis; avoid direct total comparisons'),
    });
  }

  const dtype = detectDataType(values);

  if (dtype === 'numeric') {
    const nums = values.map(parseValue).filter((n): n is number => n !== null);
    if (nums.length < 2) return;

    // Outlier detection (IQR method)
    const sorted = [...nums].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerFence = q1 - 3 * iqr;
    const upperFence = q3 + 3 * iqr;
    const outliers = nums.filter((n) => n < lowerFence || n > upperFence);
    if (outliers.length > 0 && iqr > 0) {
      issues.push({
        severity: 'warning',
        code: 'OUTLIER_DETECTED',
        column: colName,
        message: tr(
          `列 "${colName}" 检测到 ${outliers.length} 个极端异常值 (IQR×3 边界: [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}])，最大值 ${sorted[sorted.length - 1]}，最小值 ${sorted[0]}`,
          `Column "${colName}" has ${outliers.length} extreme outlier(s) (IQR×3 bounds: [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}]), max ${sorted[sorted.length - 1]}, min ${sorted[0]}`
        ),
        suggestion: tr('确认异常值是否为数据录入错误，考虑在报表中单独标注或使用中位数替代均值', 'Verify if outliers are data-entry errors; consider flagging them or using median instead of mean'),
      });
    }

    // All-zero / constant column
    const uniqueVals = new Set(nums);
    if (uniqueVals.size === 1) {
      const val = [...uniqueVals][0];
      issues.push({
        severity: val === 0 ? 'error' : 'warning',
        code: 'CONSTANT_COLUMN',
        column: colName,
        message: tr(
          `列 "${colName}" 所有值均为 ${val}，无变化`,
          `Column "${colName}" has constant value ${val} — no variation`
        ),
        suggestion: val === 0
          ? tr('此列数据可能未正确加载或字段映射错误', 'This column may not have loaded correctly or has a field-mapping error')
          : tr('恒定列不提供对比价值，考虑是否需要包含在报表中', 'Constant columns add no comparative value; consider excluding from the report'),
      });
    }

    // Negative values in columns that typically shouldn't have them
    const negKeywords = ['收入', '销售', '金额', '数量', '库存', 'revenue', 'sales', 'amount', 'qty', 'quantity', 'count', 'stock'];
    const colLower = colName.toLowerCase();
    const hasNegKeyword = negKeywords.some((kw) => colLower.includes(kw));
    if (hasNegKeyword && nums.some((n) => n < 0)) {
      const negCount = nums.filter((n) => n < 0).length;
      issues.push({
        severity: 'warning',
        code: 'UNEXPECTED_NEGATIVE',
        column: colName,
        message: tr(
          `列 "${colName}" 包含 ${negCount} 个负值，对于此类业务指标可能不合理`,
          `Column "${colName}" contains ${negCount} negative value(s) — potentially invalid for this metric`
        ),
        suggestion: tr('确认负值是否为退货/调整记录，如非业务意图请检查数据来源', 'Verify if negative values represent returns/adjustments; otherwise check data source'),
      });
    }
  }

  if (dtype === 'mixed') {
    issues.push({
      severity: 'warning',
      code: 'MIXED_DATA_TYPE',
      column: colName,
      message: tr(
        `列 "${colName}" 包含混合数据类型（数字与文本混合）`,
        `Column "${colName}" contains mixed data types (numbers and text)`
      ),
      suggestion: tr('数值计算前需先过滤或统一转换数据类型，否则统计结果可能不准确', 'Filter or convert data types before numeric operations to avoid inaccurate statistics'),
    });
  }
}

function checkDuplicates(rows: unknown[][], issues: QualityIssue[], isEn: boolean): void {
  const tr = (zh: string, en: string) => isEn ? en : zh;
  if (rows.length < 2) return;
  const seen = new Set<string>();
  let dupCount = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) dupCount++;
    else seen.add(key);
  }
  if (dupCount > 0) {
    const ratio = dupCount / rows.length;
    issues.push({
      severity: ratio > 0.1 ? 'error' : 'warning',
      code: 'DUPLICATE_ROWS',
      message: tr(
        `发现 ${dupCount} 行完全重复的数据 (${(ratio * 100).toFixed(1)}%)`,
        `Found ${dupCount} fully duplicate row(s) (${(ratio * 100).toFixed(1)}%)`
      ),
      suggestion: tr('重复数据会导致求和/计数指标虚高，建议在分析前去重', 'Duplicate rows inflate sum/count metrics — deduplicate before analysis'),
    });
  }
}

export const checkDataQualityTool: AgentToolDefinition = {
  name: 'check_data_quality',
  description:
    '在生成报表之前，对原始数据执行结构化质量检查。' +
    '检查项包括：缺失值比例、异常值（IQR法）、重复行、混合数据类型、全零列、负值异常等。' +
    '返回质量报告（passed 标志 + 问题清单）。' +
    '当 passed=false 或有 error 级别问题时，AI 必须在报表中注明数据质量风险，并酌情修正分析逻辑（如改用中位数、排除异常行、备注说明）。' +
    '调用时机：用户上传数据文件 / query_database 取数之后、generate_chart 之前调用。',
  parameters: [
    {
      name: 'data',
      type: 'string',
      description:
        '需要检查的表格数据。支持三种格式：' +
        '1) 对象数组: [{"日期":"2024-01","销售额":1200}, ...]（推荐：字段名作为列名） ' +
        '2) 二维数组（首行为列名）: [["日期","销售额"],[\"2024-01\",1200], ...] ' +
        '3) 简单数值数组（单列）: [1200, 980, 1500, ...]',
      required: true,
    },
    {
      name: 'context',
      type: 'string',
      description: '数据业务背景简述，例如"月度销售数据，包含12个月"，帮助检查器理解数值合理范围，可选',
      required: false,
    },
  ],

  execute: async (args: Record<string, unknown>): Promise<string> => {
    const isEn = useConfigStore.getState().language === 'en-US';
    const tr = (zh: string, en: string) => isEn ? en : zh;
    const rawData = args.data;
    if (!rawData) return tr('错误: 缺少 data 参数', 'Error: missing data parameter');

    let parsed: unknown;
    try {
      parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
      return tr('错误: data 参数不是合法的 JSON 格式，请传入 JSON 数组', 'Error: data is not valid JSON — please pass a JSON array');
    }

    const issues: QualityIssue[] = [];
    let rows: unknown[][] = [];
    let columns: string[] = [];

    // -- Normalize input to rows + columns
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return JSON.stringify({ passed: false, rowCount: 0, columnCount: 0, issues: [
          {
            severity: 'error',
            code: 'EMPTY_DATA',
            message: tr('数据为空数组', 'Data array is empty'),
            suggestion: tr('确认数据文件是否正确加载', 'Verify that the data file loaded correctly'),
          }
        ], summary: tr('数据为空，无法分析', 'Data is empty — unable to analyze') } as QualityReport);
      }

      const first = parsed[0];

      if (typeof first === 'number' || (typeof first === 'string' && !isNaN(Number(first)))) {
        // Simple numeric array — single column
        columns = [tr('数值', 'Value')];
        rows = (parsed as unknown[]).map((v) => [v]);
      } else if (Array.isArray(first)) {
        // 2D array
        if (first.every((v) => typeof v === 'string')) {
          // First row is header
          columns = first as string[];
          rows = (parsed as unknown[][]).slice(1);
        } else {
          columns = (first as unknown[]).map((_, i) => isEn ? `col${i + 1}` : `列${i + 1}`);
          rows = parsed as unknown[][];
        }
      } else if (typeof first === 'object' && first !== null) {
        // Array of objects
        columns = Object.keys(first as object);
        rows = (parsed as Record<string, unknown>[]).map((obj) => columns.map((c) => obj[c]));
      } else {
        columns = [tr('数值', 'Value')];
        rows = (parsed as unknown[]).map((v) => [v]);
      }
    } else {
      return tr('错误: data 必须是 JSON 数组', 'Error: data must be a JSON array');
    }

    const rowCount = rows.length;
    const columnCount = columns.length;

    // -- Row count check
    if (rowCount < 3) {
      issues.push({
        severity: 'warning',
        code: 'SMALL_SAMPLE',
        message: tr(`数据仅有 ${rowCount} 行，样本量过小`, `Dataset has only ${rowCount} row(s) — sample size too small`),
        suggestion: tr('样本量过小时统计规律可靠性较低，建议在报表中注明数据量', 'Statistical patterns are unreliable with very small samples; note the data size in the report'),
      });
    }

    // -- Check duplicates on full rows
    checkDuplicates(rows, issues, isEn);

    // -- Per-column checks
    for (let ci = 0; ci < columns.length; ci++) {
      const colVals = rows.map((r) => r[ci]);
      checkColumn(columns[ci], colVals, issues, isEn);
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    const passed = errorCount === 0;

    let summary: string;
    if (issues.length === 0) {
      summary = tr(
        `数据质量良好：${rowCount} 行 × ${columnCount} 列，未发现异常问题。`,
        `Data quality looks good: ${rowCount} rows × ${columnCount} columns, no issues found.`
      );
    } else {
      summary = tr(
        `数据质量检查完成：${rowCount} 行 × ${columnCount} 列，发现 ${errorCount} 个错误、${warnCount} 个警告。${
          passed ? '无严重错误，可生成报表，但请注意以下警告。' : '存在严重错误，生成报表前建议修正数据或在报表中注明风险。'
        }`,
        `Data quality check complete: ${rowCount} rows × ${columnCount} columns, ${errorCount} error(s) and ${warnCount} warning(s) found. ${
          passed ? 'No critical errors — report can be generated, but review the warnings.' : 'Critical errors detected — fix the data or note the risks before generating the report.'
        }`
      );
    }

    const report: QualityReport = { passed, rowCount, columnCount, issues, summary };
    return JSON.stringify(report);
  },

  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  getActivityDescription: (args) => {
    const isEn = useConfigStore.getState().language === 'en-US';
    const ctx = args.context ? String(args.context).slice(0, 30) : '';
    return ctx
      ? (isEn ? `Check data quality: ${ctx}` : `检查数据质量: ${ctx}`)
      : (isEn ? 'Check data quality' : '检查数据质量');
  },
};
