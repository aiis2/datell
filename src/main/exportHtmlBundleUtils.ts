import fs from 'fs';
import path from 'path';

export interface ExportPalette {
  primary: string;
  colors: string[];
  bodyBg: string;
  cardBg: string;
  textColor: string;
  subTextColor?: string;
  isDark: boolean;
}

const FILTER_RUNTIME_MARKERS = [
  /data-filter-id\s*=/i,
  /data-filter-field\s*=/i,
  /\bzone-filter\b/i,
  /__FILTER_STATE__/,
  /['"]filterChange['"]/,
];

const INTERACTIVITY_ENGINE_MARKERS = [
  /data-interactions\s*=/i,
  /"action"\s*:\s*"drill_(?:down|up)"/i,
  /data-sql\s*=/i,
  /drillPaths\s*:/i,
  /drill-breadcrumb/i,
  /drill-up-btn/i,
  /__report_data_context__/,
  /__REPORT_EVENT_BUS__/,
  /\bregisterApex\s*\(/,
];

const THEME_ID_MAPPING: Record<string, string> = {
  classic: 'business',
  business: 'business',
  tech: 'tech',
  bento: 'bento',
  'neo-brutalism': 'neo-brutalism',
  editorial: 'editorial',
  glassmorphism: 'glassmorphism',
  base: 'base',
};

export function findExistingProbePath(candidates: string[], probeRelativePath: string): string | undefined {
  for (const candidate of candidates) {
    try {
      fs.accessSync(path.join(candidate, probeRelativePath));
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return undefined;
}

export function hasFilterControlsRuntime(html: string): boolean {
  return /<script[^>]+src=["'][^"']*filter-controls\.js[^"']*["'][^>]*><\/script>/i.test(html);
}

export function needsFilterControlsRuntime(html: string): boolean {
  return FILTER_RUNTIME_MARKERS.some((pattern) => pattern.test(html));
}

export function needsInteractivityEngineRuntime(html: string): boolean {
  return INTERACTIVITY_ENGINE_MARKERS.some((pattern) => pattern.test(html));
}

export function injectFilterControlsRuntime(html: string, baseName: string): string {
  if (!needsFilterControlsRuntime(html) || hasFilterControlsRuntime(html)) {
    return html;
  }

  const script = `<script src="./${baseName}-assets/filter-controls.js"><\/script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', () => `${script}\n</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, (_match, openTag) => `${script}\n${openTag}`);
  }
  return `${script}\n${html}`;
}

function resolveExportThemeId(themeId?: string): string {
  if (!themeId || themeId === 'auto') return 'business';
  return THEME_ID_MAPPING[themeId] || 'business';
}

function sanitizeLayoutId(layoutId?: string): string | undefined {
  if (!layoutId || layoutId === 'default') return undefined;
  return layoutId.replace(/[^a-zA-Z0-9\-_./]/g, '');
}

export function buildStandaloneThemeLinks(baseName: string, themeId = 'business', layoutId?: string): string {
  const resolvedThemeId = resolveExportThemeId(themeId);
  const styleDir = `./${baseName}-assets/styles`;
  const links = [
    `<link rel="stylesheet" href="${styleDir}/themes/theme-base.css">`,
    `<link rel="stylesheet" href="${styleDir}/themes/theme-${resolvedThemeId}.css">`,
    `<link rel="stylesheet" href="${styleDir}/card-library.css">`,
    `<link rel="stylesheet" href="${styleDir}/layouts/_layout-base.css">`,
  ];

  const safeLayoutId = sanitizeLayoutId(layoutId);
  if (safeLayoutId) {
    links.push(`<link rel="stylesheet" href="${styleDir}/layouts/${safeLayoutId}.css">`);
  }

  return links.join('\n');
}

export function buildExportPaletteCss(palette: ExportPalette | undefined): string {
  if (!palette) return '';

  const lines: string[] = [':root {'];

  if (palette.bodyBg) {
    lines.push(`  --bg: ${palette.bodyBg};`);
    lines.push(`  --bg-body: ${palette.bodyBg};`);
    lines.push(`  --bg-card-alt: ${palette.bodyBg};`);
  }
  if (palette.cardBg) {
    lines.push(`  --card: ${palette.cardBg};`);
    lines.push(`  --bg-card: ${palette.cardBg};`);
  }
  if (palette.primary) {
    lines.push(`  --primary: ${palette.primary};`);
    lines.push(`  --color-primary: ${palette.primary};`);
  }
  if (palette.textColor) {
    lines.push(`  --text: ${palette.textColor};`);
    lines.push(`  --text-main: ${palette.textColor};`);
    lines.push(`  --text-body: ${palette.textColor};`);
  }
  if (palette.subTextColor) {
    lines.push(`  --sub: ${palette.subTextColor};`);
    lines.push(`  --text-sub: ${palette.subTextColor};`);
  }

  if (palette.primary) {
    if (palette.isDark) {
      const hdrBg = palette.cardBg || palette.bodyBg || palette.primary;
      lines.push(`  --bg-header: ${hdrBg};`);
      lines.push(`  --text-header: ${palette.textColor || '#e2e8f0'};`);
      lines.push('  --border-header: 1px solid rgba(255,255,255,0.12);');
    } else {
      const hdrColor2 = palette.colors.length > 1 ? palette.colors[1] : palette.primary;
      lines.push(`  --bg-header: linear-gradient(135deg, ${palette.primary} 0%, ${hdrColor2} 100%);`);
      lines.push('  --text-header: #ffffff;');
      lines.push('  --border-header: none;');
    }
  }

  if (Array.isArray(palette.colors)) {
    palette.colors.forEach((color, index) => {
      lines.push(`  --palette-color-${index + 1}: ${color};`);
    });
  }

  lines.push('}');

  const bodyOverrides: string[] = [];
  if (palette.bodyBg) bodyOverrides.push(`  background-color: ${palette.bodyBg} !important;`);
  if (palette.textColor) bodyOverrides.push(`  color: ${palette.textColor} !important;`);
  if (bodyOverrides.length > 0) {
    lines.push('html, body {');
    lines.push(...bodyOverrides);
    lines.push('}');
  }

  if (palette.cardBg) {
    lines.push('.card, [class*="card"], .kpi-card, .chart-card, .section, .zone-filter, .filter-global-panel {');
    lines.push(`  background-color: ${palette.cardBg} !important;`);
    lines.push('}');
  }

  if (palette.textColor) {
    lines.push(`table, th, td, tr { color: ${palette.textColor}; }`);
  }

  if (palette.cardBg && palette.textColor) {
    lines.push(`th { background-color: ${palette.cardBg} !important; color: ${palette.textColor} !important; }`);
    lines.push(`tr:nth-child(even) td { background-color: ${(palette.bodyBg || palette.cardBg)} !important; }`);
  }

  if (palette.isDark && palette.cardBg && palette.textColor) {
    lines.push(`input, select, textarea { background: ${palette.cardBg}; color: ${palette.textColor}; }`);
  }

  return `<style id="__export-palette-theme">\n${lines.join('\n')}\n</style>`;
}