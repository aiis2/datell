/**
 * 共享报表 HTML 处理工具函数
 * 被 generateChart.ts 和 generateChartApex.ts 共同引用
 *
 * 文件：src/renderer/utils/reportHtmlUtils.ts
 */

/**
 * 检测 HTML 是否包含联动配置（data-interactions 或 __report_data_context__）
 */
export function hasInteractivityConfig(html: string): boolean {
  return html.includes('data-interactions') || html.includes('__report_data_context__');
}

/**
 * 为导出 HTML 注入联动引擎引用脚本
 * @param html  原始 HTML
 * @param mode  'interactive'（含 DuckDB）| 'static'（仅 engine）
 * @param assetsPrefix  assets 目录相对路径前缀，默认 "./assets"
 */
export function injectInteractivityRuntime(
  html: string,
  mode: 'interactive' | 'static',
  assetsPrefix = './assets'
): string {
  if (!hasInteractivityConfig(html)) return html;

  const scripts = mode === 'interactive'
    ? [
        `<script src="${assetsPrefix}/duckdb/duckdb.js"><\/script>`,
        `<script src="${assetsPrefix}/interactivity-engine.js"><\/script>`,
      ]
    : [
        `<script src="${assetsPrefix}/interactivity-engine.js"><\/script>`,
      ];

  const injection = scripts.join('\n');
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `${injection}\n</head>`);
  }
  return injection + html;
}

/**
 * 将 vendor 脚本从 app:// 协议路径转换为相对路径（用于导出 HTML）
 */
export function adaptVendorPathsForExport(html: string, baseName: string): string {
  return html
    .replace(/app:\/\/localhost\/vendor\//g, `./${baseName}-assets/`)
    .replace(/src=["']\/vendor\//g, `src="./${baseName}-assets/`)
    .replace(/href=["']\/vendor\//g, `href="./${baseName}-assets/`);
}

/**
 * 为 PDF/截图模式注入禁用联动的标记和打印样式
 */
export function buildPrintModeHtml(html: string): string {
  const PRINT_STYLE = `<style>
    .filter-card, .filter-date-range, .filter-dropdown-single,
    .filter-checkbox-group, .filter-radio-group, .filter-search-box,
    .filter-numeric-range, .filter-global-panel, .drill-breadcrumb,
    .filter-active-tags, .filter-tag-pills-container,
    .filter-reset-button, .filter-apply-btn, .drill-up-btn,
    [data-filter-id], [data-filter-type] { display: none !important; }
    .layout-editor-overlay, .edit-mode-toolbar, .edit-controls,
    [data-edit-overlay], [data-layout-editor],
    .report-edit-bar, .card-edit-actions { display: none !important; }
    .tooltip, [class*="tooltip"] { display: none !important; }
    .chart-container { overflow: hidden; }
  </style>`;
  const PRINT_SCRIPT = `<script>
    window.__REPORT_INTERACTION_DISABLED__ = true;
    window.__REPORT_PRINT_MODE__ = true;
  <\/script>`;
  const injection = PRINT_STYLE + '\n' + PRINT_SCRIPT;
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `${injection}\n</head>`);
  }
  return injection + html;
}
