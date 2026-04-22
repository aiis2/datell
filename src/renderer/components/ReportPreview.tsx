import React, { useEffect, useRef, useState, useCallback } from 'react';
import { buildRenderPayload, buildThemeUpdatePayload, SHELL_URL } from '../utils/reportShellBridge';
import { X, Maximize2, Minimize2, ChevronDown, Download, BookmarkPlus, AlertTriangle, Palette, Globe, FileText, Image, BarChart2, Film, LayoutGrid, Pencil, Save, Undo2, Search } from 'lucide-react';
import { useReportStore } from '../stores/reportStore';
import { useConfigStore } from '../stores/configStore';
import type { ReportLayout } from '../types';
import { REPORT_LAYOUTS, PALETTE_PRESETS } from '../types';
import { useChatStore } from '../stores/chatStore';
import { useI18n } from '../i18n';
import { CONTENT_EN_NAMES } from '../i18n/contentEN';
import { SvgWireframe } from './SvgLayoutPreview';
import { LAYOUT_MANIFEST } from '../utils/layoutManifest';
import { useLayoutEditorStore } from '../stores/layoutEditorStore';
import LayoutEditor from './report/LayoutEditor';
import SaveLayoutDialog from './report/SaveLayoutDialog';
import { extractCardsFromIframe, detectGridColumns } from '../utils/layoutExtractor';
import { generateLayoutCSS } from '../utils/layoutCSSGenerator';
import type { CustomLayout } from '../types/layout';

const MIN_WIDTH = 300;
const MAX_WIDTH = 1400;
const DEFAULT_WIDTH = 480;

const ReportPreview: React.FC = () => {
  const { t } = useI18n();
  const { reports, activeReportId, isPreviewOpen, togglePreview, setActiveReport, saveAsTemplate } = useReportStore();
  const { paletteId, reportLayoutId, theme, reportPreviewWidth, setReportPreviewWidth } = useConfigStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [showSaveLayout, setShowSaveLayout] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const savedWidthRef = useRef(reportPreviewWidth ?? DEFAULT_WIDTH);
  const shellRef = useRef<HTMLIFrameElement>(null);
  const shellReadyRef = useRef(false);
  // Track previous layout to detect layout-specific changes
  const prevLayoutIdRef = useRef<string | undefined>(reportLayoutId);

  const activeReport = reports.find((r) => r.id === activeReportId);

  // Keep a ref with the latest render data so the shell-ready handler always sees fresh values
  const renderDataRef = useRef({ report: activeReport, paletteId, appTheme: theme, layoutId: reportLayoutId });
  renderDataRef.current = { report: activeReport, paletteId, appTheme: theme, layoutId: reportLayoutId };

  // Listen for shell-ready signal and errors from the report-shell iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'shell-ready') {
        shellReadyRef.current = true;
        const { report, paletteId: pid, appTheme, layoutId } = renderDataRef.current;
        if (report?.html && shellRef.current) {
          const paletteObj = PALETTE_PRESETS.find((p) => p.id === pid);
          const payload = buildRenderPayload(report.html, paletteObj, appTheme as 'light' | 'dark', layoutId ?? undefined);
          shellRef.current.contentWindow?.postMessage(payload, '*');
        }
      } else if (e.data?.type === 'report-error' && typeof e.data.message === 'string') {
        // ResizeObserver loop errors are a non-fatal browser quirk — suppress them from the UI
        if (!e.data.message.includes('ResizeObserver')) {
          setIframeError(e.data.message);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render when the active report changes
  useEffect(() => {
    if (!shellReadyRef.current || !activeReport?.html || !shellRef.current) return;
    const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
    const payload = buildRenderPayload(activeReport.html, paletteObj, theme as 'light' | 'dark', reportLayoutId ?? undefined);
    shellRef.current.contentWindow?.postMessage(payload, '*');
  }, [activeReport?.id, activeReport?.html]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update palette/layout/theme:
  // - Layout changes → full re-render (rebuilds srcdoc with correct layout CSS, avoids patchTheme timing issues)
  // - Palette/theme only → in-place patch (faster, no iframe reload)
  useEffect(() => {
    if (!shellReadyRef.current || !shellRef.current) return;
    const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
    const layoutChanged = prevLayoutIdRef.current !== reportLayoutId;
    prevLayoutIdRef.current = reportLayoutId;

    if (layoutChanged) {
      // Layout changed: do a full re-render so the new layout CSS is reliably applied
      const { report, paletteId: pid, appTheme, layoutId } = renderDataRef.current;
      if (report?.html) {
        const paletteForRender = PALETTE_PRESETS.find((p) => p.id === pid);
        const payload = buildRenderPayload(report.html, paletteForRender, appTheme as 'light' | 'dark', layoutId ?? undefined);
        shellRef.current.contentWindow?.postMessage(payload, '*');
      } else {
        // No report yet — still send theme-update to store the layout for when render fires
        const payload = buildThemeUpdatePayload(paletteObj, theme as 'light' | 'dark', reportLayoutId ?? undefined);
        shellRef.current.contentWindow?.postMessage(payload, '*');
      }
    } else {
      // Palette or dark-mode only — in-place patch (no iframe reload)
      const payload = buildThemeUpdatePayload(paletteObj, theme as 'light' | 'dark', reportLayoutId ?? undefined);
      shellRef.current.contentWindow?.postMessage(payload, '*');
    }
  }, [paletteId, reportLayoutId, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear iframe error when the active report changes
  useEffect(() => {
    setIframeError(null);
  }, [activeReport?.id]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = () => setExportMenuOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (saveTemplateOpen && activeReport) {
      setTemplateName(activeReport.title);
      setTemplateDesc('');
    }
  }, [saveTemplateOpen, activeReport]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth ?? savedWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Disable pointer events on the iframe so it doesn't capture mouse events during drag
    if (shellRef.current) shellRef.current.style.pointerEvents = 'none';

    let rafId = 0;
    // Debounce chart-resize during drag so charts adapt progressively
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const sendChartResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
      }, 80);
    };

    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const delta = startX - ev.clientX;
        const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
        savedWidthRef.current = newW;
        if (panelRef.current) panelRef.current.style.width = `${newW}px`;
        sendChartResize();
      });
    };
    const onUp = () => {
      cancelAnimationFrame(rafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Restore pointer events on iframe
      if (shellRef.current) shellRef.current.style.pointerEvents = '';
      // Multi-phase chart resize: immediate + delayed to cover CSS grid reflow + ApexCharts async layout
      shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
      requestAnimationFrame(() => {
        shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
        setTimeout(() => {
          shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
        }, 200);
      });
      // Full re-render after resize to ensure layout CSS + ECharts re-initialize at new container size.
      // chart-resize alone only calls .resize() on existing instances; a full render resets everything.
      setTimeout(() => {
        const { report, paletteId: pid, appTheme, layoutId } = renderDataRef.current;
        if (shellRef.current?.contentWindow && report?.html) {
          const paletteObj = PALETTE_PRESETS.find((p) => p.id === pid);
          const payload = buildRenderPayload(report.html, paletteObj, appTheme as 'light' | 'dark', layoutId ?? undefined);
          shellRef.current.contentWindow.postMessage(payload, '*');
        }
      }, 400);
      // L-03: Persist the new width so it survives app restarts
      setReportPreviewWidth(savedWidthRef.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (panelRef.current) {
        if (next) {
          panelRef.current.style.width = '';
        } else {
          panelRef.current.style.width = `${savedWidthRef.current}px`;
        }
      }
      // Multi-phase chart resize after fullscreen toggle for reliable adaptation
      setTimeout(() => {
        shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
        requestAnimationFrame(() => {
          shellRef.current?.contentWindow?.postMessage({ type: 'chart-resize' }, '*');
        });
      }, 100);
      return next;
    });
  }, []);

  // ── Edit mode handlers ─────────────────────────────────────────
  const { editing: isEditing, enterEditMode, exitEditMode, cancelEdit } = useLayoutEditorStore();

  /** Exit edit mode silently before starting any export to keep the output clean. */
  const ensureEditModeExited = useCallback(() => {
    if (isEditing) cancelEdit();
  }, [isEditing, cancelEdit]);

  const handleEnterEditMode = useCallback(() => {
    try {
      // report-shell.html uses a nested iframe: outer shell → inner #report-frame
      // We must access the INNER frame's document for card extraction
      const shellDoc = shellRef.current?.contentDocument;
      const innerFrame = shellDoc?.getElementById('report-frame') as HTMLIFrameElement | null;
      const innerDoc = innerFrame?.contentDocument ?? shellRef.current?.contentDocument;
      if (!innerDoc) {
        console.warn('[EditMode] Cannot access inner frame document');
        return;
      }
      const cards = extractCardsFromIframe(innerDoc);
      if (cards.length === 0) {
        console.warn('[EditMode] No cards found in report. DOM may not have .grid-charts or .zone-content selectors.');
        // Try a wider fallback - extract from any .card elements
        const fallbackCards = Array.from(innerDoc.querySelectorAll('.card[data-card-id], .card-kpi, .chart-card')).map((el, i) => ({
          cardId: el.getAttribute('data-card-id') || el.id || `card-${i}`,
          label: (el.querySelector('h3, h4, .card-title, .kpi-title, .kpi-label') as HTMLElement)?.innerText?.trim() || `卡片 ${i + 1}`,
          type: el.classList.contains('kpi-card') || el.classList.contains('card-kpi') ? 'kpi' as const : 'chart' as const,
          colStart: -1 as const,
          colSpan: 1,
          rowSpan: 'auto' as const,
          minHeight: 200,
        }));
        if (fallbackCards.length === 0) return;
        const gridCols = detectGridColumns(innerDoc);
        enterEditMode(fallbackCards, gridCols);
        return;
      }
      const gridCols = detectGridColumns(innerDoc);
      enterEditMode(cards, gridCols);
    } catch (e) {
      console.warn('[EditMode] Failed to extract cards:', e);
    }
  }, [enterEditMode]);

  const handleSaveLayout = useCallback((name: string) => {
    const { cards, gridColumns } = useLayoutEditorStore.getState();
    const layout: CustomLayout = {
      id: `custom-${Date.now()}`,
      name,
      createdAt: Date.now(),
      gridColumns,
      gridRowHeight: 'auto',
      cards: cards.map((c) => ({ ...c })),
      baseLayoutId: reportLayoutId ?? null,
    };
    // Persist to configStore
    const css = generateLayoutCSS(layout);
    useConfigStore.getState().addCustomLayout(layout);
    // Inject CSS and exit edit mode
    shellRef.current?.contentWindow?.postMessage({ type: 'inject-custom-css', css }, '*');
    exitEditMode();
    setShowSaveLayout(false);
  }, [reportLayoutId, exitEditMode]);

  const handleCancelEdit = useCallback(() => {
    // Remove injected CSS
    shellRef.current?.contentWindow?.postMessage({ type: 'inject-custom-css', css: '' }, '*');
    cancelEdit();
  }, [cancelEdit]);

  const handleDownloadHtml = useCallback(async () => {
    if (!activeReport) return;
    ensureEditModeExited();
    let finalHtml = activeReport.html;
    try {
      const layoutBasePath = 'layouts/_layout-base.css';
      const layoutPath = reportLayoutId ? `layouts/${reportLayoutId}.css` : null;
      // EXP-05 FIX: also read user's current theme CSS (not just base), matching preview appearance
      const themeVarPath = theme ? `themes/theme-${theme}.css` : null;

      const [echartsJs, apexchartsJs, themeBaseCss, themeVarCss, layoutBaseCss, layoutCss] = await Promise.all([
        window.electronAPI?.readVendorFile('echarts.min.js'),
        window.electronAPI?.readVendorFile('apexcharts.min.js'),
        window.electronAPI?.readStyleFile?.('themes/theme-base.css'),
        themeVarPath ? window.electronAPI?.readStyleFile?.(themeVarPath) : Promise.resolve(null),
        window.electronAPI?.readStyleFile?.(layoutBasePath),
        layoutPath ? window.electronAPI?.readStyleFile?.(layoutPath) : Promise.resolve(null),
      ]);
      // Strip CDN chart-lib script tags since we are inlining vendor JS
      const CDN_RE = /<script[^>]+src=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdn\.bootcdn\.net|cdnjs\.cloudflare\.com|staticfile\.org|echarts\.apache\.org)[^"']*["'][^>]*><\/script>/gi;
      finalHtml = finalHtml.replace(CDN_RE, () => '<!-- [export] CDN script replaced by inline vendor -->');

      const cssBlock = [
        themeBaseCss ? `<style id="__export-theme-base">\n${themeBaseCss}\n</style>` : '',
        themeVarCss  ? `<style id="__export-theme-var">\n${themeVarCss}\n</style>`   : '',
        layoutBaseCss ? `<style id="__export-layout-base">\n${layoutBaseCss}\n</style>` : '',
        layoutCss    ? `<style id="__export-layout">\n${layoutCss}\n</style>`        : '',
      ].filter(Boolean).join('\n');
      const jsBlock = [
        echartsJs    ? `<script>${echartsJs}</script>`    : '',
        apexchartsJs ? `<script>${apexchartsJs}</script>` : '',
      ].filter(Boolean).join('\n');
      const blocks = [cssBlock, jsBlock].filter(Boolean).join('\n');
      if (blocks) {
        if (finalHtml.includes('</head>')) {
          finalHtml = finalHtml.replace('</head>', () => `${blocks}\n</head>`);
        } else if (finalHtml.includes('<body')) {
          finalHtml = finalHtml.replace('<body', () => `${blocks}\n<body`);
        } else {
          finalHtml = `${blocks}\n${finalHtml}`;
        }
      }
    } catch { /* if IPC unavailable, download without injection */ }
    const blob = new Blob([finalHtml], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport.title}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setExportMenuOpen(false);
  }, [activeReport]);

  // HTML 交互式导出（含 DuckDB WASM + 联动引擎，保存为 HTML + assets 文件夹）
  const handleExportHtmlInteractive = useCallback(async () => {
    if (!activeReport || isExporting) return;
    ensureEditModeExited();
    setIsExporting('html-interactive');
    setExportMenuOpen(false);
    try {
      const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
      await window.electronAPI?.exportHtmlBundle?.({
        html: activeReport.html,
        title: activeReport.title,
        mode: 'interactive',
        themeId: theme,
        layoutId: reportLayoutId ?? undefined,
        palette: paletteObj ? { primary: paletteObj.primary, colors: paletteObj.colors, bodyBg: paletteObj.bodyBg, cardBg: paletteObj.cardBg, textColor: paletteObj.textColor, subTextColor: paletteObj.subTextColor, isDark: paletteObj.isDark } : undefined,
      });
    } finally {
      setIsExporting(null);
    }
  }, [activeReport, isExporting, ensureEditModeExited, paletteId]);

  // HTML 轻量静态导出（仅联动引擎，无 DuckDB）
  const handleExportHtmlStatic = useCallback(async () => {
    if (!activeReport || isExporting) return;
    ensureEditModeExited();
    setIsExporting('html-static');
    setExportMenuOpen(false);
    try {
      const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
      await window.electronAPI?.exportHtmlBundle?.({
        html: activeReport.html,
        title: activeReport.title,
        mode: 'static',
        themeId: theme,
        layoutId: reportLayoutId ?? undefined,
        palette: paletteObj ? { primary: paletteObj.primary, colors: paletteObj.colors, bodyBg: paletteObj.bodyBg, cardBg: paletteObj.cardBg, textColor: paletteObj.textColor, subTextColor: paletteObj.subTextColor, isDark: paletteObj.isDark } : undefined,
      });
    } finally {
      setIsExporting(null);
    }
  }, [activeReport, isExporting, ensureEditModeExited, paletteId]);

  const handleDownloadPdf = useCallback(async () => {
    if (!activeReport || isExporting) return;
    ensureEditModeExited();
    setIsExporting('pdf');
    setExportMenuOpen(false);
    try {
      // EXP-01 FIX: pass current theme/layout so PDF uses the correct visual theme
      // THEME-HDR FIX: pass palette so header background uses the active palette primary color
      const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
      await window.electronAPI?.savePdf({
        html: activeReport.html,
        title: activeReport.title,
        themeId: theme,
        layoutId: reportLayoutId ?? 'default',
        palette: paletteObj ? { primary: paletteObj.primary, colors: paletteObj.colors, bodyBg: paletteObj.bodyBg, cardBg: paletteObj.cardBg, textColor: paletteObj.textColor, subTextColor: paletteObj.subTextColor, isDark: paletteObj.isDark } : undefined,
      });
    } finally {
      setIsExporting(null);
    }
  }, [activeReport, isExporting, ensureEditModeExited, theme, reportLayoutId, paletteId]);

  const handleScreenshot = useCallback(async () => {
    if (!activeReport || isExporting) return;
    ensureEditModeExited();
    setIsExporting('screenshot');
    setExportMenuOpen(false);
    try {
      // EXP-01 FIX: pass current theme/layout so screenshot uses the correct visual theme
      // THEME-HDR FIX: pass palette so header background uses the active palette primary color
      const paletteObj = PALETTE_PRESETS.find((p) => p.id === paletteId);
      await window.electronAPI?.captureReport({
        html: activeReport.html,
        title: activeReport.title,
        themeId: theme,
        layoutId: reportLayoutId ?? 'default',
        palette: paletteObj ? { primary: paletteObj.primary, colors: paletteObj.colors, bodyBg: paletteObj.bodyBg, cardBg: paletteObj.cardBg, textColor: paletteObj.textColor, subTextColor: paletteObj.subTextColor, isDark: paletteObj.isDark } : undefined,
      });
    } finally {
      setIsExporting(null);
    }
  }, [activeReport, isExporting, ensureEditModeExited, theme, reportLayoutId, paletteId]);

  const handleConvertToPPT = useCallback(async () => {
    if (!activeReport) return;
    setExportMenuOpen(false);
    // Build a prompt that gives the AI the report title and instructs it to
    // regenerate as a presentation using the generate_slide built-in tool.
    const prompt =
      `请将当前报告《${activeReport.title}》转换为 PPT 演示文稿。\n` +
      `要求：\n` +
      `1. 使用 generate_slide 工具生成幻灯片。\n` +
      `2. 每张幻灯片对应报告中的一个核心章节或关键数据。\n` +
      `3. 风格专业简洁，可用内联 SVG 图标增强视觉效果。\n` +
      `4. 宽高比 16:9（1280×720px）。`;
    useChatStore.getState().sendMessage(prompt, []);
  }, [activeReport]);

  const handleExportExcel = useCallback(async () => {
    if (!activeReport || isExporting) return;
    ensureEditModeExited();
    setIsExporting('excel');
    setExportMenuOpen(false);
    try {
      const result = await window.electronAPI?.fsExportExcel(activeReport.html, activeReport.title);
      if (result && !result.ok && result.message) {
        alert(result.message);
      }
    } finally {
      setIsExporting(null);
    }
  }, [activeReport, isExporting, ensureEditModeExited]);

  const handleSaveTemplate = useCallback(async () => {
    if (!activeReport || !templateName.trim() || isSavingTemplate) return;
    setIsSavingTemplate(true);
    try {
      await saveAsTemplate(activeReport.id, templateName.trim(), templateDesc.trim() || undefined);
      setSaveTemplateOpen(false);
    } finally {
      setIsSavingTemplate(false);
    }
  }, [activeReport, templateName, templateDesc, isSavingTemplate, saveAsTemplate]);

  if (!isPreviewOpen || !activeReport) return null;

  return (
    <div
      ref={panelRef}
      className={`flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${
        isFullscreen ? 'fixed inset-0 z-40' : 'relative flex-shrink-0 w-[480px]'
      }`}
    >
      {/* Drag-resize handle */}
      {!isFullscreen && (
        <div
          onMouseDown={startResize}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center group"
          title={t.reportPreview.dragWidth}
        >
          <div className="w-0.5 h-12 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-400 group-hover:h-20 transition-all duration-150" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-gray-200 dark:border-gray-700 min-h-[44px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate" title={activeReport.title}>
            {activeReport.title}
          </h3>
          {reports.length > 1 && (
            <select
              value={activeReportId || ''}
              onChange={(e) => setActiveReport(e.target.value)}
              title={t.reportPreview.switchReport}
              className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 outline-none max-w-[100px] flex-shrink-0"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Edit mode controls */}
          {isEditing ? (
            <>
              <button
                onClick={() => setShowSaveLayout(true)}
                title={t.reportPreview.saveLayout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                <Save size={13} />
                <span>{t.reportPreview.save}</span>
              </button>
              <button
                onClick={handleCancelEdit}
                title={t.reportPreview.cancelEdit}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Undo2 size={13} />
                <span>{t.reportPreview.cancel}</span>
              </button>
            </>
          ) : (
            activeReport && (
              <button
                onClick={handleEnterEditMode}
                title={t.reportPreview.editLayout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil size={13} />
                <span>{t.reportPreview.edit}</span>
              </button>
            )
          )}

          {/* Save as Template button */}
          <button
            onClick={(e) => { e.stopPropagation(); setSaveTemplateOpen(true); }}
            title={t.reportPreview.saveAsTemplate}
            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <BookmarkPlus size={14} />
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setExportMenuOpen((v) => !v); }}
              disabled={!!isExporting}
              title={t.reportPreview.exportReport}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 transition-colors"
            >
              {isExporting ? (
                <span className="text-blue-500 text-xs">
                  {isExporting === 'pdf' ? t.reportPreview.exportingPdf : isExporting === 'screenshot' ? t.reportPreview.exportingScreenshot : isExporting === 'excel' ? t.reportPreview.exportingExcel : isExporting === 'html-interactive' ? t.reportPreview.exportingHtml : isExporting === 'html-static' ? t.reportPreview.exportingHtml : t.reportPreview.exportingInProgress}
                </span>
              ) : (
                <>
                  <Download size={13} />
                  <span>{t.reportPreview.export}</span>
                  <ChevronDown size={10} />
                </>
              )}
            </button>
            {exportMenuOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden">
                <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">{t.reportPreview.selectFormat}</div>
                {/* ── HTML 导出区 ── */}
                <button
                  onClick={handleExportHtmlInteractive}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  <Globe size={15} className="flex-shrink-0 text-blue-500" />
                  <div>
                    <div className="font-medium">{t.reportPreview.htmlInteractive}</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.htmlInteractiveDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleExportHtmlStatic}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  <Globe size={15} className="flex-shrink-0 text-sky-400" />
                  <div>
                    <div className="font-medium">{t.reportPreview.htmlLight}</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.htmlLightDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleDownloadHtml}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  <FileText size={15} className="flex-shrink-0 text-gray-400" />
                  <div>
                    <div className="font-medium">{t.reportPreview.htmlInline}</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.htmlInlineDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  <FileText size={15} className="flex-shrink-0 text-red-500" />
                  <div>
                    <div className="font-medium">PDF</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.pdfDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleScreenshot}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                >
                  <Image size={15} className="flex-shrink-0 text-green-500" />
                  <div>
                    <div className="font-medium">{t.reportPreview.image}</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.imageDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <BarChart2 size={15} className="flex-shrink-0 text-emerald-600" />
                  <div>
                    <div className="font-medium">Excel</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.excelDesc}</div>
                  </div>
                </button>
                <button
                  onClick={handleConvertToPPT}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <Film size={15} className="flex-shrink-0 text-purple-500" />
                  <div>
                    <div className="font-medium">PPT</div>
                    <div className="text-xs text-gray-400">{t.reportPreview.pptDesc}</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Layout quick toggle */}
          <LayoutQuickToggle currentLayoutId={reportLayoutId} onSelect={(id) => useConfigStore.getState().setReportLayoutId(id)} />

          {/* Palette quick toggle */}
          <PaletteQuickToggle currentPaletteId={paletteId} onSelect={(id) => useConfigStore.getState().setPaletteId(id)} />

          <button
            onClick={handleFullscreen}
            title={isFullscreen ? t.reportPreview.exitFullscreen : t.reportPreview.fullscreen}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={() => togglePreview(false)}
            title={t.reportPreview.closePreview}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Error banner (from iframe postMessage) */}
      {iframeError && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/40 text-xs text-red-700 dark:text-red-300 shrink-0">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">{t.reportPreview.renderError}</span>
            <span className="font-mono break-all">{iframeError}</span>
          </div>
          <button onClick={() => setIframeError(null)} title={t.reportPreview.cancel} className="shrink-0 text-red-400 hover:text-red-600">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Shell iframe — stable URL, receives render/theme commands via postMessage */}
      <div className="flex-1 overflow-hidden relative">
        <iframe
          ref={shellRef}
          src={SHELL_URL}
          className={`w-full h-full border-none transition-opacity ${isEditing ? 'opacity-20 pointer-events-none' : ''}`}
          sandbox="allow-scripts allow-same-origin"
          title="report-shell"
        />
        {/* Layout Editor overlay (edit mode) */}
        <LayoutEditor shellRef={shellRef} />
      </div>

      {/* Save Layout Dialog (edit mode) */}
      {showSaveLayout && (
        <SaveLayoutDialog
          onSave={handleSaveLayout}
          onCancel={() => setShowSaveLayout(false)}
          defaultName={activeReport?.title ? `${activeReport.title}${t.reportPreview.customLayoutSuffix}` : undefined}
        />
      )}

      {/* Save as Template Modal */}
      {saveTemplateOpen && (
        <div
          className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={() => setSaveTemplateOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-80 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base mb-1">{t.reportPreview.saveTemplateDlgTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{t.reportPreview.saveTemplateDlgDesc}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t.reportPreview.templateNameLabel}</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t.reportPreview.templateNamePlaceholder}
                  className="mt-1 w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t.reportPreview.templateDescLabel}</label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder={t.reportPreview.templateDescPlaceholder}
                  className="mt-1 w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setSaveTemplateOpen(false)}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t.reportPreview.cancel}
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || isSavingTemplate}
                className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40"
              >
                {isSavingTemplate ? t.reportPreview.savingTemplate : t.reportPreview.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportPreview;

/* ---- Palette Quick Toggle (shown in ReportPreview header toolbar) ---- */
interface PaletteQuickToggleProps {
  currentPaletteId: string;
  onSelect: (id: string) => void;
}

const PaletteQuickToggle: React.FC<PaletteQuickToggleProps> = ({ currentPaletteId, onSelect }) => {
  const { t } = useI18n();
  const { language } = useConfigStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const currentPalette = PALETTE_PRESETS.find((p) => p.id === currentPaletteId) ?? PALETTE_PRESETS[0];
  const enN = (id: string, fb: string) => language === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredPalettes = search.trim()
    ? PALETTE_PRESETS.filter((p) => {
        const q = search.trim().toLowerCase();
        return p.name.toLowerCase().includes(q) || enN(p.id, p.name).toLowerCase().includes(q);
      })
    : PALETTE_PRESETS;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={t.reportPreview.switchPalette}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
      >
        <Palette size={13} />
        <span className="hidden sm:inline max-w-[60px] truncate">{enN(currentPalette.id, currentPalette.name)}</span>
        <ChevronDown size={9} />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-50 min-w-[180px] max-h-[380px] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky header with title + search */}
          <div className="px-3 pt-2 pb-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-1.5">
            <div className="text-xs text-gray-400 font-medium">{t.reportPreview.paletteTitle}</div>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.reportPreview.searchPalette}
                autoFocus
                className="w-full text-xs pl-6 pr-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500"
              />
            </div>
          </div>
          {/* Scrollable palette list */}
          <div className="overflow-y-auto flex-1">
            {filteredPalettes.length > 0 ? filteredPalettes.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                  p.id === currentPaletteId
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="flex gap-0.5">
                  {p.colors.slice(0, 3).map((c, i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
                <span>{enN(p.id, p.name)}</span>
              </button>
            )) : (
              <div className="px-3 py-4 text-xs text-center text-gray-400">{t.reportPreview.noMatchPalette}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---- Layout Quick Toggle (shown in ReportPreview header toolbar) ---- */
interface LayoutQuickToggleProps {
  currentLayoutId: string | undefined;
  onSelect: (id: string | undefined) => void;
}

const LayoutQuickToggle: React.FC<LayoutQuickToggleProps> = ({ currentLayoutId, onSelect }) => {
  const { t } = useI18n();
  const { language } = useConfigStore();
  const [open, setOpen] = useState(false);
  const currentLayout = REPORT_LAYOUTS.find((l) => l.id === currentLayoutId);
  const enN = (id: string, fb: string) => language === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;

  // Chinese category label → localized display name
  const catDisplayName = (cat: string): string => ({
    '通用': t.settings.layoutCatUniversal,
    '财务': t.settings.layoutCatFinance,
    '电商': t.settings.layoutCatEcommerce,
    '运营': t.settings.layoutCatOperations,
    '销售': t.settings.layoutCatSales,
    'HR': 'HR',
    '营销': t.settings.layoutCatMarketing,
    '物流': t.settings.layoutCatLogistics,
    '医疗': t.settings.layoutCatMedical,
    '编辑': t.settings.layoutCatEditorial,
  }[cat] ?? cat);

  // Build lookup: layout id → previewType (from LAYOUT_MANIFEST)
  const previewTypeMap = React.useMemo(() => {
    const map = new Map<string, import('../utils/layoutManifest').LayoutPreviewType>();
    for (const item of LAYOUT_MANIFEST) map.set(item.id, item.previewType);
    return map;
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  // Group layouts by category
  const grouped = REPORT_LAYOUTS.reduce<Record<string, ReportLayout[]>>((acc, l) => {
    if (!acc[l.category]) acc[l.category] = [];
    acc[l.category].push(l);
    return acc;
  }, {});

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={t.reportPreview.switchLayout}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
      >
        <LayoutGrid size={13} />
        <span className="hidden sm:inline max-w-[60px] truncate">{currentLayout ? enN(currentLayout.id, currentLayout.name) : t.reportPreview.defaultLayout}</span>
        <ChevronDown size={9} />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-50 min-w-[220px] max-h-[480px] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">{t.reportPreview.layoutTitle}</div>
          {/* None option */}
          <button
            onClick={() => { onSelect(undefined); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
              !currentLayoutId
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
              <span className="w-10 h-7 flex-shrink-0 rounded border border-dashed border-gray-400 flex items-center justify-center text-[9px] text-gray-400">{t.reportPreview.defaultLayoutOption}</span>
              <span>{t.reportPreview.defaultLayoutDesc}</span>
          </button>
          {/* Grouped options */}
          {Object.entries(grouped).map(([cat, layouts]) => (
            <div key={cat}>
              <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 dark:bg-gray-750 font-medium">{catDisplayName(cat)}</div>
              {layouts.map((l) => {
                const pt = previewTypeMap.get(l.id) ?? '2col';
                return (
                  <button
                    key={l.id}
                    onClick={() => { onSelect(l.id); setOpen(false); }}
                    title={l.description}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2.5 transition-colors ${
                      l.id === currentLayoutId
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex-shrink-0 w-10 h-7 rounded overflow-hidden border border-gray-200 dark:border-gray-600">
                      <SvgWireframe previewType={pt} width={40} height={28} />
                    </div>
                    <span className="truncate">{enN(l.id, l.name)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
