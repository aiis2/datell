import * as XLSX from 'xlsx';
import type { FileAttachment } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useConfigStore } from '../stores/configStore';

/** Get current data parsing limits from config store */
function getParsingLimits() {
  return useConfigStore.getState().dataParsingLimits;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Maximum characters for tabular textContent injected into the LLM context.
 * Prevents context-window overflow for large Excel / CSV files.
 * ~100 K chars ≈ 33 K tokens — safe for most hosted models.
 */
const TABULAR_CONTEXT_CHAR_LIMIT = 100_000;

export async function parseUploadedFile(file: File): Promise<FileAttachment> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return parseImage(file);
  if (['xlsx', 'xls'].includes(ext)) return parseExcel(file);
  if (ext === 'csv') return parseCsv(file);
  if (ext === 'pdf') return parsePdf(file);
  if (ext === 'eml') return parseEml(file);
  return parseText(file);
}

async function parseImage(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: uuidv4(), name: file.name, type: 'image', size: file.size, data: reader.result as string });
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function parseExcel(file: File): Promise<FileAttachment> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const { excelMaxRows } = getParsingLimits();
  const summaries: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
    const headers = (rows[0] || []) as string[];
    const dataRows = rows.slice(1, 1 + excelMaxRows);
    const totalRows = rows.length - 1;

    const headerSection =
      `## Sheet: ${sheetName}\n` +
      `列数: ${headers?.length || 0}, 总行数: ${totalRows}` +
      (totalRows > excelMaxRows ? ` (已截取前 ${excelMaxRows} 行)` : '') + `\n` +
      `列名: ${headers?.join(', ') || '无'}\n\n` +
      `| ${headers?.join(' | ') || ''} |\n` +
      `| ${headers?.map(() => '---').join(' | ') || ''} |`;

    const rowLines: string[] = [];
    let usedChars = headerSection.length;
    let truncatedAt = -1;

    for (let i = 0; i < dataRows.length; i++) {
      const rowStr = `| ${(dataRows[i] as unknown[]).join(' | ')} |`;
      if (usedChars + rowStr.length + 1 > TABULAR_CONTEXT_CHAR_LIMIT) {
        truncatedAt = i;
        break;
      }
      rowLines.push(rowStr);
      usedChars += rowStr.length + 1;
    }

    let content = headerSection + '\n' + rowLines.join('\n');
    if (truncatedAt >= 0) {
      content +=
        `\n\n> ⚠️ 内容截断：已显示前 ${truncatedAt} 行，` +
        `剩余 ${dataRows.length - truncatedAt} 行超出 AI 上下文限制（共 ${totalRows} 行）。` +
        `若需分析全量数据，建议通过"数据源"功能连接数据库，或减少数据行数后重新上传。`;
    }
    summaries.push(content);
  }
  return { id: uuidv4(), name: file.name, type: 'excel', size: file.size, data: '', textContent: summaries.join('\n\n') };
}

async function parseCsv(file: File): Promise<FileAttachment> {
  const text = await file.text();
  const lines = text.trim().split('\n');
  const { csvMaxRows } = getParsingLimits();
  const totalRows = lines.length - 1;
  const truncNote = totalRows > csvMaxRows ? ` (已截取前 ${csvMaxRows} 行)` : '';
  const headerLine = `CSV 文件 (总行数: ${totalRows}${truncNote})\n列名: ${lines[0]}\n\n`;
  const maxDataLines = Math.min(1 + csvMaxRows, lines.length);
  const dataLines: string[] = [];
  let usedChars = headerLine.length;
  let truncatedAt = -1;
  for (let i = 1; i < maxDataLines; i++) {
    if (usedChars + lines[i].length + 1 > TABULAR_CONTEXT_CHAR_LIMIT) {
      truncatedAt = i - 1; // rows included so far (excluding header)
      break;
    }
    dataLines.push(lines[i]);
    usedChars += lines[i].length + 1;
  }
  let textContent = headerLine + dataLines.join('\n');
  if (truncatedAt >= 0) {
    textContent +=
      `\n\n> ⚠️ 内容截断：已显示前 ${truncatedAt} 行，` +
      `剩余 ${totalRows - truncatedAt} 行超出 AI 上下文限制（共 ${totalRows} 行）。` +
      `若需分析全量数据，建议通过"数据源"功能连接数据库，或减少数据行数后重新上传。`;
  }
  return {
    id: uuidv4(), name: file.name, type: 'csv', size: file.size, data: text,
    textContent,
  };
}

/**
 * Parse PDF using pdfjs-dist (Mozilla PDF.js) — pure JS, no native deps.
 */
async function parsePdf(file: File): Promise<FileAttachment> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageTexts: string[] = [];
    const { pdfMaxChars } = getParsingLimits();
    let totalChars = 0;
    let truncated = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (totalChars >= pdfMaxChars) { truncated = true; break; }
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item: unknown) => 'str' in (item as Record<string, unknown>))
        .map((item: unknown) => (item as { str: string }).str)
        .join(' ').replace(/\s+/g, ' ').trim();
      if (pageText) { pageTexts.push(`--- 第 ${i} 页 ---\n${pageText}`); totalChars += pageText.length; }
    }
    const textContent = [
      `[PDF文件: ${file.name}, 共 ${pdf.numPages} 页, 大小: ${(file.size / 1024).toFixed(1)}KB]`,
      truncated ? `（内容已截断，仅显示前 ${pdfMaxChars} 字符）` : '',
      '',
      pageTexts.join('\n\n'),
    ].filter(Boolean).join('\n');
    return { id: uuidv4(), name: file.name, type: 'pdf', size: file.size, data: '', textContent };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: uuidv4(), name: file.name, type: 'pdf', size: file.size, data: '',
      textContent: `[PDF文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB]\nPDF解析失败: ${msg}\n请尝试将PDF转换为文字后重新上传。`,
    };
  }
}

/**
 * Parse EML email file using postal-mime.
 */
async function parseEml(file: File): Promise<FileAttachment> {
  try {
    const PostalMime = (await import('postal-mime')).default;
    const buffer = await file.arrayBuffer();
    const email = await new PostalMime().parse(buffer);
    const fmtAddr = (a: { name?: string; address?: string }) =>
      a.name ? `${a.name} <${a.address}>` : (a.address ?? '');
    const parts: string[] = [
      `[邮件文件: ${file.name}]`,
      `主题: ${email.subject || '(无主题)'}`,
      ...(email.date ? [`日期: ${email.date}`] : []),
      ...(email.from ? [`发件人: ${fmtAddr(email.from)}`] : []),
      ...(email.to?.length ? [`收件人: ${email.to.map(fmtAddr).join(', ')}`] : []),
      ...(email.cc?.length ? [`抄送: ${email.cc.map(fmtAddr).join(', ')}`] : []),
      ...(email.attachments?.length
        ? [`附件: ${email.attachments.map((a: { filename?: string | null }) => a.filename || '(未命名)').join(', ')}`]
        : []),
      '',
      '--- 邮件正文 ---',
    ];
    if (email.text) {
      parts.push(email.text.slice(0, getParsingLimits().textMaxChars));
    } else if (email.html) {
      parts.push(
        email.html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ').trim().slice(0, getParsingLimits().textMaxChars)
      );
    } else {
      parts.push('(邮件正文为空)');
    }
    return { id: uuidv4(), name: file.name, type: 'unknown', size: file.size, data: '', textContent: parts.join('\n') };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: uuidv4(), name: file.name, type: 'unknown', size: file.size, data: '',
      textContent: `[EML邮件文件: ${file.name}]\n解析失败: ${msg}`,
    };
  }
}

async function parseText(file: File): Promise<FileAttachment> {
  const text = await file.text();
  const { textMaxChars } = getParsingLimits();
  return { id: uuidv4(), name: file.name, type: 'unknown', size: file.size, data: text, textContent: text.slice(0, textMaxChars) };
}
