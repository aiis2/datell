export interface BuiltInRuntimeSources {
  echarts?: string | null;
  apexcharts?: string | null;
  vtable?: string | null;
}

const KNOWN_CDN_SCRIPT_RE = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdn\.bootcdn\.net|cdnjs\.cloudflare\.com|staticfile\.org|echarts\.apache\.org)[^"']*["'][^>]*>\s*<\/script>/gi;
const CDN_REPLACEMENT = '<!-- [export] CDN script replaced by packaged runtime -->';

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

function scriptBlock(source: string | null | undefined): string {
  return source ? `<script>${escapeInlineScript(source)}</script>` : '';
}

function injectBeforeDocumentContent(html: string, block: string): string {
  if (!block) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, (tag) => `${block}\n${tag}`);
  }
  if (/<body\b/i.test(html)) {
    return html.replace(/<body\b/i, (tag) => `${block}\n${tag}`);
  }
  return `${block}\n${html}`;
}

export function needsVTableRuntime(html: string): boolean {
  return /\bVTable\b/i.test(html) || /(?:@visactor\/)?vtable(?:\.min)?\.js/i.test(html);
}

export function inlineBuiltInRuntimes(html: string, sources: BuiltInRuntimeSources): string {
  const includeVTable = needsVTableRuntime(html);
  const withoutCdn = html.replace(KNOWN_CDN_SCRIPT_RE, CDN_REPLACEMENT);
  const runtimeBlock = [
    scriptBlock(sources.echarts),
    scriptBlock(sources.apexcharts),
    includeVTable ? scriptBlock(sources.vtable) : '',
  ].filter(Boolean).join('\n');

  return injectBeforeDocumentContent(withoutCdn, runtimeBlock);
}
