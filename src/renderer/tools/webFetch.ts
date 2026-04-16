import type { AgentToolDefinition } from '../types';

export const webFetchTool: AgentToolDefinition = {
  name: 'web_fetch',
  description:
    '通过网络获取指定 URL 的网页内容（纯文本/HTML），适合读取公开数据、文档、API 接口等。' +
    '由主进程代理请求，可绕过浏览器 CORS 限制。' +
    '返回页面的纯文本内容（会自动剥离 HTML 标签，保留可读文字）。',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: '要获取的网页 URL（必须包含 http:// 或 https:// 前缀）',
      required: true,
    },
    {
      name: 'timeout_ms',
      type: 'number',
      description: '超时时间（毫秒），默认 15000（15秒）',
      required: false,
    },
  ],

  execute: async (args: Record<string, unknown>): Promise<string> => {
    const url = String(args.url ?? '').trim();
    const timeoutMs = typeof args.timeout_ms === 'number' ? args.timeout_ms : 15000;

    if (!url) return '错误：URL 不能为空';
    if (!/^https?:\/\//i.test(url)) return '错误：URL 必须以 http:// 或 https:// 开头';

    if (!window.electronAPI?.webFetch) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const html = await resp.text();
        return stripHtml(html).slice(0, 20000);
      } catch (err) {
        return `获取失败（无法使用 electronAPI.webFetch）：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    try {
      const result = await window.electronAPI.webFetch(url, { timeoutMs });
      if (!result.ok) {
        return `获取失败（HTTP ${result.status}）：${result.error ?? '未知错误'}`;
      }
      const text = result.text.includes('<html') || result.text.includes('<body')
        ? stripHtml(result.text)
        : result.text;
      return `[网页内容: ${url}]\n\n${text.slice(0, 20000)}${text.length > 20000 ? '\n\n…（内容已截断）' : ''}`;
    } catch (err) {
      return `获取失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  maxResultSizeChars: 50000,
  getActivityDescription: (args) => {
    try {
      const hostname = new URL(String(args.url ?? '')).hostname;
      return `请求 ${hostname}`;
    } catch {
      return `网络请求: ${String(args.url ?? '').slice(0, 40)}`;
    }
  },
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|tr|th|td|h[1-6]|br|section|article|header|footer|main|nav)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
