import type { AgentToolDefinition } from '../types';

export const generatePdfTool: AgentToolDefinition = {
  name: 'generate_pdf',
  description: '将 HTML 内容导出为 PDF 文件。传入完整的 HTML 代码，将通过 Electron 渲染并生成 PDF 下载。',
  parameters: [
    { name: 'html', type: 'string', description: '完整的 HTML 页面代码', required: true },
    { name: 'title', type: 'string', description: 'PDF 文件名（不含扩展名）', required: true },
  ],
  execute: async (args) => {
    const html = args.html as string;
    const title = (args.title as string) || 'report';

    if (window.electronAPI?.savePdf) {
      const success = await window.electronAPI.savePdf({ html, title });
      return success
        ? `✅ PDF 文件 "${title}.pdf" 已生成并保存`
        : '❌ PDF 生成失败或用户取消了保存';
    }

    // Fallback: open in new window for browser printing
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        win.print();
        URL.revokeObjectURL(url);
      };
    }
    return `✅ 已打开 PDF 预览窗口，请使用浏览器打印功能保存为 PDF`;
  },
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  getActivityDescription: () => '生成 PDF 预览...',
};
