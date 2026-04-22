import { v4 as uuidv4 } from 'uuid';
import type { AgentToolDefinition, SandboxReport } from '../types';
import { useReportStore } from '../stores/reportStore';
import { useConfigStore } from '../stores/configStore';
import {
  hasInteractivityConfig as _hasInteractivityConfig,
  injectInteractivityRuntime as _injectInteractivityRuntime,
  adaptVendorPathsForExport as _adaptVendorPathsForExport,
} from '../utils/reportHtmlUtils';
import {
  formatReportInteractivityIssues,
  validateReportInteractivity,
} from '../utils/reportInteractivityValidation';

/** CDN mirrors used as fallback for exported standalone HTML (shell-rendered view uses local vendor) */
const ECHARTS_CDN_MIRRORS = [
  'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js',
  'https://unpkg.com/echarts@5/dist/echarts.min.js',
  'https://cdn.bootcdn.net/ajax/libs/echarts/5.4.3/echarts.min.js',
];

/**
 * Pre-validate JavaScript syntax in all inline <script> blocks.
 * Returns a human-readable error string if a SyntaxError is found, otherwise null.
 */
function validateJsSyntax(html: string): string | null {
  const scriptRegex = /<script(?!\s+src\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let blockIndex = 0;
  while ((match = scriptRegex.exec(html)) !== null) {
    blockIndex++;
    const code = match[1].trim();
    if (!code) continue;
    // Normalise escaped </script> sequences that sanitisation may have inserted
    const normalised = code.replace(/<\\\/script/gi, '</script');
    try {
      // eslint-disable-next-line no-new-func
      new Function(normalised);
    } catch (e) {
      if (e instanceof SyntaxError) {
        return `第 ${blockIndex} 个 <script> 块存在 JavaScript 语法错误: ${e.message}。请仔细检查括号/花括号是否正确配对，对象/数组语法是否正确，然后重新生成完整的正确 HTML 代码。`;
      }
    }
  }
  return null;
}

/**
 * Inject an error-catching overlay script into generated HTML.
 * CDN fallback is no longer needed: report-shell.html pre-loads vendor
 * libraries and transfers them to inner frame via same-origin cross-frame ref.
 */
function injectErrorHandler(html: string): string {
  const script = `<script>
(function(){
  function _aeShowErr(msg){
    var show=function(){
      var el=document.getElementById('__ae_err');
      if(!el){el=document.createElement('div');el.id='__ae_err';el.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;background:rgba(220,38,38,.95);color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;font-family:monospace;z-index:99999;word-break:break-word;box-shadow:0 4px 16px rgba(0,0,0,.4)';var h=document.createElement('strong');h.textContent='\u26a0\ufe0f \u62a5\u8868\u6e32\u67d3\u9519\u8bef';el.appendChild(h);document.body.appendChild(el);}
      var d=document.createElement('div');d.style.marginTop='4px';d.textContent=String(msg);el.appendChild(d);
    };
    document.body?show():document.addEventListener('DOMContentLoaded',show);
    try{window.parent.postMessage({type:'report-error',message:String(msg)},'*');}catch(e){}
  }
  window.addEventListener('error',function(e){
    // Only report genuine JS errors or <script> load failures; ignore img/link/source/etc.
    var tgt=e.target;
    var tag=tgt&&tgt.tagName?tgt.tagName.toUpperCase():'';
    if(tag&&tag!=='SCRIPT')return;
    var msg=e.message||(tgt&&tgt.src?'\u65e0\u6cd5\u52a0\u8f7d\u811a\u672c: '+tgt.src:'\u672a\u77e5\u9519\u8bef');
    _aeShowErr(msg);
  },true);
  window.addEventListener('unhandledrejection',function(e){_aeShowErr(e.reason&&e.reason.message?e.reason.message:String(e.reason||'Promise rejected'));});
})();
<\/script>`;
  // CRITICAL: use function callbacks to prevent $ in script/html being treated as replacement patterns
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, (m) => m + script);
  if (html.includes('</head>')) return html.replace('</head>', () => script + '</head>');
  return script + html;
}

/**
 * Sanitize JS content so that '</script>' literals inside the JS don't
 * prematurely close the inline <script> tag when parsed by the browser.
 * IMPORTANT: replacement must be '<\\/script' so the OUTPUT string is '<\/script>'
 */
function sanitizeInlineJs(js: string): string {
  // Use function form so $ chars in js are NOT treated as special replacement patterns.
  // Replacement value '<\\/script' at runtime produces '<\/script' in HTML output.
  // The backslash makes the HTML parser treat it as text, not as a closing </script> tag.
  return js.replace(/<\/script/gi, () => '<\\/script');
}

/**
 * Sanitize all inline <script> blocks in the LLM-generated HTML.
 * Problem: LLM may generate JS code where string literals or comments contain
 * '</script>' — this causes the browser to prematurely close the script tag,
 * making the rest of the JS appear as raw text in the rendered page.
 * Solution: Replace '</script>' with '<\/script>' inside every inline <script> block.
 * This is safe because browsers treat '<\/script>' as a valid script-closing sequence.
 */
function sanitizeAllInlineScripts(html: string): string {
  // Match each <script> block that has NO src attribute (inline scripts only)
  // and sanitize any </script occurrences within the JS content.
  return html.replace(
    /(<script(?:\s+(?!src=)[^>]*)?>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, jsContent, _closeTag) => {
      // Only process if the opening tag has no src attribute (inline script)
      if (/src\s*=/i.test(openTag)) return _match;
      // Sanitize </script in the JS content using function callback pattern
      const safeContent = jsContent.replace(/<\/script/gi, () => '<\\/script');
      return openTag + safeContent + '</script>';
    }
  );
}

/**
 * Sanitize spread patterns in inline scripts that may cause Symbol.iterator errors.
 *
 * Problem: LLM generates code like `[...someVariable]` where someVariable may be
 * a plain object (not iterable), causing "Invalid attempt to spread non-iterable
 * instance" at runtime. We wrap such patterns with Array.isArray guards.
 *
 * Only processes inline <script> blocks (no src attribute), leaving CDN scripts intact.
 */
function sanitizeSpreadPatterns(html: string): string {
  return html.replace(
    /(<script(?:\s+(?!src=)[^>]*)?>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, jsContent, closeTag) => {
      if (/src\s*=/i.test(openTag)) return _match; // skip external scripts
      // Replace [...identifier] with [...(Array.isArray(identifier) ? identifier : [])]
      // Matches spread of simple identifiers, property chains, and array literals
      const patched = jsContent.replace(
        /\[\s*\.\.\.([\w$]+(?:\.[\w$]+)*)\s*\]/g,
        (_m: string, expr: string) => `[...(Array.isArray(${expr}) ? ${expr} : [])]`
      );
      return openTag + patched + closeTag;
    }
  );
}

/**
 * Inject replacement HTML fragment in place of the CDN script tag.
 * CRITICAL: Use () => replacement function form in String.replace() calls.
 * Vendor JS files (echarts, apexcharts) contain '$1', '$&' etc. as string
 * literals for their internal regex operations. If passed directly as a
 * replacement string to String.replace(), JS misinterprets them as capture-
 * group references, mangling the output and causing the iframe to display
 * raw JS code instead of rendering the chart.
 */
function replaceCdnTag(html: string, replacement: string, cdnPattern: RegExp): string {
  // Use () => replacement so JS does NOT interpret $ sequences in replacement
  const replaced = html.replace(cdnPattern, () => replacement);
  if (replaced !== html) return replaced;
  // Fallback: inject before </head>
  if (html.includes('</head>')) return html.replace('</head>', () => replacement + '</head>');
  // Fallback: inject before <body>
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, (_m, g1) => replacement + g1);
  // Last resort: prepend to document
  return replacement + html;
}

/** Replace CDN <script src> tag with inlined local vendor JS */
function replaceCdnWithLocal(html: string, localJs: string, cdnPattern: RegExp): string {
  // sanitizeInlineJs guards against </script> in the vendor JS (function form prevents $ misinterpretation)
  const safeJs = sanitizeInlineJs(localJs);
  // Note: closing </script> uses \/ so it won't prematurely end the tag during HTML parsing
  return replaceCdnTag(html, '<script>' + safeJs + '<\/script>', cdnPattern);
}

/** When local vendor load fails, inject a multi-CDN sequential cascade */
function replaceCdnWithCascade(html: string, cdnUrls: string[], cdnPattern: RegExp): string {
  const urlsJson = JSON.stringify(cdnUrls);
  const cascadeScript = `<script>(function(){var u=${urlsJson},i=0,d=document;function n(){if(i>=u.length)return;var s=d.createElement('script');s.src=u[i++];s.onerror=n;(d.head||d.documentElement).appendChild(s);}n();})();<\/script>`;
  return replaceCdnTag(html, cascadeScript, cdnPattern);
}

/** Module-level cache for vendor JS content */
let _echartsJs: string | null = null;

async function getEchartsJs(): Promise<string | null> {
  if (_echartsJs !== null) return _echartsJs;
  try {
    // In Electron production, use IPC to bypass ASAR fetch limitations
    const api = (window as any).electronAPI;
    if (api?.readVendorFile) {
      const content = await api.readVendorFile('echarts.min.js') as string | null;
      if (content) { _echartsJs = content; return _echartsJs; }
    }
    // Fallback: fetch works in Vite dev server
    const resp = await fetch('./vendor/echarts.min.js');
    if (resp.ok) { _echartsJs = await resp.text(); return _echartsJs; }
  } catch { /* fall through to CDN cascade */ }
  return null;
}

/**
 * 检测 HTML 是否包含联动配置（data-interactions 或 DataContext）
 * 代理到 reportHtmlUtils.ts 的共享实现
 */
export const hasInteractivityConfig = _hasInteractivityConfig;

/**
 * 为导出 HTML 注入联动引擎引用脚本
 * 代理到 reportHtmlUtils.ts 的共享实现
 */
export function injectInteractivityRuntime(html: string, mode: 'interactive' | 'static'): string {
  return _injectInteractivityRuntime(html, mode, './assets');
}

/**
 * 将 app:// vendor 路径替换为相对路径，用于独立 HTML 导出
 * 代理到 reportHtmlUtils.ts 的共享实现
 */
export const adaptVendorPathsForExport = _adaptVendorPathsForExport;

export const generateChartTool: AgentToolDefinition = {
  name: 'generate_chart',
  description: '生成一个包含 ECharts 交互式图表的完整 HTML 网页报表并在预览面板展示。你必须自己编写完整的 HTML 代码传入此工具（包含 ECharts CDN、图表初始化代码和真实数据）。当用户上传图片/文件后要求生成报表时，立即调用此工具，不要等待确认。',
  parameters: [
    { name: 'html', type: 'string', description: '完整的 HTML 页面代码，需要使用内置主题类名，不要写内联style', required: true },
    { name: 'title', type: 'string', description: '报表标题', required: true },
    { name: 'theme', type: 'string', description: '可选推荐使用的主题：business | tech | bento | neo-brutalism | editorial | glassmorphism', required: false },
  ],
  execute: async (args) => {
    const rawHtml = args.html as string;
    const title = (args.title as string) || '可视化报表';
    const themeHint = (args.theme as string) || '';

    if (!rawHtml || rawHtml.length < 20) {
      return '错误: HTML 内容为空或太短';
    }

    // ARCHITECTURE FIX: Sanitize all inline <script> blocks in LLM-generated HTML first.
    // The LLM may generate JS code where string literals contain '</script>', which causes
    // the browser to prematurely terminate the script tag and display raw JS as text.
    let html = sanitizeAllInlineScripts(rawHtml);
    // SAFETY FIX: Guard against spread of non-iterable objects that cause Symbol.iterator errors
    html = sanitizeSpreadPatterns(html);

    // PRE-VALIDATE JavaScript syntax to catch LLM-generated code errors early.
    // Return error to agent so it can regenerate rather than creating a broken report.
    const syntaxErr = validateJsSyntax(html);
    if (syntaxErr) {
      return `❌ 生成的 HTML 代码存在 JavaScript 语法错误，报表未创建。\n\n${syntaxErr}\n\n请修正以上错误后重新调用 generate_chart 生成正确的完整代码。常见问题：\n- 对象/数组缺少逗号或多了逗号\n- 括号/花括号 { } 未正确配对\n- 箭头函数语法错误\n- 字符串未正确闭合`;
    }

    const interactivityIssues = validateReportInteractivity(html)
      .filter((issue) => issue.severity === 'error');
    if (interactivityIssues.length > 0) {
      return `❌ 生成的 HTML 缺少完整的筛选或联动实现，报表未创建。\n\n${formatReportInteractivityIssues(interactivityIssues)}\n\n请补齐筛选控件到图表更新的完整路径，或为图表补齐 data-interactions 规则后重新调用 generate_chart。`;
    }

    // NOTE: Do NOT inline vendor JS here. report-shell.html pre-loads ECharts locally and
    // transfers it to the inner frame via same-origin parent.echarts reference.
    // Inlining vendor JS causes Webpack dynamic-chunk loading errors under app:// protocol
    // (ECharts tries to fetch app://localhost/'+s+' which fails).
    // CDN script tags are left in the HTML so exported standalone files still work;
    // the shell strips them before srcdoc injection.
    const processedHtml = html;

    const report: SandboxReport = {
      id: uuidv4(),
      title,
      html: injectErrorHandler(processedHtml),
      createdAt: Date.now(),
    };

    // Store report and open preview
    useReportStore.getState().addReport(report);

    return `✅ 报表 "${title}" 已生成并在预览面板中展示。用户可以在右侧面板查看交互式报表。`;
  },
  isConcurrencySafe: () => true,
  getActivityDescription: (args) => {
    const title = String(args.title ?? '图表');
    return `生成图表: ${title}`;
  },
};
