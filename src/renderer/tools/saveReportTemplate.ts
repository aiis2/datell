import type { AgentToolDefinition } from '../types';
import { useReportStore } from '../stores/reportStore';
import {
  formatReportInteractivityIssues,
  validateReportInteractivity,
} from '../utils/reportInteractivityValidation';

export interface TemplateInsertOptions {
  sourceWidth?: number;
  sourceHeight?: number;
}

interface TemplateValidationOptions {
  allowFragment?: boolean;
}

function toPositiveNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function aspectRatioStyle(options: TemplateInsertOptions): string {
  const width = toPositiveNumber(options.sourceWidth);
  const height = toPositiveNumber(options.sourceHeight);
  return width && height ? `aspect-ratio: ${width} / ${height};` : '';
}

function stripDocumentShell(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (bodyMatch ? bodyMatch[1] : html).trim();
}

export function wrapAgentTemplateBlock(fragmentHtml: string, options: TemplateInsertOptions = {}): string {
  const fragment = stripDocumentShell(fragmentHtml);
  const ratio = aspectRatioStyle(options);
  const style = ratio ? ` style="${ratio} width: 100%;"` : '';

  return [
    `<section class="agent-generated-template-block"${style}>`,
    fragment,
    '</section>',
  ].join('\n');
}

export function insertTemplateFragment(
  baseTemplateHtml: string,
  fragmentHtml: string,
  options: TemplateInsertOptions = {},
): string {
  if (!baseTemplateHtml.trim()) {
    throw new Error('当前模板 HTML 为空，无法插入截图生成区块');
  }
  if (!fragmentHtml.trim()) {
    throw new Error('待插入模板片段为空');
  }

  const wrapped = wrapAgentTemplateBlock(fragmentHtml, options);
  if (/<\/main\s*>/i.test(baseTemplateHtml)) {
    return baseTemplateHtml.replace(/<\/main\s*>/i, () => `${wrapped}\n</main>`);
  }
  if (/<\/body\s*>/i.test(baseTemplateHtml)) {
    return baseTemplateHtml.replace(/<\/body\s*>/i, () => `${wrapped}\n</body>`);
  }

  throw new Error('当前模板缺少 <main> 或 <body>，无法确定插入位置');
}

function validateInlineScriptSyntax(html: string): string | null {
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;

    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch?.[1]?.toLowerCase();
    if (type && !/(?:javascript|ecmascript|module)/i.test(type)) continue;

    blockIndex++;
    const code = (match[2] || '').trim().replace(/<\\\/script/gi, '</script');
    if (!code) continue;

    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return `第 ${blockIndex} 个 <script> 块存在 JavaScript 语法错误: ${error.message}`;
      }
    }
  }

  return null;
}

export function validateTemplateHtml(
  html: string,
  options: TemplateValidationOptions = {},
): string[] {
  const issues: string[] = [];
  const trimmed = html.trim();
  if (!trimmed) return ['HTML 内容不能为空'];

  if (!options.allowFragment && !/<html[\s>]/i.test(trimmed)) {
    issues.push('完整模板必须包含 <html> 根元素');
  }

  if (/<script[^>]+\bsrc\s*=\s*["'](?:https?:)?\/\//i.test(trimmed)) {
    issues.push('模板不允许引用远程脚本');
  }
  if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(trimmed) || /url\(\s*["']?(?:https?:)?\/\//i.test(trimmed)) {
    issues.push('模板不允许引用远程图片或远程资源');
  }

  const dangerousPatterns = [
    { pattern: /\beval\s*\(/i, label: 'eval()' },
    { pattern: /\bnew\s+Function\s*\(/i, label: 'new Function()' },
    { pattern: /\brequire\s*\(/i, label: 'require()' },
    { pattern: /\bimport\s*\(/i, label: 'import()' },
    { pattern: /\bprocess\./i, label: 'process' },
    { pattern: /\bwindow\.electronAPI\b/i, label: 'window.electronAPI' },
  ];
  for (const { pattern, label } of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      issues.push(`模板包含禁止的危险模式: ${label}`);
    }
  }

  const syntaxError = validateInlineScriptSyntax(trimmed);
  if (syntaxError) issues.push(syntaxError);

  const interactivityIssues = validateReportInteractivity(trimmed)
    .filter((issue) => issue.severity === 'error');
  if (interactivityIssues.length > 0) {
    issues.push(formatReportInteractivityIssues(interactivityIssues));
  }

  return issues;
}

function ensureFullTemplateAspectRatio(html: string, options: TemplateInsertOptions): string {
  const ratio = aspectRatioStyle(options);
  if (!ratio || /aspect-ratio\s*:/i.test(html)) return html;

  const bodyMatch = html.match(/<body[^>]*>/i);
  if (!bodyMatch || !/<\/body\s*>/i.test(html)) return html;

  const openBody = bodyMatch[0];
  const rootOpen = `<section class="agent-generated-template-root" style="${ratio} width: 100%;">`;
  return html
    .replace(openBody, () => `${openBody}\n${rootOpen}`)
    .replace(/<\/body\s*>/i, () => '</section>\n</body>');
}

export const saveReportTemplateTool: AgentToolDefinition = {
  name: 'save_report_template',
  description:
    '保存 AI 生成的报表模板到用户模板库。适用于根据截图仿制模板、生成内置风格模板、或把截图风格区块插入当前选中模板。' +
    'mode=full 时 html 必须是完整 HTML；mode=insert_into_selected 时 html 可以是片段，会追加到当前选中模板的 report-content/main 中。',
  parameters: [
    { name: 'template_name', type: 'string', description: '模板名称', required: true },
    { name: 'template_description', type: 'string', description: '模板描述，说明截图风格、适用场景和布局特点', required: false },
    { name: 'html', type: 'string', description: '完整 HTML 模板或待插入的 HTML 片段', required: true },
    { name: 'mode', type: 'string', description: '保存模式：full 或 insert_into_selected。默认 full', required: false },
    { name: 'source_width', type: 'number', description: '参考截图原始宽度，用于保留比例', required: false },
    { name: 'source_height', type: 'number', description: '参考截图原始高度，用于保留比例', required: false },
    { name: 'select_after_save', type: 'boolean', description: '保存后是否设为当前选中模板，默认 true', required: false },
    { name: 'preview_after_save', type: 'boolean', description: '保存后是否打开预览报表，默认 true', required: false },
  ],
  execute: async (args): Promise<string> => {
    const templateName = String(args.template_name ?? '').trim();
    const templateDescription = args.template_description ? String(args.template_description).trim() : undefined;
    const inputHtml = String(args.html ?? '').trim();
    const mode = args.mode === 'insert_into_selected' ? 'insert_into_selected' : 'full';
    const sourceWidth = toPositiveNumber(args.source_width);
    const sourceHeight = toPositiveNumber(args.source_height);
    const selectAfterSave = args.select_after_save !== false;
    const previewAfterSave = args.preview_after_save !== false;

    if (!templateName) return '错误：template_name 不能为空';
    if (!inputHtml) return '错误：html 不能为空';

    const store = useReportStore.getState();
    let finalHtml = inputHtml;
    const templateMeta: Record<string, unknown> = {
      createdBy: 'agent',
      mode,
      ...(sourceWidth ? { sourceWidth } : {}),
      ...(sourceHeight ? { sourceHeight } : {}),
    };

    if (mode === 'insert_into_selected') {
      const selectedTemplate = store.selectedTemplateId
        ? store.templates.find((template) => template.id === store.selectedTemplateId)
        : undefined;

      if (!selectedTemplate) {
        return '错误：当前未选择参考模板，无法执行 insert_into_selected。请先选择一个模板，或改用 mode=full。';
      }

      const fragmentIssues = validateTemplateHtml(inputHtml, { allowFragment: true });
      if (fragmentIssues.length > 0) {
        return `错误：模板片段校验失败\n\n${fragmentIssues.join('\n')}`;
      }

      try {
        finalHtml = insertTemplateFragment(selectedTemplate.html, inputHtml, { sourceWidth, sourceHeight });
      } catch (error) {
        return `错误：插入当前模板失败 - ${error instanceof Error ? error.message : String(error)}`;
      }

      templateMeta.baseTemplateId = selectedTemplate.id;
      templateMeta.baseTemplateName = selectedTemplate.templateName;
    } else {
      finalHtml = ensureFullTemplateAspectRatio(inputHtml, { sourceWidth, sourceHeight });
    }

    const validationIssues = validateTemplateHtml(finalHtml, { allowFragment: false });
    if (validationIssues.length > 0) {
      return `错误：模板 HTML 校验失败\n\n${validationIssues.join('\n')}`;
    }

    const template = await useReportStore.getState().saveGeneratedTemplate({
      title: templateName,
      html: finalHtml,
      templateName,
      templateDescription,
      templateSource: 'agent',
      templateMeta,
      selectAfterSave,
      previewAfterSave,
    });

    return (
      `✅ 模板 "${template.templateName}" 已保存到用户模板库。\n\n` +
      `- 模板 ID：${template.id}\n` +
      `- 保存模式：${mode}\n` +
      `- 已设为当前模板：${selectAfterSave ? '是' : '否'}\n` +
      `- 已打开预览：${previewAfterSave ? '是' : '否'}`
    );
  },
  isConcurrencySafe: () => false,
  isDestructive: () => true,
  validateInput: (args) => {
    const mode = args.mode === undefined ? 'full' : String(args.mode);
    if (mode !== 'full' && mode !== 'insert_into_selected') {
      return { valid: false, error: 'mode 只能是 full 或 insert_into_selected' };
    }
    return { valid: true };
  },
  getActivityDescription: (args) => {
    const name = String(args.template_name ?? '模板');
    return `保存模板: ${name}`;
  },
};
