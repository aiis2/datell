import { v4 as uuidv4 } from 'uuid';
import type { AgentToolDefinition, SandboxReport } from '../types';
import { useReportStore } from '../stores/reportStore';

/**
 * Sanitize all inline <script> blocks to prevent </script> in string literals
 * from prematurely closing the script tag.
 */
function sanitizeAllInlineScripts(html: string): string {
  return html.replace(
    /(<script(?:\s+(?!src=)[^>]*)?>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, jsContent, _closeTag) => {
      if (/src\s*=/i.test(openTag)) return _match;
      const safeContent = jsContent.replace(/<\/script/gi, () => '<\\/script');
      return openTag + safeContent + '</script>';
    }
  );
}

export const generateDocumentTool: AgentToolDefinition = {
  name: 'generate_document',
  description:
    '生成专业 HTML 文档（报告/分析文档/说明书）并在预览面板展示。' +
    '当用户要求 Word 文档、分析报告、说明书、总结报告时使用此工具。' +
    '传入完整的 HTML，采用 A4 纸宽度(794px)居中布局，保证打印/PDF导出效果良好。' +
    '禁止使用 emoji；用 ▲/▼ 表示趋势，内联 SVG 表示图标。',
  parameters: [
    {
      name: 'html',
      type: 'string',
      description:
        '完整的文档 HTML。采用 A4 宽度(794px)居中布局，包含标题页、目录、各章节内容。' +
        '可用纯 SVG 绘制简单图表，避免外部 CDN 依赖。',
      required: true,
    },
    { name: 'title', type: 'string', description: '文档标题', required: true },
  ],
  execute: async (args) => {
    const rawHtml = args.html as string;
    const title = (args.title as string) || '分析文档';

    if (!rawHtml || rawHtml.length < 20) {
      return '错误: HTML 内容为空或太短';
    }

    // Sanitize inline scripts
    const html = sanitizeAllInlineScripts(rawHtml);

    const report: SandboxReport = {
      id: uuidv4(),
      title,
      html,
      createdAt: Date.now(),
    };

    useReportStore.getState().addReport(report);

    return `✅ 文档 "${title}" 已生成并在预览面板中展示。可使用右上角按钮导出为 PDF。`;
  },  isConcurrencySafe: () => true,
  getActivityDescription: (args) => {
    const title = String(args.title ?? '文档');
    return `生成文档: ${title}`;
  },};
