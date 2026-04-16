import { v4 as uuidv4 } from 'uuid';
import type { AgentToolDefinition, SandboxReport } from '../types';
import { useReportStore } from '../stores/reportStore';

/**
 * Sanitize all inline <script> blocks to prevent </script> in string literals
 * from prematurely closing the script tag (same fix as generateChart.ts).
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

export const generateSlideTool: AgentToolDefinition = {
  name: 'generate_slide',
  description:
    '生成 HTML 幻灯片演示文稿并在预览面板展示。支持键盘方向键和鼠标点击翻页。' +
    '当用户要求 PPT、演示文稿、幻灯片、Presentation 时使用此工具。' +
    '传入完整的 HTML，其中每张幻灯片用 <section class="slide"> 包裹，宽高 1280x720px。' +
    '需要包含内嵌 JS 翻页逻辑；禁止使用 emoji，可用内联 SVG 图标。',
  parameters: [
    {
      name: 'html',
      type: 'string',
      description:
        '完整的演示文稿 HTML。每张幻灯片用 <section class="slide"> 包裹。' +
        '包含完整 DOCTYPE、<style> 样式块、翻页 <script>。',
      required: true,
    },
    { name: 'title', type: 'string', description: '演示文稿标题', required: true },
  ],
  execute: async (args) => {
    const rawHtml = args.html as string;
    const title = (args.title as string) || '演示文稿';

    if (!rawHtml || rawHtml.length < 20) {
      return '错误: HTML 内容为空或太短';
    }

    // Sanitize inline scripts to prevent </script> literal from breaking the document
    const html = sanitizeAllInlineScripts(rawHtml);

    const report: SandboxReport = {
      id: uuidv4(),
      title,
      html,
      createdAt: Date.now(),
    };

    useReportStore.getState().addReport(report);

    return `✅ 演示文稿 "${title}" 已生成并在预览面板中展示。可使用键盘方向键 ← → 或点击翻页。`;
  },
  isConcurrencySafe: () => true,
  getActivityDescription: (args) => {
    const title = String(args.title ?? '演示文稿');
    return `生成演示文稿: ${title}`;
  },
};
