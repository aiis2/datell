import { v4 as uuidv4 } from 'uuid';
import type { AgentToolDefinition, SandboxReport } from '../types';
import { useReportStore } from '../stores/reportStore';

/**
 * Sanitize JS content so that '</script>' literals inside the JS don't
 * prematurely close the inline <script> tag when parsed by the browser.
 */
function sanitizeInlineJs(js: string): string {
  return js.replace(/<\/script/gi, () => '<\\/script');
}

/**
 * Sanitize all inline <script> blocks in the LLM-generated HTML.
 */
function sanitizeAllInlineScripts(html: string): string {
  return html.replace(
    /(<script(?:\s+(?!src=)[^>]*)?>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, jsContent, _closeTag) => {
      if (/src\s*=/i.test(openTag)) return _match;
      const safeContent = sanitizeInlineJs(jsContent);
      return openTag + safeContent + '</script>';
    }
  );
}

/**
 * Sanitize spread patterns in inline scripts that may cause Symbol.iterator errors.
 */
function sanitizeSpreadPatterns(html: string): string {
  return html.replace(
    /(<script(?:\s+(?!src=)[^>]*)?>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, jsContent, closeTag) => {
      if (/src\s*=/i.test(openTag)) return _match;
      const patched = jsContent.replace(
        /\[\s*\.\.\.([\w$]+(?:\.[\w$]+)*)\s*\]/g,
        (_m: string, expr: string) => `[...(Array.isArray(${expr}) ? ${expr} : [])]`
      );
      return openTag + patched + closeTag;
    }
  );
}

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
        return `第 ${blockIndex} 个 <script> 块存在 JavaScript 语法错误: ${e.message}。请仔细检查括号/花括号是否完整匹配，VTable 配置对象语法是否正确，然后重新生成完整的正确 HTML 代码。`;
      }
    }
  }
  return null;
}

/**
 * Inject an error-catching overlay script into generated HTML.
 */
function injectErrorHandler(html: string): string {
  const script = `<script>
(function(){
  function _aeShowErr(msg){
    var show=function(){
      var el=document.getElementById('__ae_err');
      if(!el){el=document.createElement('div');el.id='__ae_err';el.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;background:rgba(220,38,38,.95);color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;font-family:monospace;z-index:99999;word-break:break-word;box-shadow:0 4px 16px rgba(0,0,0,.4)';var h=document.createElement('strong');h.textContent='\\u26a0\\ufe0f \\u62a5\\u8868\\u6e32\\u67d3\\u9519\\u8bef';el.appendChild(h);document.body.appendChild(el);}
      var d=document.createElement('div');d.style.marginTop='4px';d.textContent=String(msg);el.appendChild(d);
    };
    document.body?show():document.addEventListener('DOMContentLoaded',show);
    try{window.parent.postMessage({type:'report-error',message:String(msg)},'*');}catch(e){}
  }
  window.addEventListener('error',function(e){
    var tgt=e.target;
    var tag=tgt&&tgt.tagName?tgt.tagName.toUpperCase():'';
    if(tag&&tag!=='SCRIPT')return;
    var msg=e.message||(tgt&&tgt.src?'\\u65e0\\u6cd5\\u52a0\\u8f7d\\u811a\\u672c: '+tgt.src:'\\u672a\\u77e5\\u9519\\u8bef');
    _aeShowErr(msg);
  },true);
  window.addEventListener('unhandledrejection',function(e){_aeShowErr(e.reason&&e.reason.message?e.reason.message:String(e.reason||'Promise rejected'));});
})();
<\/script>`;
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, (m) => m + script);
  if (html.includes('</head>')) return html.replace('</head>', () => script + '</head>');
  return script + html;
}

export const generateTableVtableTool: AgentToolDefinition = {
  name: 'generate_table_vtable',
  description: '生成包含 VTable 多维数据表格的完整 HTML 网页报表并在预览面板展示。适用于大数据量表格（支持虚拟滚动 10万+行）、透视表、树形表、带排序/筛选/冻结列的专业数据表。你必须自己编写完整的 HTML 代码（含 VTable 初始化代码和数据），可与 ECharts 图表混合使用。',
  parameters: [
    { name: 'html', type: 'string', description: '完整的 HTML 页面代码，需要使用 VTable API 初始化表格。表格容器必须有明确的像素高度（如 height:500px）。使用内置主题类名，不要写内联 style（表格容器的 width/height 除外）。', required: true },
    { name: 'title', type: 'string', description: '报表标题', required: true },
    { name: 'theme', type: 'string', description: '可选推荐使用的主题：business | tech | bento | neo-brutalism | editorial | glassmorphism', required: false },
  ],
  execute: async (args) => {
    const rawHtml = args.html as string;
    const title = (args.title as string) || '数据表格';

    if (!rawHtml || rawHtml.length < 20) {
      return '错误: HTML 内容为空或太短';
    }

    let html = sanitizeAllInlineScripts(rawHtml);
    html = sanitizeSpreadPatterns(html);

    // Pre-validate JavaScript syntax to catch LLM-generated code errors early.
    // Return error to agent so it can regenerate rather than creating a broken report.
    const syntaxErr = validateJsSyntax(html);
    if (syntaxErr) {
      return `❌ 生成的 HTML 代码存在 JavaScript 语法错误，报表未创建。\n\n${syntaxErr}\n\n请修正以上错误后重新调用 generate_table_vtable 生成正确的完整代码。常见问题：\n- VTable 配置对象缺少逗号或多了逗号\n- 括号/花括号 { } 未正确配对\n- 箭头函数返回对象时未加括号：应用 item => ({ field: item.x }) 而非 item => { field: item.x }`;
    }

    const report: SandboxReport = {
      id: uuidv4(),
      title,
      html: injectErrorHandler(html),
      createdAt: Date.now(),
    };

    useReportStore.getState().addReport(report);

    return `✅ 表格报表 "${title}" 已生成并在预览面板中展示。用户可以在右侧面板查看多维数据表格。`;
  },
  isConcurrencySafe: () => true,
  getActivityDescription: (args) => {
    const title = String(args.title ?? '表格');
    return `生成表格: ${title}`;
  },
};
