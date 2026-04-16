/**
 * showWidget — Agent tool that injects arbitrary HTML/SVG/CSS into the chat
 * as a sandboxed inline widget. Useful for custom visualizations, forms,
 * or interactive mini-dashboards that go beyond what MiniChart supports.
 *
 * Sentinel format: __WIDGET_HTML__<base64-encoded HTML>
 * MessageBubble renders this as a sandboxed <iframe srcdoc="...">.
 */
import type { AgentToolDefinition } from '../types';

export const showWidgetTool: AgentToolDefinition = {
  name: 'show_widget',
  description:
    '在对话消息内嵌入一段 HTML/SVG/CSS 小组件，并以沙箱 iframe 方式安全渲染。' +
    '适合展示自定义可视化、简单交互表单、SVG 图示等。' +
    '内容会被 Base64 编码后注入 srcdoc，不需要外部 URL。' +
    '提示：尽量使用内联样式，不引用外部资源，以确保沙箱内正常显示。',
  parameters: [
    {
      name: 'html',
      type: 'string',
      description:
        '要渲染的完整 HTML 片段（可以是完整 <html> 文档也可以是片段，会自动用 Bootstrap CSS 包裹）。',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: '组件标题，显示在 iframe 上方（可选）',
      required: false,
    },
    {
      name: 'height',
      type: 'number',
      description: '组件高度（像素），默认 240',
      required: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const html = String(args.html ?? '');
    if (!html.trim()) return '错误: html 参数不能为空';

    const title = args.title ? String(args.title) : undefined;
    const height = typeof args.height === 'number' ? args.height : 240;

    // Wrap bare fragment in a minimal document
    const fullHtml = html.trimStart().startsWith('<!') || html.trimStart().startsWith('<html')
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          *{box-sizing:border-box;margin:0;padding:0;}
          body{font-family:system-ui,sans-serif;font-size:13px;padding:8px;background:transparent;}
        </style></head><body>${html}</body></html>`;

    const encoded = btoa(unescape(encodeURIComponent(fullHtml)));
    const payload = JSON.stringify({ encoded, title, height });
    return `__WIDGET_HTML__${payload}`;
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  getActivityDescription: (args) => {
    const title = String(args.title ?? 'Widget');
    return `生成组件: ${title}`;
  },
};
