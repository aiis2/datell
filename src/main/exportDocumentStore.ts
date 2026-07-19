import { randomUUID } from 'crypto';

export const EXPORT_SCHEME = 'export';
export const EXPORT_DOCUMENT_PATH = '/document.html';

// Keep the export document self-contained. Network APIs are denied by both this
// policy and the per-job session request filter; only predeclared report images
// remain eligible for the separate image allowlist.
export const EXPORT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.undraw.co",
  "font-src 'self' data:",
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const UNDRAW_ORIGIN = 'https://cdn.undraw.co';
const UNDRAW_PATH = /^\/illustration\/[A-Za-z0-9._~-]+\.svg$/;

export interface ExportDocumentJob {
  readonly url: string;
  readonly host: string;
  readonly documentPath: string;
  readonly allowedImageUrls: readonly string[];
  handle(requestUrl: string): Response | null;
  isDisposed(): boolean;
  dispose(): void;
}

function normalizeImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== UNDRAW_ORIGIN || url.protocol !== 'https:' || url.username || url.password) {
      return null;
    }
    if (!UNDRAW_PATH.test(url.pathname)) return null;
    if (url.search && !/^\?color=[0-9a-fA-F]{6}$/.test(url.search)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract only the documented unDraw image form before report JavaScript runs.
 * The URL is parsed and constrained again by normalizeImageUrl, so a script
 * cannot expand the allowlist after the job has started.
 */
export function extractExportImageUrls(html: string): string[] {
  const found = new Set<string>();
  const pattern = /https:\/\/cdn\.undraw\.co\/illustration\/[A-Za-z0-9._~/-]+\.svg(?:\?color=[0-9a-fA-F]{6})?/gi;
  for (const match of html.matchAll(pattern)) {
    const normalized = normalizeImageUrl(match[0]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export function createExportDocumentJob(
  html: string,
  imageUrls: readonly string[] = extractExportImageUrls(html),
): ExportDocumentJob {
  const host = `export-${randomUUID()}.localhost`;
  const url = `${EXPORT_SCHEME}://${host}${EXPORT_DOCUMENT_PATH}`;
  const allowedImageUrls = Object.freeze(
    [...new Set(imageUrls.map(normalizeImageUrl).filter((value): value is string => value !== null))],
  );
  let documentHtml: string | null = html;
  let disposed = false;

  return {
    url,
    host,
    documentPath: EXPORT_DOCUMENT_PATH,
    allowedImageUrls,
    handle(requestUrl: string): Response | null {
      if (disposed || requestUrl !== url || documentHtml === null) return null;
      return new Response(documentHtml, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': EXPORT_CSP,
        },
      });
    },
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      documentHtml = null;
    },
  };
}
