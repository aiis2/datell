import { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

/* ======== app:// Custom Protocol (registered BEFORE app.ready) ========
 * Maps app://localhost/* → dist/* so that all pages are same-origin.
 * This enables the report-shell iframe to share ECharts/ApexCharts objects
 * with the inner srcdoc iframe via parent.echarts (same-origin cross-frame).
 * contextBridge / IPC preload are not affected by URL scheme. ========= */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,       // allow loading local vendor scripts
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as XLSX from 'xlsx';
import { DatabaseService } from './database';
import { getDataDir, ensureDataDirs, setDataDir } from './dataDir';
import {
  getAllDatasources,
  getMaskedDatasources,
  saveDatasource,
  deleteDatasource,
  testDatasource,
  queryDatasource,
  getDatasourceSchema,
  getTableData,
} from './datasource';
import {
  listCollections, createCollection, deleteCollection,
  listDocuments, addDocument, removeDocument,
  searchFTS, searchSemantic, searchDify, searchRagflow,
  chunkTextWithOptions,
} from './rag';
import {
  listNodes, createNode, updateNode, deleteNode,
  listEdges, createEdge, deleteEdge,
} from './kgraph';
import {
  getMachineCode,
  type ActivationStatus,
} from './license';
import { searchSystemKnowledge, loadSystemKnowledgeIndex } from './systemRag';

const execFileAsync = promisify(execFile);

/* ======== Enterprise Model Plugin (dynamic — loaded at runtime) ========
 * Credentials and endpoint are NOT stored in this file.
 * They live in `plugins/enterprise-model.js` which is excluded from the
 * open-source repository via .gitignore.
 *
 * Plugin search order (first match wins):
 *   1. <userData>/plugins/enterprise-model.js   — user-installed / CI deploy
 *   2. <appPath>/plugins/enterprise-model.js    — bundled with private build
 *   3. <__dirname>/../../plugins/enterprise-model.js — dev source tree
 *
 * When no plugin is found the app runs in open-source mode:
 *   - Locked enterprise model entries are hidden in the UI
 *   - Sentinel-key requests return a friendly error message
 * ===================================================================== */

interface _EnterprisePlugin {
  getProKey(): string;
  getBasicKey(): string;
  entChatUrl: string;
  pluginMeta?: { name: string; version: string; description?: string };
}

let _enterprisePlugin: _EnterprisePlugin | null = null;

function _loadEnterprisePlugin(): void {
  // app may not be ready yet at module load time; defer path resolution
  const candidates: string[] = [];
  try { candidates.push(path.join(app.getPath('userData'), 'plugins', 'enterprise-model.js')); } catch { /* app not ready */ }
  try { candidates.push(path.join(app.getAppPath(), 'plugins', 'enterprise-model.js')); } catch { /* ignore */ }
  candidates.push(path.join(__dirname, '../../plugins/enterprise-model.js')); // dev mode

  for (const pluginPath of candidates) {
    try {
      if (fs.existsSync(pluginPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(pluginPath) as Partial<_EnterprisePlugin>;
        if (typeof mod.getProKey === 'function' && typeof mod.getBasicKey === 'function' && typeof mod.entChatUrl === 'string') {
          _enterprisePlugin = mod as _EnterprisePlugin;
          console.log('[plugin] Enterprise model plugin loaded:', pluginPath,
            mod.pluginMeta ? `(${mod.pluginMeta.name} v${mod.pluginMeta.version})` : '');
          return;
        }
        console.warn('[plugin] Enterprise plugin at', pluginPath, 'is missing required interface — skipped');
      }
    } catch (e) {
      console.warn('[plugin] Failed to load enterprise plugin from', pluginPath, ':', (e as Error).message);
    }
  }
  console.log('[plugin] No enterprise model plugin found — running in open-source mode');
}

/** Returns the pro enterprise API key (empty string when plugin not loaded) */
function _getProKey(): string  { return _enterprisePlugin?.getProKey()   ?? ''; }
/** Returns the basic enterprise API key (empty string when plugin not loaded) */
function _getBasicKey(): string { return _enterprisePlugin?.getBasicKey() ?? ''; }
/** Enterprise chat completions endpoint from plugin (empty when no plugin) */
function _getEntChatUrl(): string { return _enterprisePlugin?.entChatUrl ?? ''; }
/** Whether the enterprise plugin is available */
function _hasEnterprisePlugin(): boolean { return _enterprisePlugin !== null; }
// Initialize data directory and database before anything else
const DATA_DIR = getDataDir();
ensureDataDirs(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'app.db');
let db: DatabaseService = new DatabaseService(DB_PATH);

const isDev = !app.isPackaged;

/** Current UI language — updated by renderer via 'app:set-language' IPC. Used for native dialogs. */
let appLang: 'zh-CN' | 'en-US' = 'zh-CN';
/** Inline translation helper: returns EN string when language is en-US, ZH otherwise. */
const tr = (zh: string, en: string) => appLang === 'en-US' ? en : zh;

/* ======== Windows Identity ======== */

interface WindowsIdentity {
  username: string;
  domain: string;
  displayName: string;
  sid: string;
  source: 'whoami' | 'env';
  isFallback: boolean;
  lastSeenAt: number;
}

async function getWindowsIdentityInternal(): Promise<WindowsIdentity> {
  const osInfo = os.userInfo();
  const envUsername = process.env.USERNAME || osInfo.username || 'Unknown';
  const envDomain = process.env.USERDOMAIN || process.env.COMPUTERNAME || os.hostname();

  const fallback: WindowsIdentity = {
    username: envUsername,
    domain: envDomain,
    displayName: envDomain ? `${envDomain}\\${envUsername}` : envUsername,
    sid: '',
    source: 'env',
    isFallback: true,
    lastSeenAt: Date.now(),
  };

  if (process.platform !== 'win32') {
    return fallback;
  }

  try {
    // whoami /user /fo csv /nh  →  "DOMAIN\username","S-1-5-21-..."
    const { stdout } = await execFileAsync('whoami', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const match = stdout.trim().match(/"([^"]+)","([^"]+)"/);
    if (match) {
      const fullName = match[1];
      const sid = match[2];
      const parts = fullName.split('\\');
      const domain = parts.length > 1 ? parts[0] : envDomain;
      const username = parts[parts.length - 1];
      return {
        username,
        domain,
        displayName: fullName,
        sid,
        source: 'whoami',
        isFallback: false,
        lastSeenAt: Date.now(),
      };
    }
  } catch {
    // fall through to env fallback
  }

  return fallback;
}

let splashWin: BrowserWindow | null = null;

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 380,
    height: 220,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#00000000',
    skipTaskbar: true,
  });
  splash.loadURL(isDev ? 'http://localhost:5173/splash.html' : 'app://localhost/splash.html');
  return splash;
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'Datell',
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false,  // Hidden until ready-to-show fires (eliminates blank window flash)
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#374151',
            height: 40,
          },
        }
      : {}),
  });

  win.setMenuBarVisibility(false);
  win.removeMenu();
  Menu.setApplicationMenu(null);

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[did-fail-load] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[render-process-gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });

  // Show main window and close splash when React is ready
  win.once('ready-to-show', () => {
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.close();
      splashWin = null;
    }
    win.show();
  });

  // ── Confirm before quitting — prevents accidental close when settings drawer is open ──
  // The native window X and the settings-drawer X are visually close on Windows;
  // this dialog ensures the user always intends to exit the whole application.
  let forceQuit = false;
  win.on('close', async (event) => {
    if (forceQuit) return; // allow programmatic quit
    event.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: appLang === 'en-US' ? ['Quit', 'Cancel'] : ['退出程序', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: tr('退出确认', 'Confirm Exit'),
      message: tr('确定要退出 Datell 吗？', 'Are you sure you want to quit Datell?'),
      detail: tr('所有对话记录和报告已自动保存。', 'All conversations and reports have been saved automatically.'),
    });
    if (response === 0) {
      forceQuit = true;
      win.close();
    }
  });

  // Allow renderer to trigger a clean quit (e.g. from update / logout)
  ipcMain.once('app:force-quit', () => {
    forceQuit = true;
    win.close();
  });

  // Fallback: if ready-to-show never fires within 10s, force show
  const showFallback = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      if (splashWin && !splashWin.isDestroyed()) { splashWin.close(); splashWin = null; }
      win.show();
    }
  }, 10000);
  win.once('closed', () => clearTimeout(showFallback));

  // DevTools access is locked by default in production builds.
  // It can be unlocked per-session via the secret 10-click on the version label
  // in Settings → Help (IPC: devtools:unlock).  Once unlocked, Ctrl+Shift+I works
  // until the window is closed (session-only flag, not persisted).
  let devToolsUnlocked = false;
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    if (devToolsUnlocked && input.key === 'I' && input.control && input.shift) {
      win.webContents.toggleDevTools();
    }
    // Always block F12 in production builds
  });

  ipcMain.handle('devtools:unlock', () => {
    devToolsUnlocked = true;
  });

  // ── Language notification from renderer (for native dialog localisation) ──
  ipcMain.on('app:set-language', (_event, lang: string) => {
    if (lang === 'en-US' || lang === 'zh-CN') appLang = lang;
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Use app:// custom protocol — all pages share same origin (app://localhost)
    win.loadURL('app://localhost/index.html').catch((error) => {
      console.error(`[loadURL app://] ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  return win;
}

/* ======== DB IPC Handlers ======== */

// Conversations
ipcMain.handle('db:getConversations', () => db.getConversations());
ipcMain.handle('db:getMessages', (_e, convId: string) => db.getMessages(convId));
ipcMain.handle('db:upsertConversation', (_e, conv) => { db.upsertConversation(conv); });
ipcMain.handle('db:upsertMessage', (_e, msg) => { db.upsertMessage(msg); });
ipcMain.handle('db:deleteConversation', (_e, id: string) => { db.deleteConversation(id); });
ipcMain.handle('db:deleteMessage', (_e, id: string) => { db.deleteMessage(id); });
ipcMain.handle('db:updateConversationTitle', (_e, id: string, title: string) => {
  db.updateConversationTitle(id, title);
});

// Reports
ipcMain.handle('db:getReports', () => db.getReports());
ipcMain.handle('db:upsertReport', (_e, report) => { db.upsertReport(report); });
ipcMain.handle('db:deleteReport', (_e, id: string) => { db.deleteReport(id); });
ipcMain.handle('db:getReportById', (_e, id: string) => db.getReportById(id));

// Templates
ipcMain.handle('db:getTemplates', () => db.getTemplates());
ipcMain.handle('db:saveTemplate', (_e, report) => { db.upsertReport({ ...report, is_template: 1 }); });
ipcMain.handle('db:deleteTemplate', (_e, id: string) => { db.deleteReport(id); });

// Config
ipcMain.handle('db:getConfig', (_e, key: string) => db.getConfig(key));
ipcMain.handle('db:setConfig', (_e, key: string, value: string) => { db.setConfig(key, value); });
ipcMain.handle('db:getAllConfig', () => db.getAllConfig());

/* ======== Datasource IPC Handlers ======== */

ipcMain.handle('datasource:getAll', () => getMaskedDatasources());
ipcMain.handle('datasource:save', (_e, config) => saveDatasource(config));
ipcMain.handle('datasource:delete', (_e, id: string) => { deleteDatasource(id); });
ipcMain.handle('datasource:test', (_e, id: string) => testDatasource(id));
ipcMain.handle('datasource:query', (_e, id: string, sql: string, params?: unknown[]) =>
  queryDatasource(id, sql, params)
);
ipcMain.handle('datasource:getSchema', (_e, id: string, opts?: any) => getDatasourceSchema(id, opts));
ipcMain.handle('datasource:getTableData', (_e, id: string, tableName: string) => getTableData(id, tableName));

/* ======== System Identity IPC Handlers ======== */

// Get current Windows identity, persist to DB, and return to renderer
ipcMain.handle('system:getWindowsIdentity', async () => {
  const identity = await getWindowsIdentityInternal();
  // Persist to windows_identity table for permission control use
  db.upsertWindowsIdentity({
    sid: identity.sid,
    username: identity.username,
    domain: identity.domain,
    display_name: identity.displayName,
    source: identity.source,
    is_fallback: identity.isFallback ? 1 : 0,
    last_seen_at: identity.lastSeenAt,
  });
  return identity;
});

/* ======== FS / Data Dir IPC Handlers ======== */

ipcMain.handle('fs:getDataDir', () => DATA_DIR);

/** Read a vendor JS file from dist/vendor/. Returns content string or empty string. */
function readVendorJs(filename: string): string {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'vendor', filename),
    path.join(__dirname, '../dist/vendor', filename),
  ];
  for (const vpath of candidates) {
    try { const c = fs.readFileSync(vpath, 'utf-8'); if (c) return c; } catch { /* try next */ }
  }
  return '';
}

function readStyleCss(filename: string): string {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'styles', filename),
    path.join(__dirname, '../dist/styles', filename),
    path.join(app.getAppPath(), 'public', 'styles', filename),
  ];
  for (const spath of candidates) {
    try { const c = fs.readFileSync(spath, 'utf-8'); if (c) return c; } catch { /* try next */ }
  }
  return '';
}

/** CDN script patterns to strip when inlining vendor JS for standalone export */
const CDN_SCRIPT_RE = /<script[^>]+src=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdn\.bootcdn\.net|cdnjs\.cloudflare\.com|staticfile\.org|echarts\.apache\.org)[^"']*["'][^>]*><\/script>/gi;

/**
 * Injects theme CSS + ECharts + ApexCharts as inline blocks into exported HTML so that
 * charts render correctly outside the app:// shell (file:// or blob: context).
 * Also strips CDN script tags for chart libs since they are now inlined.
 *
 * EXP-01 FIX: Accept themeId and layoutId so PDF/screenshot exports respect the user's
 * current theme selection instead of always injecting theme-business.css.
 */
function injectVendorLibs(html: string, themeId = 'business', layoutId = 'default'): string {
  const echartsJs = readVendorJs('echarts.min.js');
  const apexchartsJs = readVendorJs('apexcharts.min.js');
  const themeBaseCss = readStyleCss('themes/theme-base.css') || readStyleCss('theme-base.css');
  // Use the requested theme, falling back to business
  const themeVarCss = readStyleCss(`themes/theme-${themeId}.css`)
                   || readStyleCss(`theme-${themeId}.css`)
                   || readStyleCss('themes/theme-business.css')
                   || readStyleCss('theme-business.css');
  const layoutCss   = readStyleCss(`layouts/_layout-${layoutId}.css`)
                   || readStyleCss(`layouts/layout-${layoutId}.css`)
                   || '';

  // Strip CDN script tags — vendor is now inlined so duplicate loading is avoided
  let result = html.replace(CDN_SCRIPT_RE, () => '<!-- [export] CDN script replaced by inline vendor -->');

  const cssBlock = [
    themeBaseCss ? `<style id="__export-theme-base">\n${themeBaseCss}\n</style>` : '',
    themeVarCss  ? `<style id="__export-theme-var">\n${themeVarCss}\n</style>`   : '',
    layoutCss    ? `<style id="__export-layout">\n${layoutCss}\n</style>`         : '',
  ].filter(Boolean).join('\n');
  const jsBlock = [
    echartsJs    ? `<script>${echartsJs}</script>`    : '',
    apexchartsJs ? `<script>${apexchartsJs}</script>` : '',
  ].filter(Boolean).join('\n');

  const blocks = [cssBlock, jsBlock].filter(Boolean).join('\n');
  if (!blocks) return result;
  if (result.includes('</head>')) return result.replace('</head>', () => `${blocks}\n</head>`);
  if (result.includes('<body'))   return result.replace('<body', () => `${blocks}\n<body`);
  return `${blocks}\n${result}`;
}

/** Read a vendor JS file from dist/vendor/ — used by renderer to inline CDN libs.
 * Tries multiple path candidates for robustness across dev / packaged ASAR environments.
 */
ipcMain.handle('fs:readVendorFile', (_e, filename: string): string | null => {
  // Sanitize: only allow safe filenames from the vendor dir
  if (!/^[\w.-]+\.js$/.test(filename)) return null;
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'vendor', filename),
    path.join(__dirname, '../dist/vendor', filename),
  ];
  for (const vpath of candidates) {
    try {
      const content = fs.readFileSync(vpath, 'utf-8');
      if (content) return content;
    } catch { /* try next candidate */ }
  }
  return null;
});

/** Read a theme/layout CSS file from dist/styles/ — used by renderer to inline styles in exported HTML.
 * Supports subdirectory paths like "themes/theme-base.css" or "layouts/universal/dashboard-2col.css".
 */
ipcMain.handle('fs:readStyleFile', (_e, filename: string): string | null => {
  // Allow word chars, dots, hyphens, underscores AND forward slashes for subdirs.
  // Reject anything with ".." to prevent directory traversal.
  if (/\.\./.test(filename) || !/^[\w.\-/]+\.css$/.test(filename)) return null;
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'styles', filename),
    path.join(__dirname, '../dist/styles', filename),
    path.join(app.getAppPath(), 'public', 'styles', filename),
    // Legacy flat path (backward compat for old theme filenames)
    path.join(app.getAppPath(), 'dist', 'styles', path.basename(filename)),
    path.join(app.getAppPath(), 'public', 'styles', path.basename(filename)),
  ];
  for (const spath of candidates) {
    try {
      const content = fs.readFileSync(spath, 'utf-8');
      if (content) return content;
    } catch { /* try next candidate */ }
  }
  return null;
});

ipcMain.handle('fs:setDataDir', (_e, newDir: string) => {
  setDataDir(newDir);
  // Reinitialize DB in new location on next launch
});

// ===== System RAG =====
ipcMain.handle('system-rag:search', (
  _event,
  query: string,
  options?: { topK?: number; type?: 'card' | 'layout' | 'all'; category?: string }
) => {
  return searchSystemKnowledge(query, options);
});

ipcMain.handle('system-rag:preload', () => {
  // Eagerly load index into memory to avoid first-query latency
  return loadSystemKnowledgeIndex().docCount;
});

ipcMain.handle('fs:openDataDir', () => {
  shell.openPath(DATA_DIR);
});

// Export HTML tables to Excel
ipcMain.handle('fs:exportExcel', async (_event, html: string, title: string) => {
  const tmpPath = path.join(app.getPath('temp'), `excel_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf-8');
  const hiddenWin = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  });
  try {
    await hiddenWin.loadFile(tmpPath);
    await new Promise((r) => setTimeout(r, 1500));

    const tablesData = await hiddenWin.webContents.executeJavaScript(`
      (function() {
        const result = [];
        document.querySelectorAll('table').forEach(function(table) {
          const rows = [];
          table.querySelectorAll('tr').forEach(function(tr) {
            const cells = [];
            tr.querySelectorAll('th, td').forEach(function(cell) {
              cells.push(cell.innerText.trim());
            });
            if (cells.some(function(c) { return c.length > 0; })) {
              rows.push(cells);
            }
          });
          if (rows.length > 0) {
            const caption = table.querySelector('caption');
            result.push({ name: caption ? caption.innerText : ('Table' + (result.length + 1)), rows: rows });
          }
        });
        return result;
      })()
    `) as Array<{ name: string; rows: string[][] }>;

    if (!tablesData || tablesData.length === 0) {
      return { ok: false, message: tr('报表中未找到可导出的表格数据', 'No table data found in the report to export') };
    }

    const wb = XLSX.utils.book_new();
    tablesData.forEach((table, i) => {
      const ws = XLSX.utils.aoa_to_sheet(table.rows);
      const sheetName = (table.name || `Sheet${i + 1}`).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(DATA_DIR, 'exports', `${title}.xlsx`),
      filters: [{ name: tr('Excel 文件', 'Excel Files'), extensions: ['xlsx'] }],
    });

    if (filePath) {
      fs.writeFileSync(filePath, buffer);
      return { ok: true };
    }
    return { ok: false, message: tr('已取消', 'Cancelled') };
  } finally {
    hiddenWin.destroy();
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

/* ======== IPC Handlers ======== */

// Save arbitrary file
ipcMain.handle('save-file', async (_event, data: Uint8Array, defaultName: string) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
  });

  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
  }
  return false;
});

// Get app version
ipcMain.handle('get-app-version', () => app.getVersion());

// Sync theme to native OS title bar (Windows / macOS)
ipcMain.handle('set-native-theme', (_event, theme: 'light' | 'dark') => {
  nativeTheme.themeSource = theme;
});

// ── Print-mode HTML builder ─────────────────────────────────────────────
// Injects CSS + JS that disables interactivity controls and suppresses animations
// before PDF/image capture so the output is clean and static.
const PRINT_STYLE_BLOCK = `<style id="__print-mode">
  /* 隐藏所有交互控件（筛选器、面包屑、下载按钮等） */
  .filter-card, .filter-date-range, .filter-dropdown-single,
  .filter-checkbox-group, .filter-radio-group, .filter-search-box,
  .filter-numeric-range, .filter-global-panel, .drill-breadcrumb,
  .filter-active-tags, .filter-tag-pills-container,
  .filter-reset-button, .filter-apply-btn, .drill-up-btn,
  [data-filter-id], [data-filter-type] { display: none !important; }
  /* 隐藏编辑模式叠加层（LayoutEditor / 操作按钮区域），防止出现在导出结果中 */
  .layout-editor-overlay, .edit-mode-toolbar, .edit-controls,
  [data-edit-overlay], [data-layout-editor],
  .report-edit-bar, .card-edit-actions { display: none !important; }
  /* 取消 ECharts 动画以避免截图时图表还在渲染 */
  canvas { animation: none !important; transition: none !important; }
  /* 移除悬浮层 */
  .tooltip, [class*="tooltip"] { display: none !important; }
</style>`;

const PRINT_SCRIPT_BLOCK = `<script id="__print-script">
  window.__REPORT_INTERACTION_DISABLED__ = true;
  window.__REPORT_PRINT_MODE__ = true;
<\/script>`;

/**
 * Prepare HTML for static export (PDF / image):
 * 1. Injects vendor libs (ECharts inline) with correct theme
 * 2. Adds print-mode CSS + JS (disable interactivity, hide controls, stop animations)
 *
 * EXP-01 FIX: Pass themeId/layoutId through to injectVendorLibs so exports use the correct theme.
 */
function buildPrintModeHtml(html: string, themeId = 'business', layoutId = 'default'): string {
  let result = injectVendorLibs(html, themeId, layoutId);
  // Inject print style + disable-interactivity script into <head>
  const headInject = `${PRINT_STYLE_BLOCK}\n${PRINT_SCRIPT_BLOCK}`;
  if (result.includes('</head>')) {
    result = result.replace('</head>', () => `${headInject}\n</head>`);
  } else if (result.includes('<body')) {
    result = result.replace('<body', () => `${headInject}\n<body`);
  } else {
    result = headInject + '\n' + result;
  }
  return result;
}

// Inject JavaScript to normalize layout for export (removes scrollbars, expands fixed heights, unflattens scroll containers)
const PREPARE_EXPORT_SCRIPT = `
  (function() {
    const style = document.createElement('style');
    style.innerHTML = \`
      ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      html, body {
        height: auto !important;
        min-height: 100% !important;
        max-height: none !important;
        overflow: visible !important;
      }
    \`;
    document.head.appendChild(style);

    const elements = document.querySelectorAll('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const comp = window.getComputedStyle(el);
      if (comp.position === 'fixed' || comp.position === 'sticky') {
        el.style.setProperty('position', 'relative', 'important');
      }
      if ((comp.overflowY === 'auto' || comp.overflowY === 'scroll') && el.tagName !== 'CANVAS') {
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
      }
      if (el.className && typeof el.className === 'string') {
        if (el.className.includes('h-screen')) el.classList.remove('h-screen');
        if (el.className.includes('max-h-screen')) el.classList.remove('max-h-screen');
      }
    }
  })();
`;

// Save PDF: load HTML in hidden window, inject print-mode, wait for chart render, then printToPDF
// EXP-01 FIX: Accept { html, title, themeId, layoutId } object so renderer can pass current theme
ipcMain.handle('save-pdf', async (_event, htmlOrArgs: string | { html: string; title: string; themeId?: string; layoutId?: string }, titleArg?: string) => {
  const html    = typeof htmlOrArgs === 'string' ? htmlOrArgs : htmlOrArgs.html;
  const title   = typeof htmlOrArgs === 'string' ? (titleArg ?? '') : htmlOrArgs.title;
  const themeId = typeof htmlOrArgs === 'object' ? (htmlOrArgs.themeId ?? 'business') : 'business';
  const layoutId = typeof htmlOrArgs === 'object' ? (htmlOrArgs.layoutId ?? 'default') : 'default';
  const tmpPath = path.join(app.getPath('temp'), `report_pdf_${Date.now()}.html`);
  // buildPrintModeHtml: inlines vendor JS + injects CSS/JS to disable interactivity & animations
  fs.writeFileSync(tmpPath, buildPrintModeHtml(html, themeId, layoutId), 'utf-8');
  const hiddenWin = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await hiddenWin.loadFile(tmpPath);
    // EXP-06 FIX: Wait for ECharts 'finished' event (public API) instead of private _zr.animation.getClip
    // which was removed/changed in ECharts 5.4+. ApexCharts check via animationEnded is unchanged.
    await Promise.race([
      hiddenWin.webContents.executeJavaScript(`
        new Promise(resolve => {
          function checkReady() {
            // EXP-06: Use public 'finished' event via Promise.all instead of private _zr API
            var echartDoms = Array.from(document.querySelectorAll('[_echarts_instance_]'));
            if (echartDoms.length === 0) {
              // Also try elements that might have echarts instances without the attribute
              echartDoms = Array.from(document.querySelectorAll('[id]')).filter(function(el) {
                return window.echarts && window.echarts.getInstanceByDom && window.echarts.getInstanceByDom(el);
              });
            }
            var echartsPromises = echartDoms.map(function(el) {
              var inst = window.echarts && window.echarts.getInstanceByDom(el);
              if (!inst) return Promise.resolve();
              return new Promise(function(res) {
                var done = false;
                function onDone() { if (!done) { done = true; try { inst.off('finished', onDone); } catch(e){} res(); } }
                inst.on('finished', onDone);
                // Safety timeout: if no 'finished' fires within 4s, consider done
                setTimeout(function() { if (!done) { done = true; res(); } }, 4000);
              });
            });
            // Check ApexCharts instances via event bus
            var apexInstances = (window.__REPORT_EVENT_BUS__ && window.__REPORT_EVENT_BUS__.getApexInstances) ? window.__REPORT_EVENT_BUS__.getApexInstances() : [];
            var apexReady = apexInstances.every(function(inst) {
              try { return inst && inst.w && (inst.w.globals.animationEnded === true || inst.w.globals.noData); }
              catch(e) { return true; }
            });
            if (!apexReady) { setTimeout(checkReady, 200); return; }
            Promise.all(echartsPromises).then(function() { resolve(true); });
          }
          setTimeout(checkReady, 800);
        })
      `),
      new Promise(resolve => setTimeout(resolve, 10000)),
    ]);
    // Normalize layout (fixed → relative, overflow visible, remove h-screen)
    await hiddenWin.webContents.executeJavaScript(PREPARE_EXPORT_SCRIPT);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const pdfData = await hiddenWin.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(DATA_DIR, 'exports', `${title}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (filePath) {
      fs.writeFileSync(filePath, pdfData);
      return true;
    }
    return false;
  } finally {
    hiddenWin.destroy();
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

// Capture full-page screenshot of a report HTML
// EXP-01 FIX: Accept { html, title, themeId, layoutId } object so renderer can pass current theme
ipcMain.handle('capture-report', async (_event, htmlOrArgs: string | { html: string; title: string; themeId?: string; layoutId?: string }, titleArg?: string) => {
  const html     = typeof htmlOrArgs === 'string' ? htmlOrArgs : htmlOrArgs.html;
  const title    = typeof htmlOrArgs === 'string' ? (titleArg ?? '') : htmlOrArgs.title;
  const themeId  = typeof htmlOrArgs === 'object' ? (htmlOrArgs.themeId  ?? 'business') : 'business';
  const layoutId = typeof htmlOrArgs === 'object' ? (htmlOrArgs.layoutId ?? 'default')  : 'default';
  const tmpPath = path.join(app.getPath('temp'), `report_capture_${Date.now()}.html`);
  // buildPrintModeHtml: inlines vendor JS + disables interactivity for clean screenshot
  fs.writeFileSync(tmpPath, buildPrintModeHtml(html, themeId, layoutId), 'utf-8');
  const hiddenWin = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await hiddenWin.loadFile(tmpPath);
    // P3-A: Wait for both ECharts and ApexCharts rendering to complete (up to 8s)
    await Promise.race([
      hiddenWin.webContents.executeJavaScript(`
        new Promise(resolve => {
          function checkReady() {
            var apexInstances = (window.__REPORT_EVENT_BUS__ && window.__REPORT_EVENT_BUS__.getApexInstances) ? window.__REPORT_EVENT_BUS__.getApexInstances() : [];
            var apexReady = apexInstances.every(function(inst) {
              try { return inst && inst.w && (inst.w.globals.animationEnded === true || inst.w.globals.noData); }
              catch(e) { return true; }
            });
            if (apexReady) resolve(true);
            else setTimeout(checkReady, 200);
          }
          setTimeout(checkReady, 2500);
        })
      `),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);
    // Step 2: Extract content with new robust script (unflatten + change fixed element to relative)
    await hiddenWin.webContents.executeJavaScript(PREPARE_EXPORT_SCRIPT);
    await new Promise((resolve) => setTimeout(resolve, 400));
    
    // Step 3: measure the actual content dimensions (scrollWidth x scrollHeight)
    const [scrollW, scrollH] = await hiddenWin.webContents.executeJavaScript(
      '[document.documentElement.scrollWidth, document.documentElement.scrollHeight]'
    ) as [number, number];
    // Step 4: resize window to full content size so no scrollbars are needed
    const captureW = Math.max(scrollW, 1400);
    const captureH = Math.max(scrollH, 900);
    hiddenWin.setBounds({ x: 0, y: 0, width: captureW, height: captureH });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const finalH = await hiddenWin.webContents.executeJavaScript('document.documentElement.scrollHeight') as number;
    if (finalH > captureH) {
      hiddenWin.setBounds({ x: 0, y: 0, width: captureW, height: finalH });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const image = await hiddenWin.webContents.capturePage();
    const pngBuf = image.toPNG();
    const defaultPath = path.join(DATA_DIR, 'exports', `${title}-截图.png`);
    const { filePath } = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });
    if (filePath) {
      fs.writeFileSync(filePath, pngBuf);
      return true;
    }
    return false;
  } finally {
    hiddenWin.destroy();
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

// ── Export HTML bundle (Interactive or Static) ───────────────────────────────
// Creates: <title>.html + <title>-assets/ directory with vendor files copied.
ipcMain.handle('export-html-bundle', async (_event, args: {
  html: string;
  title: string;
  mode: 'interactive' | 'static';
  baseName?: string;
}) => {
  const { html, title, mode } = args;

  const result = await dialog.showSaveDialog({
    title: mode === 'interactive'
      ? tr('导出交互式 HTML 报表', 'Export Interactive HTML Report')
      : tr('导出轻量 HTML 报表', 'Export Lightweight HTML Report'),
    defaultPath: path.join(DATA_DIR, 'exports', `${title}.html`),
    filters: [{ name: tr('HTML 文件', 'HTML Files'), extensions: ['html'] }],
  });

  if (result.canceled || !result.filePath) return false;

  const outputDir = path.dirname(result.filePath);
  const baseName = path.basename(result.filePath, '.html');
  const assetsDir = path.join(outputDir, `${baseName}-assets`);

  // Create assets directory
  fs.mkdirSync(assetsDir, { recursive: true });

  // Vendor source directory (supports both dev and packaged modes)
  // EXP-09 FIX: use a FILE probe instead of directory probe.
  //   fs.accessSync on a DIRECTORY path inside app.asar is unreliable in some Electron versions —
  //   it silently returns false even when the directory exists. Probing a known small file
  //   (icons-list.json, ~76KB) is reliable for both ASAR virtual FS and real FS paths.
  const vendorCandidates = [
    path.join(app.getAppPath(), 'dist', 'vendor'),     // packaged: dist/ is in ASAR files list
    path.join(app.getAppPath(), 'public', 'vendor'),   // dev mode: public/ served directly
    path.join(__dirname, '../dist/vendor'),
    path.join(__dirname, '../../public/vendor'),
  ];
  const vendorSrc = vendorCandidates.find(p => {
    try { fs.accessSync(path.join(p, 'icons-list.json')); return true; } catch { return false; }
  }) ?? vendorCandidates[0];

  // 1. Copy ECharts + ApexCharts + icons.svg (always)
  //    icons.svg is needed for SVG <use href="./vendor/icons.svg#..."> references in AI-generated HTML.
  // EXP-08 FIX: use readFileSync+writeFileSync instead of copyFileSync.
  //   In packaged Electron apps, files inside app.asar can only be READ (not copied) via
  //   the patched fs module; copyFileSync throws inside asar.
  const vendorFiles = ['echarts.min.js', 'apexcharts.min.js', 'interactivity-engine.js', 'icons.svg', 'icons-list.json'];
  for (const vf of vendorFiles) {
    const src = path.join(vendorSrc, vf);
    try {
      const data = fs.readFileSync(src);
      fs.writeFileSync(path.join(assetsDir, vf), data);
    } catch { /* skip if missing */ }
  }

  // 2. Copy DuckDB WASM files (only for interactive mode)
  if (mode === 'interactive') {
    const duckdbSrc = path.join(vendorSrc, 'duckdb');
    const duckdbDst = path.join(assetsDir, 'duckdb');
    try {
      fs.mkdirSync(duckdbDst, { recursive: true });
      for (const f of fs.readdirSync(duckdbSrc)) {
        try {
          const data = fs.readFileSync(path.join(duckdbSrc, f));
          fs.writeFileSync(path.join(duckdbDst, f), data);
        } catch { /* skip */ }
      }
    } catch { /* DuckDB not available, skip */ }
  }

  // 3. Copy styles directory recursively (EXP-04 FIX: previously only copied card-library.css,
  //    missing themes/ and layouts/ subdirectories entirely)
  const styleCandidates = [
    path.join(app.getAppPath(), 'public', 'styles'),
    path.join(app.getAppPath(), 'dist', 'styles'),
    path.join(__dirname, '../dist/styles'),
  ];
  const styleSrc = styleCandidates.find(p => {
    try { fs.accessSync(p); return true; } catch { return false; }
  });
  if (styleSrc) {
    const styleDest = path.join(assetsDir, 'styles');
    // Recursively copy entire styles directory (themes/, layouts/, root CSS files)
    const copyDirRecursive = (src: string, dest: string) => {
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src,  entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath);
        } else if (entry.isFile() && entry.name.endsWith('.css')) {
          try {
            const data = fs.readFileSync(srcPath);
            fs.writeFileSync(destPath, data);
          } catch { /* skip */ }
        }
      }
    };
    copyDirRecursive(styleSrc, styleDest);
  }

  // 3b. Copy filter-controls.js from public root (EXP-02 FIX: was missing, causing all filter
  //     controls to fail in exported bundles since it's not under vendor/)
  const publicRootCandidates = [
    path.join(app.getAppPath(), 'public'),
    path.join(app.getAppPath(), 'dist'),
    path.join(__dirname, '..'),
  ];
  const publicRootSrc = publicRootCandidates.find(p => {
    try { fs.accessSync(path.join(p, 'filter-controls.js')); return true; } catch { return false; }
  });
  if (publicRootSrc) {
    try {
      const data = fs.readFileSync(path.join(publicRootSrc, 'filter-controls.js'));
      fs.writeFileSync(path.join(assetsDir, 'filter-controls.js'), data);
    } catch { /* skip */ }
  }

  // 4. Normalize vendor + styles paths in HTML.
  //    Handles all path variants AI may generate:
  //      app://localhost/vendor/  — shell protocol path (Electron)
  //      /vendor/                  — absolute path from root
  //      ./vendor/                 — relative path (most common in AI output)
  //    EXP-05 FIX: previously only /vendor/ was handled; ./vendor/ (used by AI icons) was missed,
  //    causing SVG <use href="./vendor/icons.svg#icon-name"> to resolve to exports/vendor/ (wrong).
  let outputHtml = html
    // vendor paths — all three variants (app://, /vendor/, ./vendor/)
    .replace(/app:\/\/localhost\/vendor\//g, `./${baseName}-assets/`)
    .replace(/(src|href)=(["'])\.\/vendor\//g, (_m, attr, q) => `${attr}=${q}./${baseName}-assets/`)
    .replace(/src=(["'])\/vendor\//g, (_m, q) => `src=${q}./${baseName}-assets/`)
    .replace(/href=(["'])\/vendor\//g, (_m, q) => `href=${q}./${baseName}-assets/`)
    // styles paths (themes/, layouts/, card-library.css) — all variants
    .replace(/app:\/\/localhost\/styles\//g, `./${baseName}-assets/styles/`)
    .replace(/(src|href)=(["'])\.\/styles\//g, (_m, attr, q) => `${attr}=${q}./${baseName}-assets/styles/`)
    .replace(/href=(["'])\/styles\//g, (_m, q) => `href=${q}./${baseName}-assets/styles/`)
    .replace(/src=(["'])\/styles\//g, (_m, q) => `src=${q}./${baseName}-assets/styles/`)
    // filter-controls.js from public root
    .replace(/app:\/\/localhost\/filter-controls\.js/g, `./${baseName}-assets/filter-controls.js`)
    .replace(/src=(["'])\/filter-controls\.js(["'])/g, (_m, q1, q2) => `src=${q1}./${baseName}-assets/filter-controls.js${q2}`);

  // 4b. Inline SVG symbols to fix file:// cross-origin block.
  //    Modern browsers block SVG <use href="external-file.svg#id"> when loaded from file:// protocol
  //    (Same-Origin Policy treats each file path as distinct origin).
  //    Fix: extract only the symbol elements used in this HTML from icons.svg, inject them inline,
  //    then replace href="./xxx-assets/icons.svg#icon-NAME" → href="#icon-NAME".
  const iconPathRe = /href=["'][^"']*icons\.svg#(icon-[^"'#\s]+)["']/g;
  const usedIconIds = new Set<string>();
  let m: RegExpExecArray | null;
  iconPathRe.lastIndex = 0;
  while ((m = iconPathRe.exec(outputHtml)) !== null) usedIconIds.add(m[1]);

  if (usedIconIds.size > 0) {
    const iconsSvgPath = path.join(assetsDir, 'icons.svg');
    try {
      const svgContent = fs.readFileSync(iconsSvgPath, 'utf-8');
      // Extract only the symbol elements for icons we actually use
      const symbolRe = /<symbol\s[^>]*?id="(icon-[^"]+)"[\s\S]*?<\/symbol>/g;
      const usedSymbols: string[] = [];
      let sm: RegExpExecArray | null;
      while ((sm = symbolRe.exec(svgContent)) !== null) {
        if (usedIconIds.has(sm[1])) usedSymbols.push(sm[0]);
      }
      if (usedSymbols.length > 0) {
        const inlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${usedSymbols.join('\n')}\n</svg>`;
        // Inject inline SVG at the start of <body>
        outputHtml = outputHtml.includes('<body')
          ? outputHtml.replace(/(<body[^>]*>)/, `$1\n${inlineSvg}`)
          : inlineSvg + '\n' + outputHtml;
        // Replace external icons.svg references with inline fragment hrefs
        outputHtml = outputHtml.replace(/href=(["'])[^"']*icons\.svg#(icon-[^"'#\s]+)(["'])/g,
          (_m2, q1, icon, q3) => `href=${q1}#${icon}${q3}`);
      }
    } catch { /* icons.svg not available, keep as-is */ }
  }

  // 5. Strip CDN chart library scripts + inject local vendor scripts.
  //    The app's report-shell.html provides echarts/ApexCharts via same-origin bridge (parent.echarts).
  //    Exported standalone HTML has no shell, so we must:
  //      a) strip any CDN <script src> tags the AI may have included (same as what the shell does)
  //      b) unconditionally inject <script src> for local echarts/apexcharts when the library is used.
  //    EXP-06 FIX: old hasEchartsScript guard skipped injection when CDN reference contained
  //    "echarts.min.js" \u2014 CDN fails offline, echarts stays undefined.
  //    EXP-07 FIX: also strips CDN scripts so they don't shadow/override local vendor copies.
  const CDN_SCRIPT_RE = /<script[^>]+src=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdn\.bootcdn\.net|cdnjs\.cloudflare\.com|echarts\.apache\.org)[^"']*["'][^>]*><\/script>/gi;
  outputHtml = outputHtml.replace(CDN_SCRIPT_RE, '<!-- [export] CDN script stripped; using local vendor -->');

  const hasEchartsUsage = /echarts\s*[.(]/.test(outputHtml);
  const hasApexUsage    = /ApexCharts\s*[.(]|new\s+ApexCharts/.test(outputHtml);

  const vendorInjections: string[] = [];
  if (hasEchartsUsage) {
    vendorInjections.push(`<script src="./${baseName}-assets/echarts.min.js"><\/script>`);
  }
  if (hasApexUsage) {
    vendorInjections.push(`<script src="./${baseName}-assets/apexcharts.min.js"><\/script>`);
  }
  if (vendorInjections.length > 0) {
    const vendorBlock = vendorInjections.join('\n');
    if (outputHtml.includes('</head>')) {
      // Inject before </head> so scripts are available when DOMContentLoaded fires
      outputHtml = outputHtml.replace('</head>', () => `${vendorBlock}\n</head>`);
    } else if (outputHtml.includes('<body')) {
      outputHtml = outputHtml.replace('<body', () => `${vendorBlock}\n<body`);
    } else {
      outputHtml = vendorBlock + '\n' + outputHtml;
    }
  }

  // 5b. Inject interactivity runtime scripts for interactive/static mode
  const hasInteractivity = outputHtml.includes('data-interactions') ||
    outputHtml.includes('__report_data_context__');
  if (hasInteractivity) {
    const engineScript = `<script src="./${baseName}-assets/interactivity-engine.js"><\/script>`;
    const duckdbScript = mode === 'interactive'
      ? `<script src="./${baseName}-assets/duckdb/duckdb.js"><\/script>\n`
      : '';
    const injection = duckdbScript + engineScript;
    if (outputHtml.includes('</head>')) {
      outputHtml = outputHtml.replace('</head>', () => `${injection}\n</head>`);
    } else {
      outputHtml = injection + outputHtml;
    }
  }

  // 6. Write the HTML file
  fs.writeFileSync(result.filePath, outputHtml, 'utf-8');
  return true;
});

// Streaming fetch proxy to bypass CORS in renderer
// Returns a requestId; data is streamed back via 'fetch-stream-data' events
const activeStreams = new Map<string, AbortController>();

ipcMain.handle('fetch-stream', async (event, requestId: string, url: string, options: { method: string; headers: Record<string, string>; body: string }) => {
  const ac = new AbortController();
  activeStreams.set(requestId, ac);

  try {
    // Inject real API key ONLY when the renderer sent a sentinel value identifying
    // a built-in locked enterprise model. Each tier has its own distinct sentinel.
    const requestHeaders = { ...options.headers };
    const authHeader = requestHeaders['Authorization'] || requestHeaders['authorization'] || '';
    if (authHeader.includes('__LOCKED_PRO_INTERNAL__')) {
      if (!_hasEnterprisePlugin()) {
        event.sender.send('fetch-stream-data', requestId, {
          type: 'error',
          text: 'Enterprise model plugin not loaded. Install the enterprise plugin to use this model.',
        });
        return;
      }
      const k = _getProKey();
      console.log('[ent-stream] pro key injected, len:', k.length, 'ok:', k.startsWith('sk-'));
      requestHeaders['Authorization'] = `Bearer ${k}`;
      delete requestHeaders['authorization'];
      url = _getEntChatUrl(); // always force enterprise endpoint
    } else if (authHeader.includes('__LOCKED_BASIC_INTERNAL__')) {
      if (!_hasEnterprisePlugin()) {
        event.sender.send('fetch-stream-data', requestId, {
          type: 'error',
          text: 'Enterprise model plugin not loaded. Install the enterprise plugin to use this model.',
        });
        return;
      }
      const k = _getBasicKey();
      console.log('[ent-stream] basic key injected, len:', k.length, 'ok:', k.startsWith('sk-'));
      requestHeaders['Authorization'] = `Bearer ${k}`;
      delete requestHeaders['authorization'];
      url = _getEntChatUrl(); // always force enterprise endpoint
    }

    const resp = await fetch(url, {
      method: options.method,
      headers: requestHeaders,
      body: options.body,
      signal: ac.signal,
    });

    // Send status first
    event.sender.send('fetch-stream-data', requestId, {
      type: 'status',
      status: resp.status,
      statusText: resp.statusText,
    });

    if (!resp.ok) {
      const text = await resp.text();
      event.sender.send('fetch-stream-data', requestId, { type: 'error', text });
      return;
    }

    const reader = (resp.body as ReadableStream<Uint8Array>)?.getReader();
    if (!reader) {
      event.sender.send('fetch-stream-data', requestId, { type: 'error', text: 'No response body' });
      return;
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      event.sender.send('fetch-stream-data', requestId, {
        type: 'chunk',
        text: decoder.decode(value, { stream: true }),
      });
    }
    event.sender.send('fetch-stream-data', requestId, { type: 'done' });
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      event.sender.send('fetch-stream-data', requestId, {
        type: 'error',
        text: err.message || 'Fetch failed',
      });
    }
  } finally {
    activeStreams.delete(requestId);
  }
});

ipcMain.handle('fetch-stream-abort', async (_event, requestId: string) => {
  const ac = activeStreams.get(requestId);
  if (ac) {
    ac.abort();
    activeStreams.delete(requestId);
  }
});

// Test model connection from settings (runs in main process to avoid CORS)
ipcMain.handle('test-model-connection', async (_event, config: {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible' | 'anthropic-compatible' | 'openrouter';
  modelId: string;
  apiKey: string;
  baseUrl: string;
}) => {
  const startedAt = Date.now();

  try {
    const base = (config.baseUrl || '').replace(/\/+$/, '');
    let url = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, unknown> = {};

    if (config.provider === 'openai' || config.provider === 'openai-compatible' || config.provider === 'ollama' || config.provider === 'openrouter') {
      const baseUrl = (config.provider === 'openai-compatible' || config.provider === 'openrouter') ? base : `${base}/v1`;
      url = `${baseUrl}/chat/completions`;
      if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      // OpenRouter specific headers
      if (config.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://auto-report.app';
        headers['X-Title'] = '\u6570\u636e\u5206\u6790\u667a\u80fd\u4f53';
      }
      body = {
        model: config.modelId,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8,
      };
    } else if (config.provider === 'anthropic' || config.provider === 'anthropic-compatible') {
      url = `${base}/v1/messages`;
      if (config.apiKey?.trim()) {
        headers['x-api-key'] = config.apiKey.trim();
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      }
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: config.modelId,
        max_tokens: 8,
        stream: false,
        messages: [{ role: 'user', content: 'ping' }],
      };
    } else {
      url = `${base}/v1beta/models/${config.modelId}:generateContent?key=${encodeURIComponent(config.apiKey || '')}`;
      body = {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      };
    }

    // Inject real API key when: sentinel apiKey used (built-in locked enterprise model).
    // Each tier has its own distinct sentinel — never inject based on URL.
    const isLockedPro = config.apiKey === '__LOCKED_PRO_INTERNAL__';
    const isLockedBasic = config.apiKey === '__LOCKED_BASIC_INTERNAL__';
    let _injectedKeyHint = '';
    if (isLockedPro || isLockedBasic) {
      if (!_hasEnterprisePlugin()) {
        return { ok: false, status: 0, latencyMs: Date.now() - startedAt,
          message: tr('企业插件未加载，无法测试该模型', 'Enterprise plugin not loaded — cannot test this model') };
      }
    }
    if (isLockedPro) {
      const k = _getProKey();
      _injectedKeyHint = `pro(len=${k.length})`;
      headers['Authorization'] = `Bearer ${k}`;
      url = _getEntChatUrl(); // always force enterprise endpoint
    } else if (isLockedBasic) {
      const k = _getBasicKey();
      _injectedKeyHint = `basic(len=${k.length})`;
      headers['Authorization'] = `Bearer ${k}`;
      url = _getEntChatUrl(); // always force enterprise endpoint
    }
    // Safety guard: if injection failed (empty key or sentinel leaked), abort immediately
    const _finalAuth = headers['Authorization'] || '';
    const _bearerValue = _finalAuth.startsWith('Bearer ') ? _finalAuth.substring(7) : '';
    if (_finalAuth.includes('INTERNAL__') || _finalAuth.includes('LOCKED_') || ((isLockedPro || isLockedBasic) && _bearerValue.trim().length < 10)) {
      return { ok: false, status: 0, latencyMs: Date.now() - startedAt, message: `${tr('密钥注入失败', 'Key injection failed')} hint=${_injectedKeyHint} (err: key-empty-or-sentinel-leak)` };
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const latencyMs = Date.now() - startedAt;
    if (!resp.ok) {
      const text = await resp.text();
      // For locked models: append key hint to message so UI can show it
      const debugSuffix = (isLockedPro || isLockedBasic) ? ` [hint:${_injectedKeyHint}]` : '';
      return {
        ok: false,
        status: resp.status,
        latencyMs,
        message: `${tr('连通失败', 'Connection failed')} (${resp.status}): ${text.slice(0, 180)}${debugSuffix}`,
      };
    }

    return {
      ok: true,
      status: resp.status,
      latencyMs,
      message: `${tr('连通成功', 'Connected successfully')} (${resp.status})`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `${tr('连通异常', 'Connection error')}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

/* ======== App Lifecycle ======== */

// Prevent multiple instances — second instance just focuses the existing window
let mainWin: BrowserWindow | null = null;
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }
});

/* ======== Activation IPC Handlers ======== */

// Open-source edition: machine code is a fixed constant, no hardware data collected
let _machineCodeCache: string | null = null;
async function getCachedMachineCode(): Promise<string> {
  if (!_machineCodeCache) {
    _machineCodeCache = await getMachineCode();
  }
  return _machineCodeCache;
}

ipcMain.handle('activation:getMachineCode', async () => {
  return getCachedMachineCode();
});

ipcMain.handle('activation:getStatus', async (): Promise<ActivationStatus> => {
  const machineCode = await getCachedMachineCode();
  // Open-source edition: always fully activated
  return { activated: true, machineCode, expiry: null, daysRemaining: null, reason: 'Open Source', isPro: true };
});

ipcMain.handle('activation:submit', async (_event, _authCode: string): Promise<{ ok: boolean; message: string; status?: ActivationStatus }> => {
  const machineCode = await getCachedMachineCode();
  const status: ActivationStatus = { activated: true, machineCode, expiry: null, daysRemaining: null, reason: 'Open Source', isPro: true };
  return { ok: true, message: 'Open Source', status };
});

ipcMain.handle('activation:clear', async () => {
  // no-op in open-source edition
});

/* ======== Memory IPC Handlers ======== */

function getMemoryDir(): string {
  return path.join(DATA_DIR, 'memory');
}

function ensureMemoryDir(): void {
  const dir = getMemoryDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getMemoryFilePath(type: 'long_term' | 'short_term'): string {
  return path.join(getMemoryDir(), `${type}.md`);
}

ipcMain.handle('memory:read', (_e, type: 'long_term' | 'short_term'): string => {
  ensureMemoryDir();
  const filePath = getMemoryFilePath(type);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('memory:write', (_e, type: 'long_term' | 'short_term', content: string): void => {
  ensureMemoryDir();
  const filePath = getMemoryFilePath(type);
  fs.writeFileSync(filePath, content, 'utf-8');
});

ipcMain.handle('memory:append', (_e, type: 'long_term' | 'short_term', entry: string): void => {
  ensureMemoryDir();
  const filePath = getMemoryFilePath(type);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const block = `\n## [${timestamp}]\n${entry}\n`;
  fs.appendFileSync(filePath, block, 'utf-8');
});

ipcMain.handle('memory:clear', (_e, type: 'long_term' | 'short_term'): void => {
  ensureMemoryDir();
  const filePath = getMemoryFilePath(type);
  fs.writeFileSync(filePath, '', 'utf-8');
});

/* ======== MCP HTTP IPC Handlers ======== */

interface McpJsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

async function mcpHttpPost(url: string, body: object, timeoutMs = 15000): Promise<McpJsonRpcResponse> {
  const { net } = await import('electron');
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const timer = timeoutMs > 0
      ? setTimeout(() => done(() => reject(new Error(`MCP request timed out after ${timeoutMs}ms`))), timeoutMs)
      : null;

    const req = net.request({ method: 'POST', url });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Accept', 'application/json, text/event-stream');
    req.on('response', (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk.toString(); });
      res.on('end', () => {
        if (timer) clearTimeout(timer);
        // HTTP MCP may respond with SSE; pick first data: line
        if (raw.includes('data: ')) {
          const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) raw = dataLine.slice(6).trim();
        }
        done(() => {
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('MCP parse error: ' + raw.slice(0, 200))); }
        });
      });
      res.on('error', (e) => { if (timer) clearTimeout(timer); done(() => reject(e)); });
    });
    req.on('error', (e) => { if (timer) clearTimeout(timer); done(() => reject(e)); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

ipcMain.handle('mcp:http:discover', async (_e, url: string, timeoutMs?: number): Promise<{ ok: boolean; tools?: McpTool[]; error?: string }> => {
  const ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 15000;
  try {
    // Initialize session
    const initRes = await mcpHttpPost(url, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'auto-report', version: '1.0.0' } },
    }, ms);
    if (initRes.error) return { ok: false, error: initRes.error.message };
    // Send initialized notification (fire-and-forget, ignore errors)
    mcpHttpPost(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, ms).catch(() => {});
    // List tools
    const listRes = await mcpHttpPost(url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, ms);
    if (listRes.error) return { ok: false, error: listRes.error.message };
    const tools = ((listRes.result as Record<string, unknown>)?.tools ?? []) as McpTool[];
    return { ok: true, tools };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('mcp:http:call', async (_e, url: string, toolName: string, toolArgs: Record<string, unknown>, timeoutMs?: number): Promise<{ ok: boolean; result?: string; error?: string }> => {
  const ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
  try {
    const res = await mcpHttpPost(url, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    }, ms);
    if (res.error) return { ok: false, error: res.error.message };
    const content = ((res.result as Record<string, unknown>)?.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') || JSON.stringify(res.result);
    return { ok: true, result: text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

/* ======== Skills IPC Handlers ======== */

interface ExternalSkillTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  code: string;
}

interface ExternalSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  tools: ExternalSkillTool[];
}

ipcMain.handle('skills:list', (): ExternalSkill[] => {
  const skillsDir = path.join(DATA_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
    return [];
  }
  const results: ExternalSkill[] = [];
  try {
    const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        // Basic validation
        if (
          typeof parsed.name === 'string' &&
          Array.isArray(parsed.tools) &&
          parsed.tools.every(
            (t: unknown) =>
              t !== null &&
              typeof t === 'object' &&
              typeof (t as Record<string, unknown>).name === 'string' &&
              typeof (t as Record<string, unknown>).code === 'string'
          )
        ) {
          results.push({
            id: `ext-${file.replace('.json', '')}`,
            name: parsed.name,
            description: parsed.description || '',
            version: parsed.version || '1.0.0',
            source: file,
            tools: parsed.tools,
          });
        }
      } catch { /* skip malformed files */ }
    }
  } catch { /* skip on error */ }
  return results;
});

ipcMain.handle('skills:openDir', (): void => {
  const skillsDir = path.join(DATA_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  shell.openPath(skillsDir);
});

ipcMain.handle('skills:installFromUrl', async (_e, url: string): Promise<{ ok: boolean; name?: string; toolCount?: number; error?: string }> => {
  try {
    const { net } = await import('electron');

    // Helper: fetch raw content from a URL, returns null on error or non-200
    async function fetchContent(fetchUrl: string, accept = 'application/json'): Promise<string | null> {
      return new Promise<string | null>((resolve) => {
        try {
          const req = net.request({ method: 'GET', url: fetchUrl });
          req.setHeader('Accept', accept);
          req.on('response', (res) => {
            if (res.statusCode && res.statusCode >= 400) { resolve(null); return; }
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
          });
          req.on('error', () => resolve(null));
          req.end();
        } catch { resolve(null); }
      });
    }

    // Helper: save and return installed skill info
    function saveSkill(parsed: Record<string, unknown>): { ok: boolean; name?: string; toolCount?: number; error?: string } {
      if (!parsed.name || typeof parsed.name !== 'string') return { ok: false, error: '技能文件缺少 name 字段' };
      if (!Array.isArray(parsed.tools) || parsed.tools.length === 0) return { ok: false, error: '技能文件缺少 tools 数组或为空' };
      const safeName = String(parsed.name).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_').slice(0, 80);
      const skillsDir = path.join(DATA_DIR, 'skills');
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, `${safeName}.json`), JSON.stringify(parsed, null, 2), 'utf-8');
      return { ok: true, name: parsed.name as string, toolCount: (parsed.tools as unknown[]).length };
    }

    // ── GitHub repository URL handling ─────────────────────────────────
    // Supports: https://github.com/owner/repo (installs first skill)
    //           https://github.com/owner/repo#skill-name (installs named skill)
    const ghRepoMatch = /^https?:\/\/github\.com\/([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+?)(?:\.git)?(?:#([A-Za-z0-9_.\-]+))?$/.exec(url.trim());
    if (ghRepoMatch) {
      const owner = ghRepoMatch[1];
      const repo = ghRepoMatch[2];
      const skillNameHint = ghRepoMatch[3] || null;
      const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/main`;

      // Try .claude-plugin/marketplace.json (Vercel Labs format)
      const marketplaceRaw = await fetchContent(`${rawBase}/.claude-plugin/marketplace.json`, 'application/json, text/plain');
      if (marketplaceRaw) {
        let marketplace: Record<string, unknown>;
        try { marketplace = JSON.parse(marketplaceRaw); } catch { return { ok: false, error: '解析 marketplace.json 失败' }; }
        type PluginEntry = { name: string; description?: string; skills?: string[] };
        const plugins = (marketplace.plugins as PluginEntry[]) || [];
        if (plugins.length === 0) return { ok: false, error: '仓库中未找到技能定义 (plugins 数组为空)' };

        const targetPlugin = skillNameHint
          ? plugins.find((p) => p.name === skillNameHint)
          : plugins[0];
        if (!targetPlugin) {
          return { ok: false, error: `未找到技能 "${skillNameHint}"，可用技能: ${plugins.map((p) => p.name).join(', ')}` };
        }

        // Fetch SKILL.md from the skill directory
        const rawSkillDir = (targetPlugin.skills?.[0] || `./skills/${targetPlugin.name}`).replace(/^\.\//, '');
        // Security: prevent path traversal
        if (rawSkillDir.includes('..') || rawSkillDir.startsWith('/')) {
          return { ok: false, error: '无效的技能路径（检测到路径遍历）' };
        }
        const skillMdContent = await fetchContent(`${rawBase}/${rawSkillDir}/SKILL.md`, 'text/plain, */*');
        if (!skillMdContent) return { ok: false, error: `无法获取 ${rawSkillDir}/SKILL.md 内容` };

        // Build skill JSON: single tool that returns instructions
        // Use JSON.stringify for safe escaping of the SKILL.md content
        const instrCode = `// ${targetPlugin.name} instructions from ${owner}/${repo}\nreturn ${JSON.stringify(skillMdContent)};`;
        const skillJson: Record<string, unknown> = {
          name: targetPlugin.name,
          description: targetPlugin.description || `${targetPlugin.name} 技能 (来自 ${owner}/${repo})`,
          version: String((marketplace as Record<string, unknown>).version || '1.0.0'),
          source: url,
          tools: [{
            name: `${targetPlugin.name.replace(/[^a-zA-Z0-9_]/g, '_')}_instructions`,
            description: `获取 ${targetPlugin.name} 技能的操作指南和能力说明`,
            parameters: { type: 'object', properties: {} },
            code: instrCode,
          }],
        };
        return saveSkill(skillJson);
      }

      // Try a direct skill.json in repo root
      const directJson = await fetchContent(`${rawBase}/skill.json`, 'application/json');
      if (directJson) {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(directJson); } catch { return { ok: false, error: 'skill.json 不是有效 JSON' }; }
        return saveSkill(parsed);
      }

      return { ok: false, error: `仓库 ${owner}/${repo} 中未找到兼容的技能配置。可在 URL 后加 #技能名 指定特定技能（如 ${url}#agent-browser）` };
    }

    // ── Convert GitHub blob URL to raw URL ──────────────────────────────
    let fetchUrl = url.trim();
    if (/github\.com\/.+\/blob\//.test(fetchUrl)) {
      fetchUrl = fetchUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    // ── Normal JSON URL ─────────────────────────────────────────────────
    const raw = await fetchContent(fetchUrl);
    if (!raw) return { ok: false, error: 'URL 无法访问或返回空内容' };
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); } catch {
      return { ok: false, error: 'URL 内容不是有效 JSON。如需安装 GitHub 仓库中的技能，请直接提供仓库根目录 URL（如 https://github.com/owner/repo）' };
    }
    return saveSkill(parsed);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

/* ======== Data Directory Migration IPC Handlers ======== */

ipcMain.handle('fs:selectDirectory', async (): Promise<string | null> => {
  if (!mainWin) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据存储目录',
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('fs:selectFile', async (_e, extensions: string[]): Promise<string | null> => {
  if (!mainWin) return null;
  const exts = (Array.isArray(extensions) ? extensions : []).map((e: string) => e.replace(/^\./, ''));
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    properties: ['openFile'],
    filters: exts.length > 0 ? [{ name: '文件', extensions: exts }] : [{ name: '所有文件', extensions: ['*'] }],
    title: '选择文件',
  });
  return (canceled || !filePaths.length) ? null : filePaths[0];
});

ipcMain.handle('fs:readTextFile', async (_e, filePath: string): Promise<string | null> => {
  try {
    if (!filePath || typeof filePath !== 'string') return null;
    return fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch { return null; }
});

/* ======== RAG IPC Handlers ======== */

ipcMain.handle('rag:collections:list', () => listCollections(db));
ipcMain.handle('rag:collections:create', (_e, data: any) => createCollection(db, data));
ipcMain.handle('rag:collections:delete', (_e, id: string) => { deleteCollection(db, id); });
ipcMain.handle('rag:documents:list', (_e, cid: string) => listDocuments(db, cid));
ipcMain.handle('rag:documents:add', async (_e, cid: string, filePath: string, modelCfg?: any, chunkOpts?: any) => {
  const text = fs.readFileSync(path.resolve(filePath), 'utf-8');
  return await addDocument(db, cid, path.basename(filePath), text, modelCfg, chunkOpts);
});
ipcMain.handle('rag:documents:remove', (_e, id: string) => { removeDocument(db, id); });
ipcMain.handle('rag:chunks:list', (_e, collectionId: string, documentId: string) =>
  db.getRagChunksForDoc(collectionId, documentId)
);
ipcMain.handle('rag:chunks:update', (_e, id: string, content: string) => {
  db.updateRagChunk(id, content);
});
ipcMain.handle('rag:chunks:preview', async (_e, filePath: string, chunkOpts?: any) => {
  try {
    const text = fs.readFileSync(path.resolve(filePath), 'utf-8');
    const chunks = chunkTextWithOptions(text, chunkOpts);
    return chunks.slice(0, 20); // preview first 20
  } catch (e) {
    return [];
  }
});
ipcMain.handle('rag:search:fts', (_e, cid: string, q: string, topK?: number) =>
  searchFTS(db, cid, q, topK));
ipcMain.handle('rag:search:semantic', async (_e, cid: string, q: string, cfg: any, topK?: number) =>
  await searchSemantic(db, cid, q, cfg, topK));
ipcMain.handle('rag:search:dify', async (_e, p: any) => await searchDify(p));
ipcMain.handle('rag:search:ragflow', async (_e, p: any) => await searchRagflow(p));

/* ======== Knowledge Graph IPC Handlers ======== */

ipcMain.handle('kgraph:nodes:list', (_e, filter?: any) => listNodes(db, filter));
ipcMain.handle('kgraph:nodes:create', (_e, data: any) => createNode(db, data));
ipcMain.handle('kgraph:nodes:update', (_e, id: string, patch: any) => { updateNode(db, id, patch); });
ipcMain.handle('kgraph:nodes:delete', (_e, id: string) => { deleteNode(db, id); });
ipcMain.handle('kgraph:edges:list', (_e, nodeId?: string) => listEdges(db, nodeId));
ipcMain.handle('kgraph:edges:create', (_e, data: any) => createEdge(db, data));
ipcMain.handle('kgraph:edges:delete', (_e, id: string) => { deleteEdge(db, id); });

ipcMain.handle('fs:migrateDataDir', async (_e, newDir: string): Promise<{ ok: boolean; message: string }> => {
  try {
    if (!newDir || typeof newDir !== 'string') {
      return { ok: false, message: '目录路径无效' };
    }
    const resolvedNew = path.resolve(newDir);
    const resolvedOld = path.resolve(DATA_DIR);
    if (resolvedNew === resolvedOld) {
      return { ok: false, message: '新目录与当前目录相同' };
    }

    // Ensure new directory exists
    fs.mkdirSync(resolvedNew, { recursive: true });

    // Copy all files recursively from old dir to new dir
    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(resolvedOld, resolvedNew);

    // Save new data dir setting
    setDataDir(resolvedNew);

    return { ok: true, message: `数据已迁移到 ${resolvedNew}，请重启应用以生效` };
  } catch (err) {
    return { ok: false, message: `迁移失败: ${err instanceof Error ? err.message : String(err)}` };
  }
});

// Enterprise plugin status — queried by renderer to conditionally show locked models
ipcMain.handle('enterprise:pluginStatus', () => ({
  available: _hasEnterprisePlugin(),
  meta: _enterprisePlugin?.pluginMeta ?? null,
}));

app.whenReady().then(async () => {
  // Load enterprise model plugin (non-blocking; gracefully absent in open-source mode)
  _loadEnterprisePlugin();

  // Register app:// protocol handler — maps app://localhost/* to dist/ directory
  const distPath = path.join(__dirname, '../dist');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // Strip leading slash, default to index.html
    let filePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const fullPath = path.join(distPath, filePath);
    return net.fetch(pathToFileURL(fullPath).toString());
  });

  // Show splash first, then create main window hidden
  splashWin = createSplashWindow();
  mainWin = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWin = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});
