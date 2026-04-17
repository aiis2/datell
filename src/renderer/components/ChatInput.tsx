import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Square, ChevronDown, ChevronRight, BookOpen, X, Lock, CheckCircle2, Loader2, AlertCircle, ListTodo, Database, Palette, Layers, Bookmark } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useConfigStore } from '../stores/configStore';
import { useReportStore } from '../stores/reportStore';
import { useDatasourceStore } from '../stores/datasourceStore';
import { useI18n } from '../i18n';
import { parseUploadedFile, estimateTokens } from '../services/fileParser';
import FilePreview from './FilePreview';
import { useSubagentStore } from '../stores/subagentStore';
import type { FileAttachment, ActivationStatus } from '../types';
import { PALETTE_PRESETS } from '../types';
import { LAYOUT_MANIFEST, LAYOUT_CATEGORIES, CATEGORY_DISPLAY_NAMES } from '../utils/layoutManifest';
import { CONTENT_EN_NAMES } from '../i18n/contentEN';
import { BUILT_IN_PRESETS } from '../types/reportPresets';

const ACCEPTED_TYPES = '.xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.json,.md,.eml';

interface ChatInputProps {
  activationStatus?: ActivationStatus | null;
  onNeedActivation?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ activationStatus, onNeedActivation }) => {
  const { t, lang } = useI18n();
  const enN = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dsMenuOpen, setDsMenuOpen] = useState(false);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [layoutSearch, setLayoutSearch] = useState('');
  const [layoutCatFilter, setLayoutCatFilter] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sendMessage, isStreaming, stopStreaming } = useChatStore();
  const { models: allModels, activeModelId, setActiveModel, paletteId, reportLayoutId, setPaletteId, setReportLayoutId, customPalettes, activePresetId, setActivePresetId, setSettingsOpen, enterprisePluginAvailable } = useConfigStore();
  // Hide locked enterprise models when plugin is not loaded (open-source mode)
  const models = allModels.filter((m) => !m.locked || enterprisePluginAvailable);
  const { templates, selectedTemplateId, setSelectedTemplate } = useReportStore();
  const { datasources, activeDatasourceId, setActiveDatasource, loadDatasources } = useDatasourceStore();

  const activeModel = models.find((m) => m.id === activeModelId);
  const activeDatasource = activeDatasourceId ? datasources.find((d) => d.id === activeDatasourceId) : undefined;

  // Load datasources on mount
  useEffect(() => { loadDatasources(); }, [loadDatasources]);

  // Listen for scenario-card draft fills from EmptyState
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        setText(detail.text);
        setTimeout(() => { textareaRef.current?.focus(); }, 0);
      }
    };
    window.addEventListener('set-chat-draft', handler);
    return () => window.removeEventListener('set-chat-draft', handler);
  }, []);

  // Per-tier activation gate for locked enterprise models
  const isProActivated = !!(activationStatus?.activated && activationStatus?.isPro === true);
  const isBasicActivated = !!(activationStatus?.activated && activationStatus?.isPro === false);
  const isModelAccessible = (m: typeof activeModel) => {
    if (!m?.locked) return true;
    if (m.lockedTier === 'pro') return isProActivated;
    if (m.lockedTier === 'basic') return isBasicActivated;
    return true;
  };
  // Only show banner when we have a definitive status (not null/loading)
  const needsActivation = !!(activeModel?.locked) && activationStatus !== null && !isModelAccessible(activeModel);

  useEffect(() => {
    if (!dsMenuOpen && !paletteMenuOpen && !layoutMenuOpen) return;
    const handler = () => { setDsMenuOpen(false); setPaletteMenuOpen(false); setLayoutMenuOpen(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [dsMenuOpen, paletteMenuOpen, layoutMenuOpen]);

  const allPalettes = [...PALETTE_PRESETS, ...customPalettes];
  const currentPalette = allPalettes.find((p) => p.id === paletteId);
  const currentLayout = LAYOUT_MANIFEST.find((l) => l.id === reportLayoutId);

  const layoutCatNames: Record<string, string> = {
    universal: t.settings.layoutCatUniversal,
    finance: t.settings.layoutCatFinance,
    ecommerce: t.settings.layoutCatEcommerce,
    operations: t.settings.layoutCatOperations,
    sales: t.settings.layoutCatSales,
    hr: 'HR',
    marketing: t.settings.layoutCatMarketing,
    logistics: t.settings.layoutCatLogistics,
    medical: t.settings.layoutCatMedical,
    editorial: t.settings.layoutCatEditorial,
  };

  const filteredPalettes = allPalettes.filter((p) => {
    if (!paletteSearch) return true;
    return p.name.toLowerCase().includes(paletteSearch.toLowerCase());
  });

  const filteredLayouts = LAYOUT_MANIFEST.filter((l) => {
    const matchCat = !layoutCatFilter || l.category === layoutCatFilter;
    if (!matchCat) return false;
    if (!layoutSearch) return true;
    const q = layoutSearch.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q);
  });

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const parsed: FileAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const attachment = await parseUploadedFile(file);
        // Context limit validation
        const maxCtx = activeModel?.maxContextTokens;
        if (maxCtx && maxCtx > 0 && attachment.textContent) {
          const estTokens = estimateTokens(attachment.textContent);
          const limitTokens = Math.floor(maxCtx * 0.8);
          if (estTokens > limitTokens) {
            alert(
              t.chatInput.fileTooLarge
                .replace('{tokens}', String(Math.round(estTokens / 1000)))
                .replace('{limit}', String(Math.round(limitTokens / 1000)))
                .replace('{name}', file.name)
            );
            continue; // skip this file
          }
        }
        parsed.push(attachment);
      } catch (err) {
        console.error('File parse error:', err);
      }
    }
    setAttachments((prev) => [...prev, ...parsed]);
  }, [activeModel]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isStreaming) return;

    // Intercept: locked model requires activation
    if (needsActivation) {
      onNeedActivation?.();
      return;
    }

    const currentAttachments = [...attachments];
    setText('');
    setAttachments([]);

    await sendMessage(trimmed, currentAttachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const pastedFiles = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);

    if (pastedFiles.length === 0) {
      return;
    }

    e.preventDefault();
    void handleFiles(pastedFiles);

    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      setText((prev) => prev + pastedText);
    }
  }, [handleFiles]);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Activation banner — shown when locked model is selected but not yet activated */}
      {needsActivation && (
        <div className="mb-3 flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-2.5">
          <Lock size={13} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">
            {t.chatInput.activationRequired}
          </span>
          <button
            onClick={() => onNeedActivation?.()}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex-shrink-0 underline underline-offset-2"
          >
            {t.chatInput.activateNow} →
          </button>
        </div>
      )}
      <div
        className={`rounded-2xl border transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {/* Attached files preview */}
        {attachments.length > 0 && (
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <FilePreview key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
            ))}
          </div>
        )}

        {isDragging && (
          <div className="px-4 py-3 text-sm text-blue-500 text-center">
            {t.chatInput.uploadFile}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent border-none outline-none resize-none px-4 py-3 text-sm placeholder-gray-400"
          placeholder={activeDatasource ? `[${activeDatasource.name}] ${t.chatInput.placeholder}` : t.chatInput.placeholder}
          rows={1}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={isStreaming}
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-2">
            {/* File upload */}
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              title={t.chatInput.uploadFile}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_TYPES}
              multiple
              aria-label={t.chatInput.uploadFile}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />

            {/* Report style selector: persistent active-style chip */}
            {/* Preset chip: show active preset name, click opens settings */}
            {activePresetId && (() => {
              const preset = BUILT_IN_PRESETS.find((p) => p.id === activePresetId);
              return preset ? (
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300/50">
                  <Bookmark size={12} />
                  <button
                    onClick={() => setSettingsOpen(true)}
                    title={`${t.chatInput.currentPresetPrefix}${preset.name}${t.chatInput.currentPresetSuffix}`}
                    className="max-w-[80px] truncate hover:underline"
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => setActivePresetId(undefined)}
                    title={t.chatInput.clearPreset}
                    className="ml-0.5 p-0.5 hover:text-red-500 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : null;
            })()}
            {/* Datasource selector */}
            {datasources.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setDsMenuOpen((v) => !v); }}
                  title={activeDatasource ? `${t.chatInput.currentDatasourcePrefix}${activeDatasource.name}${t.chatInput.currentDatasourceSuffix}` : t.chatInput.datasourceSelectTitle}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeDatasource
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 ring-1 ring-emerald-400/40'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                  }`}
                >
                  <Database size={14} />
                  <span className="max-w-[100px] truncate">
                    {activeDatasource ? `✓ ${activeDatasource.name}` : t.chatInput.selectDatasource}
                  </span>
                </button>
                {dsMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-50 min-w-[220px] max-w-[300px] overflow-hidden">
                    <div className="px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-700">
                      {activeDatasource ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.chatInput.currentDatasourceLabel}{activeDatasource.name}</span>
                      ) : (
                        <span className="text-gray-400">{t.chatInput.datasourceHint}</span>
                      )}
                    </div>
                    {datasources.map((ds) => {
                      const isActive = activeDatasourceId === ds.id;
                      return (
                        <button
                          key={ds.id}
                          onClick={() => { setActiveDatasource(isActive ? null : ds.id); setDsMenuOpen(false); setTimeout(() => textareaRef.current?.focus(), 0); }}
                          className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2 ${
                            isActive ? 'bg-emerald-50 dark:bg-emerald-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className={`mt-0.5 w-4 flex-shrink-0 text-sm ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-transparent'}`}>✓</span>
                          <div className="min-w-0">
                            <div className={`text-sm font-medium truncate ${isActive ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{ds.name}</div>
                            <div className="text-xs text-gray-400 truncate">{ds.type} · {ds.host}:{ds.port}/{ds.database}</div>
                          </div>
                        </button>
                      );
                    })}
                    {activeDatasourceId && (
                      <button
                        onClick={() => { setActiveDatasource(null); setDsMenuOpen(false); setTimeout(() => textareaRef.current?.focus(), 0); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-100 dark:border-gray-700 transition-colors flex items-center gap-1.5"
                      >
                        <span className="text-base leading-none">✕</span>
                        {t.chatInput.cancelDatasource}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Selected Template indicator */}
            {templates.length > 0 && selectedTemplateId && (() => {
              const tpl = templates.find((t) => t.id === selectedTemplateId);
              return tpl ? (
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300/50">
                  <BookOpen size={12} />
                  <span className="max-w-[90px] truncate">{tpl.templateName}</span>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    title={t.chatInput.cancelTemplate}
                    className="ml-0.5 p-0.5 hover:text-red-500 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : null;
            })()}

            {/* Palette quick-select chip */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setPaletteMenuOpen((v) => !v); setLayoutMenuOpen(false); }}
                title={currentPalette ? `${t.chatInput.currentPalettePrefix}${enN(currentPalette.id, currentPalette.name)}` : t.chatInput.selectPalette}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentPalette
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 ring-1 ring-violet-400/40'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                }`}
              >
                {currentPalette ? (
                  <>
                    <span className="flex gap-0.5">
                      {currentPalette.colors.slice(0, 3).map((c, i) => (
                        <span key={i} className="w-2.5 h-2.5 rounded-full border border-white/50" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="max-w-[56px] truncate">{enN(currentPalette.id, currentPalette.name)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={t.chatInput.clearPalette}
                      onClick={(e) => { e.stopPropagation(); setPaletteId('palette-classic'); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setPaletteId('palette-classic'); } }}
                      className="ml-0.5 p-0.5 hover:text-red-500 cursor-pointer"
                    >
                      <X size={9} />
                    </span>
                  </>
                ) : (
                  <>
                    <Palette size={13} />
                    <span>{t.chatInput.paletteLabel}</span>
                  </>
                )}
              </button>
              {paletteMenuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-50 w-72 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <input
                      type="text"
                      value={paletteSearch}
                      onChange={(e) => setPaletteSearch(e.target.value)}
                      placeholder={t.chatInput.searchPaletteInput}
                      autoFocus
                      className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filteredPalettes.map((p) => {
                      const isActive = paletteId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => { setPaletteId(p.id); setPaletteMenuOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                            isActive ? 'bg-violet-50 dark:bg-violet-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="flex gap-0.5 flex-shrink-0">
                            {p.colors.slice(0, 4).map((c, i) => (
                              <span key={i} className="w-4 h-4 rounded-full border border-white/40" style={{ background: c }} />
                            ))}
                          </span>
                          <span className="text-xs flex-1 truncate">{enN(p.id, p.name)}</span>
                          {isActive && <span className="text-[10px] text-violet-600 dark:text-violet-400 flex-shrink-0">✓</span>}
                        </button>
                      );
                    })}
                    {filteredPalettes.length === 0 && (
                      <div className="py-4 text-center text-xs text-gray-400">{t.chatInput.searchPalette}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Layout quick-select chip */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setLayoutMenuOpen((v) => !v); setPaletteMenuOpen(false); }}
                title={currentLayout ? `${t.chatInput.currentLayoutPrefix}${enN(currentLayout.id, currentLayout.name)}` : t.chatInput.selectLayout}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentLayout
                    ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-200 ring-1 ring-sky-400/40'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                }`}
              >
                <Layers size={13} />
                <span className="max-w-[64px] truncate">
                  {currentLayout ? enN(currentLayout.id, currentLayout.name) : t.chatInput.layoutLabel}
                </span>
                {currentLayout && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t.chatInput.clearLayout}
                    onClick={(e) => { e.stopPropagation(); setReportLayoutId(undefined); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setReportLayoutId(undefined); } }}
                    className="ml-0.5 p-0.5 hover:text-red-500 cursor-pointer"
                  >
                    <X size={9} />
                  </span>
                )}
              </button>
              {layoutMenuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-50 w-80 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 space-y-1.5">
                    <input
                      type="text"
                      value={layoutSearch}
                      onChange={(e) => setLayoutSearch(e.target.value)}
                      placeholder={t.chatInput.searchLayoutInput}
                      autoFocus
                      className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setLayoutCatFilter('')}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${!layoutCatFilter ? 'bg-sky-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200'}`}
                      >{t.chatInput.allLayouts}</button>
                      {LAYOUT_CATEGORIES.slice(0, 6).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setLayoutCatFilter(cat === layoutCatFilter ? '' : cat)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${layoutCatFilter === cat ? 'bg-sky-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {layoutCatNames[cat] ?? (CATEGORY_DISPLAY_NAMES[cat] || cat)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredLayouts.map((l) => {
                      const isActive = reportLayoutId === l.id;
                      return (
                        <button
                          key={l.id}
                          onClick={() => { setReportLayoutId(isActive ? undefined : l.id); setLayoutMenuOpen(false); }}
                          className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                            isActive ? 'bg-sky-50 dark:bg-sky-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className={`mt-0.5 flex-shrink-0 text-xs ${isActive ? 'text-sky-600 dark:text-sky-400' : 'text-transparent'}`}>✓</span>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-medium truncate ${isActive ? 'text-sky-700 dark:text-sky-300' : ''}`}>{enN(l.id, l.name)}</div>
                            {l.description && <div className="text-[10px] text-gray-400 truncate">{l.description}</div>}
                          </div>
                        </button>
                      );
                    })}
                    {filteredLayouts.length === 0 && (
                      <div className="py-4 text-center text-xs text-gray-400">{t.chatInput.searchLayout}</div>
                    )}
                    {reportLayoutId && (
                      <button
                        onClick={() => { setReportLayoutId(undefined); setLayoutMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-100 dark:border-gray-700 transition-colors flex items-center gap-1.5"
                      >
                        <X size={11} /> {t.chatInput.cancelLayoutDefault}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Model selector */}
            <div className="relative">
              <select
                value={activeModelId}
                onChange={(e) => setActiveModel(e.target.value)}
                title={t.chatInput.selectModel}
                className="appearance-none bg-gray-100 dark:bg-gray-700 text-xs rounded-lg pl-3 pr-7 py-1.5 outline-none cursor-pointer border-none text-gray-700 dark:text-gray-300"
              >
                {models.map((m) => {
                  const accessible = isModelAccessible(m);
                  return (
                    <option key={m.id} value={m.id} disabled={!accessible}>
                      {m.name}{!accessible && m.locked ? ` (${t.chatInput.notActivated})` : ''}
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>

            {activeModel && !activeModel.apiKey && (
              <span className="text-xs text-amber-500">{t.chatInput.noApiKey}</span>
            )}
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              title={t.chatInput.stopStreaming}
              className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() && attachments.length === 0}
              title={t.chatInput.sendMessage}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   VS Code Copilot–style Agent Todo Panel
   Shows above the input area during streaming when run_subagent tasks exist
───────────────────────────────────────────────────────────── */
const AgentTodoPanel: React.FC = () => {
  const { todos } = useSubagentStore();
  const { isStreaming } = useChatStore();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [visible, setVisible] = useState(true);

  // Fully hide 2s after all tasks finish
  useEffect(() => {
    if (todos.length === 0) return;
    const allDone = todos.every((t) => t.status === 'done' || t.status === 'error');
    if (!allDone) return;
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [todos]);

  // Re-show and re-expand when new tasks arrive
  useEffect(() => {
    if (todos.length > 0) { setVisible(true); setExpanded(true); }
  }, [todos.length]);

  if (!visible) return null;
  if (!isStreaming && todos.length === 0) return null;
  if (todos.length === 0) return null;

  const doneCount = todos.filter((t) => t.status === 'done').length;
  const errorCount = todos.filter((t) => t.status === 'error').length;

  const statusIcon = (status: string) => {
    if (status === 'done') return <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />;
    if (status === 'error') return <AlertCircle size={13} className="text-red-400 flex-shrink-0" />;
    if (status === 'running') return <Loader2 size={13} className="text-blue-400 animate-spin flex-shrink-0" />;
    return <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />;
  };

  return (
    <div className="mb-2 rounded-xl border border-blue-200/70 dark:border-blue-700/40 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors select-none"
      >
        <ListTodo size={12} className="text-blue-500 flex-shrink-0" />
        <span className="font-medium text-blue-700 dark:text-blue-300 flex-1">
          {t.chatInput.subtaskProgress}
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-[11px] mr-1">
          {doneCount + errorCount}/{todos.length} {t.chatInput.subtaskDone}
        </span>
        {expanded
          ? <ChevronDown size={12} className="text-gray-400" />
          : <ChevronRight size={12} className="text-gray-400" />}
      </button>
      {/* Task list */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-2">
              {statusIcon(todo.status)}
              <span className={`text-[12px] truncate ${
                todo.status === 'done'
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : todo.status === 'error'
                  ? 'text-red-500 dark:text-red-400'
                  : todo.status === 'running'
                  ? 'text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>{todo.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatInput;
