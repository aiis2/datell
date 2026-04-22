import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Edit2, Check, ToggleLeft, ToggleRight, RefreshCw, RotateCcw, User, ShieldCheck, AlertCircle, Lock, Copy, ShieldAlert, Loader2, Palette, Paintbrush, Layers, Network, Library, GitMerge, Brain, ChevronDown, ChevronRight, FolderOpen, HardDrive, Wrench, Code2, Cpu, FileText, Image, Search, BookImage, Upload, Database, CheckCircle2, XCircle, Plug, ZapOff, BookOpen, Link2, ArrowRight, Boxes, Share2, Maximize2, ZoomIn, ZoomOut, BarChart2, LayoutTemplate, CreditCard, Bookmark, Download, Activity, Globe } from 'lucide-react';
import { useConfigStore } from '../stores/configStore';
import { useI18n } from '../i18n';
import { useSystemStore } from '../stores/systemStore';
import { useDatasourceStore } from '../stores/datasourceStore';
import type { DatasourceConfig, DatasourceType, SchemaInfo } from '../stores/datasourceStore';
import { v4 as uuidv4 } from 'uuid';
import type { ModelProvider, McpServerConfig, UserSystemPrompt, ModelConfig, ActivationStatus, IllustrationAsset, ImageAsset, PalettePreset, DynamicToolDef } from '../types';
import type { ExternalSkill, RegistrySkillManifest } from '../../shared/skills';
import { LAYOUT_MANIFEST, LAYOUT_CATEGORIES, CATEGORY_DISPLAY_NAMES } from '../utils/layoutManifest';
import { PALETTE_PRESETS, PALETTE_CATEGORIES, PALETTE_CATEGORY_NAMES } from '../types';
import { readMemory, clearMemory } from '../services/memoryService';
import { useRagStore } from '../stores/ragStore';
import type { ChunkOptions } from '../stores/ragStore';
import { SvgWireframe, LayoutPreviewModal } from './SvgLayoutPreview';
import PaletteEditorModal from './PaletteEditorModal';
import RegistrySkillEditorModal from './RegistrySkillEditorModal';
import { BUILT_IN_PRESETS, PRESET_CATEGORIES } from '../types/reportPresets';
import type { ReportPreset } from '../types/reportPresets';
import { CARD_CATALOG, CARD_CATEGORIES, CARD_CATEGORY_LABELS, setPreviewLang } from '../data/CardCatalog';
import type { CardCatalogEntry, CardCatalogCategory } from '../data/CardCatalog';
import { CONTENT_EN_NAMES, CONTENT_EN_DESCS, TAG_EN, ICON_CATEGORY_EN } from '../i18n/contentEN';
import { BUILT_IN_SKILL_MANIFESTS, localizeBuiltInSkillManifest } from '../skills/manifests';
import {
  createEmptyRegistrySkillManifest,
  createRegistrySkillFromDynamicTool,
  createRegistrySkillFromExternalSkill,
  makeUniqueSkillId,
  slugifySkillId,
} from '../skills/registryHelpers';

interface SettingsModalProps {
  activationStatus?: ActivationStatus | null;
  onReactivated?: (status: ActivationStatus) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ activationStatus, onReactivated }) => {
  const { t } = useI18n();
  const {
    models: allModels, mcpServers, installedSkills, dynamicToolDefs,
    userSystemPrompts, paletteId, reportLayoutId,
    customPalettes,
    language, setLanguage,
    updateModel, addModel, removeModel,
    addMcpServer, removeMcpServer, updateMcpServer, updateMcpDiscoveredTools, removeSkill, removeDynamicTool,
    addUserPrompt, updateUserPrompt, removeUserPrompt,
    setPaletteId, setReportLayoutId,
    addCustomPalette, updateCustomPalette, removeCustomPalette,
    settingsOpen, setSettingsOpen,
    disabledBuiltInTools, setBuiltInToolDisabled, externalSkills, registrySkills,
    enterprisePluginAvailable,
  } = useConfigStore();
  // Hide locked enterprise models when plugin is not loaded (open-source / community mode)
  const models = allModels.filter((m) => !m.locked || enterprisePluginAvailable);

  // Close on Escape key — avoids confusion with native window close button
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen]);

  const { identity, loading: identityLoading, error: identityError, refresh: refreshIdentity } = useSystemStore();

  const [activeTab, setActiveTab] = useState<'models' | 'mcp' | 'skills' | 'palette-schemes' | 'layout-templates' | 'card-components' | 'report-presets' | 'chart-engine' | 'prompt-hints' | 'memory' | 'system-info' | 'activation' | 'help' | 'storage' | 'data-parsing' | 'assets' | 'datasources' | 'rag' | 'knowledge-graph' | 'language'>('models');

  const NAV_GROUPS = [
    { label: t.settings.navGroupAI, items: [
      { key: 'models' as const, label: t.settings.navModels, icon: <Brain size={14}/> },
      { key: 'mcp' as const, label: t.settings.navMcp, icon: <Code2 size={14}/> },
    ]},
    { label: t.settings.navGroupTools, items: [
      { key: 'skills' as const, label: t.settings.navSkills, icon: <Wrench size={14}/> },
      { key: 'datasources' as const, label: t.settings.navDatasources, icon: <Database size={14}/> },
      { key: 'rag' as const, label: t.settings.navRag, icon: <Library size={14}/> },
      { key: 'knowledge-graph' as const, label: t.settings.navKnowledgeGraph, icon: <GitMerge size={14}/> },
    ]},
    { label: t.settings.navGroupReport, items: [
      { key: 'palette-schemes' as const, label: t.settings.navPaletteSchemes, icon: <Palette size={14}/> },
      { key: 'layout-templates' as const, label: t.settings.navLayoutTemplates, icon: <LayoutTemplate size={14}/> },
      { key: 'card-components' as const, label: t.settings.navCardComponents, icon: <CreditCard size={14}/> },
      { key: 'report-presets' as const, label: t.settings.navReportPresets, icon: <Bookmark size={14}/> },
      { key: 'chart-engine' as const, label: t.settings.navChartEngine, icon: <BarChart2 size={14}/> },
      { key: 'assets' as const, label: t.settings.navAssets, icon: <BookImage size={14}/> },
    ]},
    { label: t.settings.navGroupChat, items: [
      { key: 'prompt-hints' as const, label: t.settings.navPromptHints, icon: <FileText size={14}/> },
      { key: 'memory' as const, label: t.settings.navMemory, icon: <Brain size={14}/> },
    ]},
    { label: t.settings.navGroupSystem, items: [
      { key: 'language' as const, label: t.settings.navLanguage, icon: <Globe size={14}/> },
      { key: 'storage' as const, label: t.settings.navStorage, icon: <HardDrive size={14}/> },
      { key: 'data-parsing' as const, label: t.settings.navDataParsing, icon: <Activity size={14}/> },
      { key: 'activation' as const, label: t.settings.navActivation, icon: <ShieldCheck size={14}/> },
      { key: 'help' as const, label: t.settings.navHelp, icon: <FileText size={14}/> },
    ]},
  ];

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          settingsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSettingsOpen(false)}
      />
      {/* Drawer — full width */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white dark:bg-gray-800 shadow-2xl transition-transform duration-300 ease-in-out w-full ${
          settingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold">{t.settings.title}</h2>
          {/* Close button */}
          <button
            onClick={() => setSettingsOpen(false)}
            title={`${t.settings.close} (Esc)`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-transparent hover:border-red-200 dark:hover:border-red-700/50 transition-colors"
          >
            <X size={15} />
            <span className="text-xs font-medium">{t.settings.close}</span>
          </button>
        </div>

        {/* Body: VS Code-style left nav + right content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav sidebar */}
          <nav className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto py-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors text-left ${
                      activeTab === item.key
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium border-l-2 border-blue-500'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-l-2 border-transparent'
                    }`}
                  >
                    <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'models' && <ModelsTab models={models} updateModel={updateModel} addModel={addModel} removeModel={removeModel} />}
            {activeTab === 'mcp' && <McpTab servers={mcpServers} addServer={addMcpServer} removeServer={removeMcpServer} updateServer={updateMcpServer} updateDiscoveredTools={updateMcpDiscoveredTools} />}
            {activeTab === 'skills' && <SkillsTab skills={installedSkills} dynamicTools={dynamicToolDefs} removeSkill={removeSkill} removeDynamicTool={removeDynamicTool} disabledBuiltInTools={disabledBuiltInTools} setBuiltInToolDisabled={setBuiltInToolDisabled} externalSkills={externalSkills} registrySkills={registrySkills} />}
            {activeTab === 'storage' && <StorageTab />}
            {activeTab === 'data-parsing' && <DataParsingTab />}
            {activeTab === 'palette-schemes' && <PaletteSchemesTab paletteId={paletteId} onSelectPalette={setPaletteId} customPalettes={customPalettes} addCustomPalette={addCustomPalette} updateCustomPalette={updateCustomPalette} removeCustomPalette={removeCustomPalette} />}
            {activeTab === 'layout-templates' && <LayoutTemplatesTab layoutId={reportLayoutId} onSelectLayout={setReportLayoutId} />}
            {activeTab === 'card-components' && <CardComponentsTab />}
            {activeTab === 'report-presets' && <ReportPresetsTab paletteId={paletteId} layoutId={reportLayoutId} onSelectPalette={setPaletteId} onSelectLayout={setReportLayoutId} />}
            {activeTab === 'chart-engine' && <ChartEngineTab />}
            {activeTab === 'assets' && <AssetsTab />}
            {activeTab === 'datasources' && <DatasourcesTab />}
            {activeTab === 'rag' && <KnowledgeBaseTab />}
            {activeTab === 'knowledge-graph' && <KnowledgeGraphTab />}
            {activeTab === 'prompt-hints' && <PromptHintsTab prompts={userSystemPrompts} addPrompt={addUserPrompt} updatePrompt={updateUserPrompt} removePrompt={removeUserPrompt} />}
            {activeTab === 'memory' && <MemoryTab />}
            {activeTab === 'language' && <LanguageTab currentLang={language} setLanguage={setLanguage} />}
            {activeTab === 'activation' && (
              <ActivationTab status={activationStatus ?? null} onReactivated={onReactivated} />
            )}
            {activeTab === 'system-info' && (
              <SystemInfoTab
                identity={identity}
                loading={identityLoading}
                error={identityError}
                onRefresh={refreshIdentity}
              />
            )}
            {activeTab === 'help' && <HelpTab />}
          </div>
        </div>
      </div>
    </>
  );
};

/* ---- Models Tab ---- */
interface ModelsTabProps {
  models: ModelConfig[];
  updateModel: (id: string, patch: Record<string, unknown>) => void;
  addModel: (model: ModelConfig) => void;
  removeModel: (id: string) => void;
}

const ModelsTab: React.FC<ModelsTabProps> = ({ models, updateModel, addModel, removeModel }) => {
  const { t } = useI18n();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; status?: number; latencyMs?: number }>>({});
  // Per-locked-model edit state: model store ID → current editing value (null = not editing)
  const [lockedUrlEdits, setLockedUrlEdits] = useState<Record<string, string>>({});
  const [lockedModelIdEdits, setLockedModelIdEdits] = useState<Record<string, string>>({});

  const handleTestConnection = async (m: ModelConfig) => {
    if (m.provider !== 'ollama' && !m.apiKey.trim() && !m.locked) {
      setTestResults((s) => ({
        ...s,
        [m.id]: { ok: false, message: t.settings.noApiKeyError },
      }));
      return;
    }

    if (!window.electronAPI?.testModelConnection) {
      setTestResults((s) => ({
        ...s,
        [m.id]: { ok: false, message: t.settings.desktopOnlyTest },
      }));
      return;
    }

    setTestingId(m.id);
    setTestResults((s) => ({ ...s, [m.id]: { ok: false, message: t.settings.testingConnection } }));

    console.log('[settings] testModelConnection is-sentinel:', m.apiKey.includes('INTERNAL'), 'baseUrl:', m.baseUrl);
    const result = await window.electronAPI.testModelConnection({
      provider: m.provider,
      modelId: m.modelId,
      apiKey: m.apiKey,   // locked model sends sentinel; main.ts injects real key
      baseUrl: m.baseUrl,
    });

    setTestResults((s) => ({ ...s, [m.id]: result }));
    setTestingId(null);
  };

  const tierLabel = (tier?: string) => {
    if (tier === 'pro') return { text: 'Pro', cls: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' };
    if (tier === 'basic') return { text: 'Basic', cls: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' };
    return null;
  };

  return (
    <div className="space-y-4">
      {models.map((m) =>
        m.locked ? (
          /* ── Built-in locked enterprise model (modelId + baseUrl editable, test allowed) ── */
          <div
            key={m.id}
            className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3 border border-blue-200 dark:border-blue-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{m.name}</span>
                <span className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                  <Lock size={10} /> {t.settings.lockedBadge}
                </span>
                {tierLabel(m.lockedTier) && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierLabel(m.lockedTier)!.cls}`}>
                    {tierLabel(m.lockedTier)!.text}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-gray-500 mb-1 block">{t.settings.modelProvider}</label>
                <div className="w-full bg-white/60 dark:bg-gray-700/40 rounded-lg px-3 py-1.5 text-gray-600 dark:text-gray-400 select-none">
                  OpenAI Compatible
                </div>
              </div>
              <div>
                <label className="text-gray-500 mb-1 block">
                  {t.settings.modelId}
                  <span className="ml-1 text-blue-500 text-xs">{t.settings.modelIdEditable}</span>
                </label>
                <input
                  type="text"
                  value={m.id in lockedModelIdEdits ? lockedModelIdEdits[m.id] : m.modelId}
                  onChange={(e) => setLockedModelIdEdits((s) => ({ ...s, [m.id]: e.target.value }))}
                  onBlur={() => {
                    const val = lockedModelIdEdits[m.id];
                    if (val !== undefined && val.trim() && val.trim() !== m.modelId) {
                      updateModel(m.id, { modelId: val.trim() });
                    }
                    setLockedModelIdEdits((s) => { const n = { ...s }; delete n[m.id]; return n; });
                  }}
                  placeholder={t.settings.modelId}
                  className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-blue-300 dark:border-blue-600 outline-none focus:border-blue-500 font-mono text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-gray-500 mb-1 block">API Key</label>
                <div className="w-full bg-white/60 dark:bg-gray-700/40 rounded-lg px-3 py-1.5 text-gray-400 font-mono tracking-widest select-none">
                  {'•'.repeat(20)}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-gray-500 mb-1 block">
                  {t.settings.modelBaseUrl}
                  <span className="ml-1 text-blue-500 text-xs">{t.settings.modelBaseUrlEditable}</span>
                </label>
                <input
                  type="text"
                  value={m.id in lockedUrlEdits ? lockedUrlEdits[m.id] : m.baseUrl}
                  onChange={(e) => setLockedUrlEdits((s) => ({ ...s, [m.id]: e.target.value }))}
                  onBlur={() => {
                    const val = lockedUrlEdits[m.id];
                    if (val !== undefined && val.trim() && val.trim() !== m.baseUrl) {
                      updateModel(m.id, { baseUrl: val.trim() });
                    }
                    setLockedUrlEdits((s) => { const n = { ...s }; delete n[m.id]; return n; });
                  }}
                  placeholder="https://your-endpoint/v1/"
                  className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-blue-300 dark:border-blue-600 outline-none focus:border-blue-500 font-mono text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleTestConnection(m)}
                disabled={testingId === m.id}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {testingId === m.id ? t.settings.testingConnection : t.settings.testConnectionShort}
              </button>
              {testResults[m.id] && (
                <span className={`text-xs ${testResults[m.id].ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {testResults[m.id].message}
                  {testResults[m.id].latencyMs ? ` (${testResults[m.id].latencyMs}ms)` : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t.settings.lockedNote}
            </p>
          </div>
        ) : (
          /* ── Regular user-configured model ── */
          <div key={m.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <input
              className="font-medium bg-transparent outline-none border-b border-transparent focus:border-blue-500 text-sm"
              value={m.name}
              onChange={(e) => updateModel(m.id, { name: e.target.value })}
              title={t.settings.modelNamePlaceholder}
              placeholder={t.settings.modelNamePlaceholder}
            />
            <button onClick={() => removeModel(m.id)}             title={t.settings.deleteModel} className="text-gray-400 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-gray-500 mb-1 block">{t.settings.modelProvider}</label>
              <select
                value={m.provider}
                onChange={(e) => updateModel(m.id, { provider: e.target.value })}
                title={t.settings.modelProviderSelect}
                className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="anthropic-compatible">Anthropic Compatible</option>
              </select>
            </div>
            <div>
              <label className="text-gray-500 mb-1 block">{t.settings.modelId}</label>
              <input
                value={m.modelId}
                onChange={(e) => updateModel(m.id, { modelId: e.target.value })}
                title={t.settings.modelId}
                placeholder="gpt-4o"
                className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="text-gray-500 mb-1 block">{t.settings.modelApiKey}</label>
              <div className="relative">
                <input
                  type={showKeys[m.id] ? 'text' : 'password'}
                  value={m.apiKey}
                  onChange={(e) => updateModel(m.id, { apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none pr-8 font-mono"
                  style={{ fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono','Consolas','Menlo',monospace", letterSpacing: '0.02em' }}
                />
                <button
                  onClick={() => setShowKeys((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  title={showKeys[m.id] ? t.settings.hideApiKey : t.settings.showApiKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showKeys[m.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-gray-500 mb-1 block">{t.settings.modelBaseUrl}</label>
              <input
                value={m.baseUrl}
                onChange={(e) => updateModel(m.id, { baseUrl: e.target.value })}
                title="Base URL"
                placeholder="https://api.openai.com"
                className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
              />
            </div>

            <div>
              <label className="text-gray-500 mb-1 block text-xs">{t.settings.modelContextWindow}</label>
              <input
                type="number"
                value={m.maxContextTokens ?? -1}
                onChange={(e) => updateModel(m.id, { maxContextTokens: Number(e.target.value) })}
                title={t.settings.modelContextWindowTitle}
                placeholder="-1"
                min={-1}
                className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none text-sm"
              />
            </div>
            <div className="flex items-end gap-1 pb-0.5">
              {[4096, 8192, 32768, 128000, -1].map((v) => (
                <button
                  key={v}
                  type="button"
                  title={`${t.settings.setContextWindowTo} ${v === -1 ? t.settings.modelContextUnlimited : v}`}
                  onClick={() => updateModel(m.id, { maxContextTokens: v })}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    m.maxContextTokens === v
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-blue-400'
                  }`}
                >
                  {v === -1 ? '∞' : v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>

            <div className="col-span-2 flex items-center justify-between gap-3">
              <button
                onClick={() => handleTestConnection(m)}
                disabled={testingId === m.id}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {testingId === m.id ? t.settings.testingConnection : t.settings.testConnection}
              </button>
              {testResults[m.id] && (
                <span className={`text-xs ${testResults[m.id].ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {testResults[m.id].message}
                  {testResults[m.id].latencyMs ? ` (${testResults[m.id].latencyMs}ms)` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        )
      )}

      <button
        onClick={() => addModel({ id: uuidv4(), name: t.settings.newModelName, provider: 'openai', modelId: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com' })}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
      >
        <Plus size={16} /> {t.settings.addModel}
      </button>
      <p className="text-xs text-gray-400 mt-2">
        {t.settings.dsOpenRouterHint} <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">https://openrouter.ai/api/v1</code>
      </p>

      {/* ─── ReAct Agent Step Limit ─── */}
      <ReactAgentConfigSection />
    </div>
  );
};

/* ---- MCP Tab ---- */
interface McpTabProps {
  servers: McpServerConfig[];
  addServer: (config: McpServerConfig) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, patch: Partial<McpServerConfig>) => void;
  updateDiscoveredTools: (serverId: string, tools: McpServerConfig['discoveredTools']) => void;
}

const McpTab: React.FC<McpTabProps> = ({ servers, addServer, removeServer, updateServer, updateDiscoveredTools }) => {
  const { t } = useI18n();
  const [newName, setNewName] = useState('');
  const [newTransport, setNewTransport] = useState<'streamableHttp' | 'sse' | 'stdio'>('streamableHttp');
  const [newUrl, setNewUrl] = useState('');
  const [newTimeout, setNewTimeout] = useState('15000');
  const [newCmd, setNewCmd] = useState('');
  const [newArgs, setNewArgs] = useState('');
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [discoverError, setDiscoverError] = useState<Record<string, string>>({});

  const isHttpTransport = (t: string) => t === 'streamableHttp' || t === 'sse';

  const handleAdd = () => {
    if (isHttpTransport(newTransport)) {
      if (!newName || !newUrl) return;
      const timeoutMs = parseInt(newTimeout, 10);
      addServer({ id: uuidv4(), name: newName, type: newTransport as 'streamableHttp' | 'sse', url: newUrl.trim(), timeout: isNaN(timeoutMs) ? 15000 : timeoutMs, enabled: true });
    } else {
      if (!newName || !newCmd) return;
      addServer({ id: uuidv4(), name: newName, type: 'stdio', command: newCmd, args: newArgs.split(' ').filter(Boolean), enabled: true });
    }
    setNewName(''); setNewUrl(''); setNewCmd(''); setNewArgs(''); setNewTimeout('15000');
  };

  const handleDiscover = async (server: McpServerConfig) => {
    if (!server.url || !window.electronAPI?.mcpHttpDiscover) return;
    setDiscovering(server.id);
    setDiscoverError((prev) => { const n = { ...prev }; delete n[server.id]; return n; });
    try {
      const res = await window.electronAPI.mcpHttpDiscover(server.url, server.timeout);
      if (res.ok && res.tools) {
        updateDiscoveredTools(server.id, res.tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} })));
      } else {
        setDiscoverError((prev) => ({ ...prev, [server.id]: res.error ?? t.settings.mcpUnknownError }));
      }
    } catch (e) {
      setDiscoverError((prev) => ({ ...prev, [server.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setDiscovering(null);
    }
  };

  const transportLabel = (t: string) => t === 'streamableHttp' ? 'HTTP' : t === 'sse' ? 'SSE' : 'stdio';
  const transportColor = (t: string) => t === 'stdio' ? 'bg-gray-100 dark:bg-gray-700 text-gray-500' : t === 'sse' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400';
  const canAdd = isHttpTransport(newTransport) ? (!!newName && !!newUrl) : (!!newName && !!newCmd);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{t.settings.mcpDesc}</p>

      {servers.map((s) => (
        <div key={s.id} className={`bg-white dark:bg-gray-800/50 rounded-xl p-3 border transition-opacity ${s.enabled ? 'border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 opacity-60'}`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium text-sm ${!s.enabled ? 'text-gray-400 dark:text-gray-500' : ''}`}>{s.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${transportColor(s.type)}`}>
                  {transportLabel(s.type)}
                </span>
                {s.timeout && s.timeout !== 15000 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{s.timeout / 1000}s</span>
                )}
                {s.discoveredTools && s.discoveredTools.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">{s.discoveredTools.length} {t.settings.mcpToolsCount}</span>
                )}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                {s.type !== 'stdio' ? s.url : `${s.command} ${(s.args ?? []).join(' ')}`}
              </div>
              {discoverError[s.id] && (
                <p className="text-xs text-red-500 mt-1">{t.settings.mcpDiscoverFailed}: {discoverError[s.id]}</p>
              )}
              {s.discoveredTools && s.discoveredTools.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.discoveredTools.slice(0, 6).map((t) => (
                    <span key={t.name} title={t.description} className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">{t.name}</span>
                  ))}
                  {s.discoveredTools.length > 6 && <span className="text-[10px] text-gray-400">+{s.discoveredTools.length - 6} {t.settings.mcpMoreTools}</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {/* Enabled toggle */}
              <button
                onClick={() => updateServer(s.id, { enabled: !s.enabled })}
                title={s.enabled ? t.settings.mcpToggleDisable : t.settings.mcpToggleEnable}
                className={`relative w-8 h-4 rounded-full transition-colors ${s.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              {s.type !== 'stdio' && (
                <button
                  onClick={() => handleDiscover(s)}
                  disabled={discovering === s.id || !s.enabled}
                  title={t.settings.mcpScanTools}
                  className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} className={discovering === s.id ? 'animate-spin' : ''} />
                </button>
              )}
              <button onClick={() => removeServer(s.id)} title={t.settings.mcpDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 space-y-2 border border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium">{t.settings.mcpAddTitle}</div>
        {/* Transport type selector */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5">
          {(['streamableHttp', 'sse', 'stdio'] as const).map((t) => (
            <button key={t} onClick={() => setNewTransport(t)}
              className={`flex-1 text-xs py-1 rounded ${newTransport === t ? 'bg-white dark:bg-gray-700 font-medium text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500'}`}>
              {t === 'streamableHttp' ? 'HTTP' : t === 'sse' ? 'SSE' : 'stdio'}
            </button>
          ))}
        </div>
        <input placeholder={t.settings.mcpNamePlaceholder} value={newName} onChange={(e) => setNewName(e.target.value)}
          className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none" />
        {isHttpTransport(newTransport) ? (
          <>
            <input
              placeholder={newTransport === 'sse' ? t.settings.mcpSsePlaceholder : t.settings.mcpHttpPlaceholder}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">{t.settings.mcpTimeout}</label>
              <input
                type="number" min={0} step={1000}
                placeholder="15000"
                value={newTimeout}
                onChange={(e) => setNewTimeout(e.target.value)}
                className="flex-1 text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
              />
            </div>
          </>
        ) : (
          <>
            <input placeholder={t.settings.mcpCmdPlaceholder} value={newCmd} onChange={(e) => setNewCmd(e.target.value)}
              className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none" />
            <input placeholder={t.settings.mcpArgsPlaceholder} value={newArgs} onChange={(e) => setNewArgs(e.target.value)}
              className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none" />
          </>
        )}
        <button onClick={handleAdd} disabled={!canAdd}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm py-1.5 rounded-lg transition-colors">
          {isHttpTransport(newTransport) ? t.settings.mcpAddHttp : t.settings.mcpAddSimple}
        </button>
        {isHttpTransport(newTransport) && (
          <p className="text-[10px] text-gray-400">{t.settings.mcpAddHint}</p>
        )}
      </div>
    </div>
  );
};

/* ---- Skills Tab ---- */
interface SkillsTabProps {
  skills: Array<{ id: string; name: string; source: string; description: string; installedAt: number }>;
  dynamicTools: DynamicToolDef[];
  removeSkill: (id: string) => void;
  removeDynamicTool: (id: string) => void;
  disabledBuiltInTools: string[];
  setBuiltInToolDisabled: (toolName: string, disabled: boolean) => void;
  externalSkills: ExternalSkill[];
  registrySkills: RegistrySkillManifest[];
}

/**
 * Parse a .md skill file — kept for backward compatibility reference only.
 * URL-based install is now the primary method.
 */
function parseMdSkill(_content: string) { return null; }

const TOOLS_PER_PAGE = 8;

const SkillsTab: React.FC<SkillsTabProps> = ({ skills: _skills, dynamicTools, removeSkill: _removeSkill, removeDynamicTool, disabledBuiltInTools, setBuiltInToolDisabled, externalSkills, registrySkills }) => {
  const { t, lang } = useI18n();
  const [subTab, setSubTab] = useState<'builtin' | 'skills'>('builtin');
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [urlInstalling, setUrlInstalling] = useState(false);
  const [urlInstallInput, setUrlInstallInput] = useState('');
  const [urlInstallResult, setUrlInstallResult] = useState<string | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [toolPage, setToolPage] = useState(0);
  const { setExternalSkills, setRegistrySkills } = useConfigStore();
  const locale = lang === 'en-US' ? 'en-US' : 'zh-CN';
  const [registryEditorOpen, setRegistryEditorOpen] = useState(false);
  const [editingRegistrySkill, setEditingRegistrySkill] = useState<RegistrySkillManifest | null>(null);
  const [registryStatus, setRegistryStatus] = useState<string | null>(null);

  const text = React.useMemo(() => (
    locale === 'en-US'
      ? {
          registryTitle: 'Registry Skills',
          registryHint: 'Managed via datellData/skills/registry/user and merged into the runtime before legacy skills.',
          registryEmpty: 'No registry skills yet. Create one here or promote an existing skill source.',
          registryCreate: 'New Registry Skill',
          registryImport: 'Import JSON',
          registryImportDone: 'Registry skill imported.',
          registrySaveDone: 'Registry skill saved.',
          registryDeleteDone: 'Registry skill deleted.',
          registryExportDone: 'Registry manifest exported.',
          registryPromoteDone: 'Copied into registry as {name}.',
          registryCopyDone: 'Registry skill id copied.',
          registryDuplicateId: 'Registry skill id already exists: {id}',
          registryDeleteConfirm: 'Delete registry skill',
          registrySource: 'Source',
          registryId: 'ID',
          registryTools: 'tools',
          registryPromote: 'Promote to Registry',
          registryRefreshTitle: 'Refresh all skill sources',
          noDescription: 'No description provided.',
        }
      : {
          registryTitle: '注册表技能',
          registryHint: '保存于 datellData/skills/registry/user，并会在 legacy 目录技能之前并入运行时。',
          registryEmpty: '暂时还没有注册表技能。可以在这里新建，或把现有技能来源提升进注册表。',
          registryCreate: '新建注册表技能',
          registryImport: '导入 JSON',
          registryImportDone: '已导入注册表技能。',
          registrySaveDone: '已保存注册表技能。',
          registryDeleteDone: '已删除注册表技能。',
          registryExportDone: '已导出注册表清单。',
          registryPromoteDone: '已复制到注册表：{name}。',
          registryCopyDone: '已复制注册表技能 ID。',
          registryDuplicateId: '注册表技能 ID 已存在：{id}',
          registryDeleteConfirm: '确认删除注册表技能',
          registrySource: '来源',
          registryId: 'ID',
          registryTools: '个工具',
          registryPromote: '提升到注册表',
          registryRefreshTitle: '刷新全部技能来源',
          noDescription: '暂无描述。',
        }
  ), [locale]);

  const localizedToolMeta = React.useMemo(
    () => BUILT_IN_SKILL_MANIFESTS.map((manifest) => localizeBuiltInSkillManifest(manifest, locale)),
    [locale],
  );

  const refreshSkillSources = async () => {
    setRefreshing(true);
    try {
      const [legacyResult, registryResult] = await Promise.all([
        window.electronAPI?.skillsList?.() ?? Promise.resolve([]),
        window.electronAPI?.skillsRegistryList?.() ?? Promise.resolve([]),
      ]);
      setExternalSkills(legacyResult);
      setRegistrySkills(registryResult);
    } finally {
      setRefreshing(false);
    }
  };

  const saveRegistrySkill = async (manifest: RegistrySkillManifest) => {
    const duplicate = registrySkills.some((skill) => skill.id === manifest.id && skill.id !== editingRegistrySkill?.id);
    if (duplicate) {
      throw new Error(text.registryDuplicateId.replace('{id}', manifest.id));
    }
    const normalizedId = manifest.id.trim() || makeUniqueSkillId(manifest.name, registrySkills.map((skill) => skill.id));
    const payload: RegistrySkillManifest = {
      ...manifest,
      id: normalizedId,
      name: manifest.name.trim(),
      description: manifest.description.trim(),
      version: manifest.version.trim() || '1.0.0',
    };
    if (!window.electronAPI?.skillsRegistrySave) {
      throw new Error('skillsRegistrySave API unavailable');
    }
    await window.electronAPI.skillsRegistrySave(payload);
    await refreshSkillSources();
    setRegistryEditorOpen(false);
    setEditingRegistrySkill(null);
    setRegistryStatus(text.registrySaveDone);
  };

  const exportRegistrySkill = async (manifest: RegistrySkillManifest) => {
    if (!window.electronAPI?.saveFile) {
      setRegistryStatus('saveFile API unavailable');
      return;
    }
    const { source: _source, ...payload } = manifest;
    const ok = await window.electronAPI.saveFile(
      new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`),
      `${manifest.id}.skill.json`,
    );
    if (ok) {
      setRegistryStatus(text.registryExportDone);
    }
  };

  const importRegistrySkill = async () => {
    if (!window.electronAPI?.fsSelectFile || !window.electronAPI?.skillsRegistryImport) {
      setRegistryStatus('Registry import APIs unavailable');
      return;
    }
    const selectedPath = await window.electronAPI.fsSelectFile(['.json']);
    if (!selectedPath) {
      return;
    }
    await window.electronAPI.skillsRegistryImport(selectedPath);
    await refreshSkillSources();
    setRegistryStatus(text.registryImportDone);
  };

  const deleteRegistrySkill = async (manifest: RegistrySkillManifest) => {
    if (!window.confirm(`${text.registryDeleteConfirm}: ${manifest.name || manifest.id}?`)) {
      return;
    }
    if (!window.electronAPI?.skillsRegistryDelete) {
      setRegistryStatus('skillsRegistryDelete API unavailable');
      return;
    }
    await window.electronAPI.skillsRegistryDelete(manifest.id);
    await refreshSkillSources();
    setRegistryStatus(text.registryDeleteDone);
  };

  const copyRegistrySkillId = async (manifest: RegistrySkillManifest) => {
    try {
      await navigator.clipboard?.writeText(manifest.id);
      setRegistryStatus(text.registryCopyDone);
    } catch {
      setRegistryStatus(manifest.id);
    }
  };

  const promoteExternalSkill = async (skill: ExternalSkill) => {
    const manifest = createRegistrySkillFromExternalSkill(skill, registrySkills.map((entry) => entry.id));
    await saveRegistrySkill(manifest);
    setRegistryStatus(text.registryPromoteDone.replace('{name}', manifest.name));
  };

  const promoteDynamicTool = async (tool: DynamicToolDef) => {
    const manifest = createRegistrySkillFromDynamicTool(tool, registrySkills.map((entry) => entry.id));
    await saveRegistrySkill(manifest);
    setRegistryStatus(text.registryPromoteDone.replace('{name}', manifest.name));
  };

  const handleInstallFromUrl = async () => {
    const url = urlInstallInput.trim();
    if (!url || !window.electronAPI?.skillsInstallFromUrl) return;
    setUrlInstalling(true);
    setUrlInstallResult(null);
    try {
      const res = await window.electronAPI.skillsInstallFromUrl(url);
      if (res.ok) {
        setUrlInstallResult(`✅ ${t.settings.skillsInstallSuccess.replace('{name}', res.name ?? '').replace('{count}', String(res.toolCount ?? 0))}`);
        setUrlInstallInput('');
        await refreshSkillSources();
      } else {
        setUrlInstallResult(`❌ ${t.settings.skillsInstallFail.replace('{error}', res.error ?? '')}`);
      }
    } catch (e) {
      setUrlInstallResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUrlInstalling(false);
    }
  };

  const SUB_TABS = [
    { key: 'builtin' as const, label: t.settings.skillsBuiltinTitle, icon: <Wrench size={12}/> },
    { key: 'skills' as const, label: t.settings.skillsExtTitle, icon: <Code2 size={12}/> },
  ];

  const openRegistryEditor = (manifest?: RegistrySkillManifest) => {
    setEditingRegistrySkill(manifest ?? createEmptyRegistrySkillManifest());
    setRegistryEditorOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            title={t.label}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === t.key
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.icon}{t.label}
            {t.key === 'skills' && (dynamicTools.length + externalSkills.length + registrySkills.length) > 0 && <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-full">{dynamicTools.length + externalSkills.length + registrySkills.length}</span>}
          </button>
        ))}
      </div>

      {/* Built-in tools */}
      {subTab === 'builtin' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.skillsBuiltinTitle}</span>
            <span className="text-xs text-gray-400 ml-1">{t.settings.skillsBuiltinNote}</span>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              title={t.settings.skillsSearchTitle}
              placeholder={t.settings.skillsSearchPlaceholder}
              value={toolSearch}
              onChange={(e) => { setToolSearch(e.target.value); setToolPage(0); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {(() => {
            const q = toolSearch.trim().toLowerCase();
            const filtered = q ? localizedToolMeta.filter((tool) =>
              tool.label.toLowerCase().includes(q) || tool.toolName.toLowerCase().includes(q) ||
              tool.category.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q)
            ) : localizedToolMeta;
            const totalPages = Math.max(1, Math.ceil(filtered.length / TOOLS_PER_PAGE));
            const page = Math.min(toolPage, totalPages - 1);
            const paged = filtered.slice(page * TOOLS_PER_PAGE, page * TOOLS_PER_PAGE + TOOLS_PER_PAGE);
            return (
              <>
                <div className="space-y-2">
                  {paged.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">{t.settings.skillsNoMatch}</p>}
                  {paged.map((tool) => {
                    const isDisabled = disabledBuiltInTools.includes(tool.toolName);
                    return (
                      <div
                        key={tool.toolName}
                        className={`relative rounded-xl p-3 flex items-center justify-between gap-3 border transition-all ${
                          isDisabled ? 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700 opacity-70' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        }`}
                        onMouseEnter={() => setHoveredTool(tool.toolName)}
                        onMouseLeave={() => setHoveredTool(null)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium text-sm ${isDisabled ? 'text-gray-400 dark:text-gray-500' : ''}`}>{tool.label}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{tool.category}</span>
                            {isDisabled && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400">{t.settings.skillsDisabledBadge}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{tool.description}</p>
                          {hoveredTool === tool.toolName && (
                            <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-xl px-3 py-2.5 shadow-2xl pointer-events-none">
                              <div className="font-semibold mb-1">{tool.label}</div>
                              <div className="text-gray-300 leading-relaxed">{tool.description}</div>
                              <div className="text-gray-400 mt-1.5 font-mono text-[10px]">{t.settings.skillsToolNamePrefix}: {tool.toolName}</div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setBuiltInToolDisabled(tool.toolName, !isDisabled)}
                          title={isDisabled ? t.settings.skillsEnableTip : t.settings.skillsDisableTip}
                          className={`flex-shrink-0 transition-colors ${isDisabled ? 'text-gray-300 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-500' : 'text-blue-500 hover:text-blue-600'}`}
                        >
                          {isDisabled ? <ToggleLeft size={22} /> : <ToggleRight size={22} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-400">{filtered.length} {t.settings.skillsPagination} {page + 1} {t.settings.skillsPaginationOf} {totalPages} {t.settings.skillsPaginationPage}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setToolPage((p) => Math.max(0, p - 1))} disabled={page === 0} title={t.settings.skillsPrevPage} className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">{t.settings.skillsPrevPage}</button>
                      <button onClick={() => setToolPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} title={t.settings.skillsNextPage} className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">{t.settings.skillsNextPage}</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Extended skills: URL install + directory skills + AI dynamic tools */}
      {subTab === 'skills' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 size={14} className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.skillsExtTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={refreshSkillSources} disabled={refreshing} title={text.registryRefreshTitle} className="p-1 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50">
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button onClick={importRegistrySkill} title={text.registryImport}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <Upload size={12} />{text.registryImport}
              </button>
              <button onClick={() => openRegistryEditor()} title={text.registryCreate}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <Plus size={12} />{text.registryCreate}
              </button>
              <button onClick={() => window.electronAPI?.skillsOpenDir?.()} title={t.settings.skillsOpenDirTitle}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                <FolderOpen size={12} />{t.settings.skillsOpenDir}
              </button>
            </div>
          </div>

          {registryStatus && (
            <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">{registryStatus}</p>
          )}

          {/* Registry skills */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{text.registryTitle} ({registrySkills.length})</span>
            <p className="text-xs text-gray-400">{text.registryHint}</p>
            {registrySkills.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">{text.registryEmpty}</p>
            ) : (
              <div className="space-y-2">
                {registrySkills.map((skill) => (
                  <div key={skill.id} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{skill.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">v{skill.version}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/40 text-gray-500 dark:text-gray-300">{skill.tools.length} {text.registryTools}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{skill.description || text.noDescription}</p>
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-400">
                          <p>{text.registryId}: {skill.id}</p>
                          <p>{text.registrySource}: {skill.source || `registry/user/${skill.id}.skill.json`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openRegistryEditor(skill)} title={t.common.edit} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/80 hover:text-blue-500 dark:hover:bg-gray-800">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => exportRegistrySkill(skill)} title={t.common.export} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/80 hover:text-blue-500 dark:hover:bg-gray-800">
                          <Download size={13} />
                        </button>
                        <button onClick={() => copyRegistrySkillId(skill)} title={t.common.copy} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/80 hover:text-blue-500 dark:hover:bg-gray-800">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => void deleteRegistrySkill(skill)} title={t.common.delete} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/80 hover:text-red-500 dark:hover:bg-gray-800">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* URL install */}
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 space-y-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{t.settings.skillsInstallTitle}</div>
            <div className="flex gap-2">
              <input
                placeholder={t.settings.skillsInstallPlaceholder}
                value={urlInstallInput}
                onChange={(e) => setUrlInstallInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstallFromUrl()}
                className="flex-1 text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
              />
              <button
                onClick={handleInstallFromUrl}
                disabled={urlInstalling || !urlInstallInput.trim()}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {urlInstalling ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {t.settings.skillsInstallBtn}
              </button>
            </div>
            {urlInstallResult && (
              <p className={`text-xs px-2 py-1 rounded-lg ${urlInstallResult.startsWith('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>{urlInstallResult}</p>
            )}
          </div>

          {/* Directory skills */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t.settings.skillsDirTitle} ({externalSkills.length})</span>
            <p className="text-xs text-gray-400">{t.settings.skillsDirHint}</p>
            {externalSkills.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">{t.settings.skillsDirEmpty}</p>
            ) : (
              <div className="space-y-2">
                {externalSkills.map((s) => (
                  <div key={s.id} className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{s.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">v{s.version}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{s.description || text.noDescription}</p>
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-400">
                          <p>{text.registryId}: {slugifySkillId(s.name)}</p>
                          <p>{text.registrySource}: {s.source}</p>
                          <p>{s.tools.length} {t.settings.skillsDirToolsCount}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => void promoteExternalSkill(s)}
                        title={text.registryPromote}
                        className="flex items-center gap-1 rounded-lg border border-green-200 px-2 py-1 text-xs text-green-600 transition-colors hover:bg-white/80 dark:border-green-800 dark:hover:bg-gray-800"
                      >
                        <ArrowRight size={12} />
                        {text.registryPromote}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI-created dynamic tools */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t.settings.skillsAiTitle} ({dynamicTools.length})</span>
            <p className="text-xs text-gray-400">{t.settings.skillsAiHint}</p>
            {dynamicTools.length > 0 ? (
              <div className="space-y-2">
                {dynamicTools.map((tool) => (
                  <div key={tool.id} className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 flex items-center justify-between border border-purple-200 dark:border-purple-800">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{tool.name}</div>
                      <div className="text-xs text-gray-500 truncate">{tool.description}</div>
                      <div className="text-xs text-gray-400 mt-1">{t.settings.skillsAiCreatedAt} {new Date(tool.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void promoteDynamicTool(tool)}
                        title={text.registryPromote}
                        className="rounded-lg border border-purple-200 px-2 py-1 text-xs text-purple-600 transition-colors hover:bg-white/80 dark:border-purple-800 dark:hover:bg-gray-800"
                      >
                        {text.registryPromote}
                      </button>
                      <button onClick={() => removeDynamicTool(tool.id)} title={t.settings.skillsAiDelete} className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-2"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">{t.settings.skillsAiEmpty}</p>
            )}
          </div>

          {registryEditorOpen && editingRegistrySkill && (
            <RegistrySkillEditorModal
              initial={editingRegistrySkill}
              locale={locale}
              onCancel={() => {
                setRegistryEditorOpen(false);
                setEditingRegistrySkill(null);
              }}
              onSave={saveRegistrySkill}
            />
          )}
        </div>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════════════════
// NEW TABS: PaletteSchemesTab / LayoutTemplatesTab / CardComponentsTab /
//           ReportPresetsTab / ChartEngineTab
// ════════════════════════════════════════════════════════════════════════════

/* ---- Palette Schemes Tab ---- */
interface PaletteSchemesTabProps {
  paletteId: string;
  onSelectPalette: (id: string) => void;
  customPalettes: PalettePreset[];
  addCustomPalette: (p: PalettePreset) => void;
  updateCustomPalette: (id: string, patch: Partial<PalettePreset>) => void;
  removeCustomPalette: (id: string) => void;
}

const PaletteSchemesTab: React.FC<PaletteSchemesTabProps> = ({
  paletteId, onSelectPalette, customPalettes, addCustomPalette, updateCustomPalette, removeCustomPalette,
}) => {
  const { t, lang } = useI18n();
  const enN = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;
  const enD = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_DESCS[id] ?? fb) : fb;
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PalettePreset | undefined>(undefined);

  // All presets = built-in + custom
  const allPresets = [...PALETTE_PRESETS, ...customPalettes];

  const filtered = allPresets.filter((p) => {
    const matchCat = activeCategory === 'all' || (activeCategory === 'custom' ? p.isCustom : p.category === activeCategory);
    if (!matchCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
  });

  const handleSave = (palette: PalettePreset) => {
    if (editing) {
      updateCustomPalette(editing.id, palette);
    } else {
      addCustomPalette(palette);
    }
    setEditorOpen(false);
    setEditing(undefined);
  };

  const paletteCatNames: Record<string, string> = {
    business: t.settings.paletteCatBusiness,
    dark: t.settings.paletteCatDark,
    nature: t.settings.paletteCatNature,
    fashion: t.settings.paletteCatFashion,
    finance: t.settings.paletteCatFinance,
    tech: t.settings.paletteCatTech,
    minimal: t.settings.paletteCatMinimal,
    custom: t.settings.paletteCatCustom,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette size={16} className="text-blue-500" />
          <h3 className="font-semibold text-sm">{t.settings.paletteTitle}</h3>
          <span className="text-xs text-gray-400">({allPresets.length} {t.settings.countSuffix})</span>
        </div>
        <button
          onClick={() => { setEditing(undefined); setEditorOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={12} /> {t.settings.paletteNewBtn}
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          {t.settings.paletteAllCat}
        </button>
        {PALETTE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            {paletteCatNames[cat] ?? PALETTE_CATEGORY_NAMES[cat]}
            {cat === 'custom' && customPalettes.length > 0 && (
              <span className="ml-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full px-1 text-[10px]">
                {customPalettes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.settings.paletteSearchPlaceholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        />
      </div>

      {/* Palette grid */}
      <div className="grid grid-cols-4 gap-3">
        {filtered.map((p) => {
          const isActive = paletteId === p.id;
          return (
            <div key={p.id} className="relative group">
              <button
                onClick={() => onSelectPalette(p.id)}
                className={`w-full flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                }`}
              >
                <div className="flex gap-0.5">
                  {p.colors.slice(0, 5).map((c, i) => (
                    <span key={i} className="w-4 h-4 rounded-full border border-white/50" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-xs font-medium truncate w-full text-center leading-tight">{enN(p.id, p.name)}</span>
                {p.description && (
                  <span className="text-[10px] text-gray-400 truncate w-full text-center leading-tight">{enD(p.id, p.description)}</span>
                )}
                {isActive && <span className="text-[10px] text-blue-600 dark:text-blue-400">{t.settings.paletteSelected}</span>}
              </button>
              {/* Custom palette edit/delete actions */}
              {p.isCustom && (
                <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(p); setEditorOpen(true); }}
                    title={t.settings.paletteEditTitle}
                    className="w-5 h-5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-gray-500 hover:text-blue-500 flex items-center justify-center shadow"
                  >
                    <Edit2 size={9} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCustomPalette(p.id); }}
                    title={t.settings.paletteDeleteTitle}
                    className="w-5 h-5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-gray-500 hover:text-red-500 flex items-center justify-center shadow"
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-4 text-center py-8 text-gray-400 text-sm">
            {activeCategory === 'custom' ? t.settings.paletteEmptyCustom : t.settings.paletteEmptySearch}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editorOpen && (
        <PaletteEditorModal
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setEditorOpen(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
};

/* ---- Layout Templates Tab ---- */
interface LayoutTemplatesTabProps {
  layoutId?: string;
  onSelectLayout: (id: string | undefined) => void;
}

const LayoutTemplatesTab: React.FC<LayoutTemplatesTabProps> = ({ layoutId, onSelectLayout }) => {
  const { t, lang } = useI18n();
  const enN = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;
  const enD = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_DESCS[id] ?? fb) : fb;
  const enTag = (tag: string) => lang === 'en-US' ? (TAG_EN[tag] ?? tag) : tag;
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
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [previewItem, setPreviewItem] = useState<typeof LAYOUT_MANIFEST[number] | null>(null);

  const filteredLayouts = LAYOUT_MANIFEST.filter((item) => {
    const matchCat = !categoryFilter || item.category === categoryFilter;
    const q = searchText.toLowerCase();
    const matchSearch = !q ||
      item.name.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutTemplate size={16} className="text-blue-500" />
          <h3 className="font-semibold text-sm">{t.settings.layoutTitle}</h3>
          <span className="text-xs text-gray-400">({LAYOUT_MANIFEST.length} {t.settings.countSuffix})</span>
        </div>
        {layoutId && (
          <button onClick={() => onSelectLayout(undefined)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            {t.settings.layoutClearBtn}
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            !categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200'
          }`}
        >{t.settings.layoutAllCat}</button>
        {LAYOUT_CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {layoutCatNames[cat] ?? (CATEGORY_DISPLAY_NAMES[cat] || cat)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder={t.settings.layoutSearchPlaceholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        />
      </div>

      {/* Layout cards */}
      <div className="grid grid-cols-2 gap-3">
        {filteredLayouts.map((item) => {
          const isActive = layoutId === item.id;
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => onSelectLayout(isActive ? undefined : item.id)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {/* SVG mini thumbnail */}
                <div className="w-full mb-2 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700/40 flex items-center justify-center" style={{ height: 80 }}>
                  <SvgWireframe previewType={item.previewType} width={130} height={72} />
                </div>
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <span className="text-sm font-medium leading-tight">{enN(item.id, item.name)}</span>
                  {isActive && <Check size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />}
                </div>
                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 mb-1">
                  {layoutCatNames[item.category] ?? (CATEGORY_DISPLAY_NAMES[item.category] || item.category)}
                </span>
                {item.description && (
                  <p className="text-xs text-gray-400 line-clamp-2 leading-snug">{enD(item.id, item.description)}</p>
                )}
              </button>
              {/* Preview button */}
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                className="absolute top-2 right-2 w-6 h-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-500 hover:text-blue-500 hover:border-blue-400 transition-colors shadow-sm"
                title={t.settings.layoutPreviewTitle}
              >
                <ZoomIn size={11} />
              </button>
            </div>
          );
        })}
        {filteredLayouts.length === 0 && (
          <div className="col-span-2 text-center py-8 text-gray-400 text-sm">{t.settings.layoutEmpty}</div>
        )}
      </div>

      {/* Preview modal */}
      {previewItem && (
        <LayoutPreviewModal
          name={enN(previewItem.id, previewItem.name)}
          description={enD(previewItem.id, previewItem.description ?? '')}
          previewType={previewItem.previewType}
          category={layoutCatNames[previewItem.category] ?? (CATEGORY_DISPLAY_NAMES[previewItem.category] || previewItem.category)}
          tags={(previewItem.tags ?? []).map(enTag)}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
};

/* ---- Card Components Tab ---- */
const CardComponentsTab: React.FC = () => {
  const { paletteId } = useConfigStore();
  const activePalette = PALETTE_PRESETS.find((p) => p.id === paletteId);
  const primaryColor = activePalette?.primary ?? '#3b82f6';

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { t, lang } = useI18n();
  // Sync preview language so KPI render functions use correct locale
  setPreviewLang(lang);
  const enN = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;
  const enD = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_DESCS[id] ?? fb) : fb;
  const enTag = (tag: string) => lang === 'en-US' ? (TAG_EN[tag] ?? tag) : tag;
  const cardCatNames: Record<string, string> = {
    kpi: t.settings.cardCatKpi,
    chart: t.settings.cardCatChart,
    table: t.settings.cardCatTable,
    structure: t.settings.cardCatStructure,
    filter: t.settings.cardCatFilter,
  };

  const filtered = CARD_CATALOG.filter((c) => {
    const matchCat = activeCategory === 'all' || c.category === activeCategory;
    if (!matchCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleCopy = (entry: CardCatalogEntry) => {
    // Generate a representative HTML snippet for copy
    const html = `<!-- ${entry.name}: ${entry.description} -->\n<!-- ${t.settings.cardCopyComment}: ${entry.id} -->`;
    navigator.clipboard?.writeText(html).catch(() => {});
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-blue-500" />
        <h3 className="font-semibold text-sm">{t.settings.cardTitle}</h3>
        <span className="text-xs text-gray-400">({CARD_CATALOG.length} {t.settings.countSuffix})</span>
        {activePalette && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: primaryColor }} />
            {enN(activePalette.id, activePalette.name)}
          </span>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          {t.settings.cardAllCat} ({CARD_CATALOG.length})
        </button>
        {CARD_CATEGORIES.map((cat) => {
          const count = CARD_CATALOG.filter((c) => c.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {cardCatNames[cat] ?? CARD_CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.settings.cardSearchPlaceholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        />
      </div>

      {/* Tip */}
      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs text-blue-700 dark:text-blue-300">
        <span className="mt-0.5 flex-shrink-0">💡</span>
        <span>{t.settings.cardTip}</span>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 gap-4">
        {filtered.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-300 dark:hover:border-blue-600 transition-all group">
            {/* Live preview */}
            <div className="flex items-center justify-center min-h-[80px] py-2">
              {entry.render(primaryColor)}
            </div>
            {/* Metadata */}
            <div className="flex items-start justify-between gap-1 mt-1">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-tight">{enN(entry.id, entry.name)}</p>
                <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{enD(entry.id, entry.description)}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[10px]">
                    {cardCatNames[entry.category] ?? CARD_CATEGORY_LABELS[entry.category]}
                  </span>
                  {entry.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded text-[10px]">{enTag(tag)}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleCopy(entry)}
                title={t.settings.cardCopyTitle}
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors opacity-0 group-hover:opacity-100"
              >
                {copiedId === entry.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-10 text-gray-400 text-sm">
            {t.settings.cardEmpty}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---- Report Presets Tab ---- */
interface ReportPresetsTabProps {
  paletteId: string;
  layoutId?: string;
  onSelectPalette: (id: string) => void;
  onSelectLayout: (id: string | undefined) => void;
}

const ReportPresetsTab: React.FC<ReportPresetsTabProps> = ({ paletteId, layoutId, onSelectPalette, onSelectLayout }) => {
  const { t, lang } = useI18n();
  const enN = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_NAMES[id] ?? fb) : fb;
  const enD = (id: string, fb: string) => lang === 'en-US' ? (CONTENT_EN_DESCS[id] ?? fb) : fb;
  const enTag = (tag: string) => lang === 'en-US' ? (TAG_EN[tag] ?? tag) : tag;
  const { activePresetId, setActivePresetId, setPreferredChartEngine } = useConfigStore();
  const [activeCat, setActiveCat] = useState('');
  const [search, setSearch] = useState('');
  const presetCatLabelMap: Record<string, string> = {
    '': t.settings.presetCatAll,
    business: t.settings.presetCatBusiness,
    finance: t.settings.presetCatFinance,
    tech: t.settings.presetCatTech,
    marketing: t.settings.presetCatMarketing,
    hr: t.settings.presetCatHR,
    print: t.settings.presetCatPrint,
  };

  const filtered = BUILT_IN_PRESETS.filter((p) => {
    const matchCat = !activeCat || p.category === activeCat;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const handleApply = (preset: ReportPreset) => {
    onSelectPalette(preset.paletteId);
    onSelectLayout(preset.layoutId);
    setPreferredChartEngine(preset.chartEngine);
    setActivePresetId(preset.id);
  };

  const handleClear = () => {
    setActivePresetId(undefined);
  };

  const handleCreateFromCurrent = () => {
    alert(t.settings.presetComingSoon.replace('{palette}', paletteId).replace('{layout}', layoutId || t.settings.presetLayoutDefault));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark size={16} className="text-blue-500" />
          <h3 className="font-semibold text-sm">{t.settings.presetTitle}</h3>
          <span className="text-xs text-gray-400">({BUILT_IN_PRESETS.length} {t.settings.countSuffix})</span>
        </div>
        {activePresetId && (
          <button onClick={handleClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
            <X size={11} /> {t.settings.presetClearBtn}
          </button>
        )}
      </div>

      {/* Active preset indicator */}
      {activePresetId && (() => {
        const ap = BUILT_IN_PRESETS.find((p) => p.id === activePresetId);
        return ap ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700/50">
            <Check size={13} className="text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{t.settings.presetCurrentLabel}{ap.name}</span>
            <span className="text-xs text-blue-500 dark:text-blue-400 opacity-70">· {t.settings.presetInjected}</span>
          </div>
        ) : null;
      })()}

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_CATEGORIES.map((cat) => {
          const count = cat.key === '' ? BUILT_IN_PRESETS.length : BUILT_IN_PRESETS.filter((p) => p.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCat(cat.key === activeCat ? '' : cat.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCat === cat.key || (cat.key === '' && activeCat === '')
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {presetCatLabelMap[cat.key] ?? cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.settings.presetSearchPlaceholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        />
      </div>

      {/* Preset cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((preset) => {
          const isActive = activePresetId === preset.id;
          const palette = PALETTE_PRESETS.find((p) => p.id === preset.paletteId);
          const layoutItem = LAYOUT_MANIFEST.find((l) => l.id === preset.layoutId);
          return (
            <div key={preset.id} className={`relative rounded-xl border-2 transition-all overflow-hidden ${
              isActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}>
              {/* SVG wireframe thumbnail */}
              <div className="w-full bg-gray-50 dark:bg-gray-700/40 flex items-center justify-center overflow-hidden" style={{ height: 72 }}>
                {layoutItem ? (
                  <SvgWireframe previewType={layoutItem.previewType} width={130} height={64} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bookmark size={24} className="text-gray-300" />
                  </div>
                )}
              </div>

              <div className="p-2.5">
                {/* Palette color dots + active check */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex gap-0.5">
                    {palette?.colors.slice(0, 5).map((c, i) => (
                      <span key={i} className="w-3 h-3 rounded-full border border-white/50 dark:border-gray-600" style={{ background: c }} />
                    ))}
                  </div>
                  {isActive && <Check size={13} className="text-blue-500" />}
                </div>

                {/* Name */}
                <div className="text-xs font-semibold leading-tight mb-0.5 truncate">{enN(preset.id, preset.name)}</div>
                {/* Description */}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-snug mb-2">{enD(preset.id, preset.description)}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-0.5 mb-2">
                  {preset.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">{enTag(tag)}</span>
                  ))}
                </div>

                {/* Apply button */}
                <button
                  onClick={() => handleApply(preset)}
                  className={`w-full text-[11px] py-1 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-300'
                  }`}
                >
                  {isActive ? t.settings.presetApplied : t.settings.presetApplyBtn}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-8 text-gray-400 text-sm">{t.settings.presetEmpty}</div>
        )}
      </div>

      {/* Create from current config */}
      <button
        onClick={handleCreateFromCurrent}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        <Plus size={13} />
        {t.settings.presetCreateFromCurrent}
      </button>
    </div>
  );
};

/* ---- Chart Engine Tab ---- */
const ChartEngineTab: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 size={16} className="text-blue-500" />
        <h3 className="font-semibold text-sm">{t.settings.chartEngineTitle}</h3>
      </div>
      <ChartEngineSection />
    </div>
  );
};

/* ---- Chart Engine Section ---- */
const ChartEngineSection: React.FC = () => {
  const { t } = useI18n();
  const { preferredChartEngine, setPreferredChartEngine } = useConfigStore();

  const options: { value: 'auto' | 'echarts' | 'apexcharts'; label: string; desc: string }[] = [
    { value: 'auto', label: t.settings.chartEngineAuto, desc: t.settings.chartEngineAutoDesc },
    { value: 'echarts', label: t.settings.chartEngineEcharts, desc: t.settings.chartEngineEchartsDesc },
    { value: 'apexcharts', label: t.settings.chartEngineApex, desc: t.settings.chartEngineApexDesc },
  ];

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ToggleLeft size={15} className="text-blue-500" />
        <span className="text-sm font-medium">{t.settings.chartEngineDefaultLabel}</span>
        <span className="text-xs text-gray-400">{t.settings.chartEngineNote}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t.settings.chartEngineDesc}
      </p>
      <select
        value={preferredChartEngine}
        onChange={(e) => setPreferredChartEngine(e.target.value as 'auto' | 'echarts' | 'apexcharts')}
        title={t.settings.chartEngineSelectTitle}
        className="w-full bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 outline-none text-sm focus:ring-2 focus:ring-blue-400/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p className="text-xs text-gray-400">
        {options.find((o) => o.value === preferredChartEngine)?.desc}
      </p>
    </div>
  );
};

/* ---- Icon Card sub-component ---- */
const IconCard: React.FC<{ name: string }> = ({ name }) => {
  const { t } = useI18n();
  return (
  <button
    onClick={() => navigator.clipboard?.writeText(name).catch(() => {})}
    title={`${t.settings.assetsIconCopyTitle}: ${name}`}
    className="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
  >
    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <use href={`/vendor/icons.svg#icon-${name}`} />
    </svg>
    <span className="text-[10px] text-gray-400 font-mono max-w-[60px] truncate">{name}</span>
  </button>
  );
};

/* ---- Assets Tab (icon browser + illustration manager + background images) ---- */
const AssetsTab: React.FC = () => {
  const { t, lang } = useI18n();
  const { illustrations, addIllustration, removeIllustration, imageAssets, addImageAsset, removeImageAsset } = useConfigStore();
  const [subTab, setSubTab] = useState<'icons' | 'illustrations' | 'backgrounds'>('icons');

  // Icons state
  const [iconSearch, setIconSearch] = useState('');
  const [allIcons, setAllIcons] = useState<string[]>([]);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [iconPage, setIconPage] = useState(1);
  const ICONS_PER_PAGE = 120;

  // unDraw catalog state
  const [undrawCatalog, setUndrawCatalog] = useState<Array<{ id: string; title: string; slug: string; url: string }>>([]);
  const [undrawLoaded, setUndrawLoaded] = useState(false);
  const [undrawSearch, setUndrawSearch] = useState('');
  const [undrawPage, setUndrawPage] = useState(1);
  const [undrawPreview, setUndrawPreview] = useState<{ title: string; url: string } | null>(null);
  const [undrawColor, setUndrawColor] = useState('#4F46E5');
  const UNDRAW_PER_PAGE = 40;
  const [illSubTab, setIllSubTab] = useState<'undraw' | 'custom'>('undraw');

  // Background preview state
  const [bgPreview, setBgPreview] = useState<{ name: string; dataUrl: string } | null>(null);

  // Custom illustration state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIll, setNewIll] = useState<Partial<IllustrationAsset>>({ category: '商务协作', tags: [], builtIn: false });
  const [svgPreview, setSvgPreview] = useState('');

  // Load icons list on mount
  useEffect(() => {
    fetch('/vendor/icons-list.json')
      .then((r) => r.json())
      .then((data) => { setAllIcons(data); setIconsLoaded(true); })
      .catch(() => { setAllIcons([]); setIconsLoaded(true); });
  }, []);

  // Load unDraw catalog on mount
  useEffect(() => {
    fetch('/vendor/undraw-catalog.json')
      .then((r) => r.json())
      .then((data) => { setUndrawCatalog(data); setUndrawLoaded(true); })
      .catch(() => { setUndrawCatalog([]); setUndrawLoaded(true); });
  }, []);

  // Reset pages when search changes
  useEffect(() => { setIconPage(1); }, [iconSearch]);
  useEffect(() => { setUndrawPage(1); }, [undrawSearch]);

  // Icon categories for quick reference (shown when no search)
  const ICON_CATEGORIES = [
    { name: lang === 'en-US' ? 'Data Analytics' : '数据分析', icons: ['chart-bar', 'chart-line', 'chart-pie', 'trending-up', 'trending-down', 'database', 'table', 'report'] },
    { name: lang === 'en-US' ? 'Business' : '商务办公', icons: ['briefcase', 'building', 'users', 'user', 'mail', 'phone', 'calendar', 'clock'] },
    { name: lang === 'en-US' ? 'Finance' : '财务金融', icons: ['coin', 'currency-dollar', 'credit-card', 'wallet', 'receipt', 'cash', 'piggy-bank', 'percentage'] },
    { name: lang === 'en-US' ? 'Files & Docs' : '文件文档', icons: ['file', 'file-text', 'folder', 'upload', 'download', 'printer', 'clipboard', 'archive'] },
    { name: lang === 'en-US' ? 'Status & Flags' : '状态标志', icons: ['check', 'x', 'alert-circle', 'info-circle', 'help-circle', 'star', 'heart', 'flag'] },
    { name: lang === 'en-US' ? 'Transport' : '交通物流', icons: ['truck', 'car', 'plane', 'ship', 'package', 'map-pin', 'route', 'gps'] },
    { name: lang === 'en-US' ? 'Technology' : '技术科技', icons: ['cpu', 'device-desktop', 'device-mobile', 'wifi', 'cloud', 'server', 'robot', 'code'] },
    { name: lang === 'en-US' ? 'Nature' : '自然环境', icons: ['leaf', 'tree', 'sun', 'moon', 'wind', 'droplet', 'mountain', 'globe'] },
  ];

  const ILLUSTRATION_CATEGORIES = ['商务协作', '数据分析', '团队展示', '成功庆典', '其他'];

  const handleAddIllustration = () => {
    if (!newIll.name || !newIll.svgContent) return;
    addIllustration({
      id: uuidv4(),
      name: newIll.name ?? '',
      category: newIll.category ?? '其他',
      tags: newIll.tags ?? [],
      svgContent: newIll.svgContent ?? '',
      builtIn: false,
      description: newIll.description ?? '',
    });
    setNewIll({ category: '商务协作', tags: [], builtIn: false });
    setSvgPreview('');
    setShowAddForm(false);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addImageAsset({
        id: uuidv4(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        dataUrl: ev.target?.result as string,
        createdAt: Date.now(),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const customIllustrations = illustrations.filter((i) => !i.builtIn);
  const builtInIllustrations = illustrations.filter((i) => i.builtIn);

  // Derived computations for icons search
  const filteredIcons = iconSearch.trim() ? allIcons.filter((ic) => ic.includes(iconSearch.trim().toLowerCase())) : [];
  const searchTotalPages = Math.ceil(filteredIcons.length / ICONS_PER_PAGE);
  const searchPageIcons = filteredIcons.slice((iconPage - 1) * ICONS_PER_PAGE, iconPage * ICONS_PER_PAGE);

  // Derived computations for unDraw search
  const filteredUndraw = undrawSearch.trim()
    ? undrawCatalog.filter((item) => item.title.toLowerCase().includes(undrawSearch.trim().toLowerCase()))
    : undrawCatalog;
  const undrawTotalPages = Math.ceil(filteredUndraw.length / UNDRAW_PER_PAGE);
  const undrawPageItems = filteredUndraw.slice((undrawPage - 1) * UNDRAW_PER_PAGE, undrawPage * UNDRAW_PER_PAGE);
  const getUndrawUrl = (url: string) => `${url}?color=${undrawColor.replace('#', '')}`;

  return (
    <div className="space-y-4">
      {/* Main sub-tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-3 flex-wrap">
        <button
          onClick={() => setSubTab('icons')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${subTab === 'icons' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          {t.settings.assetsIconBrowser}
        </button>
        <button
          onClick={() => setSubTab('illustrations')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${subTab === 'illustrations' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          {t.settings.assetsIllustrations} {undrawCatalog.length > 0 && <span className="ml-1 text-xs bg-blue-500 text-white rounded-full px-1.5">{undrawCatalog.length}</span>}
        </button>
        <button
          onClick={() => setSubTab('backgrounds')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${subTab === 'backgrounds' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          {t.settings.assetsBgImages} {imageAssets.length > 0 && <span className="ml-1 text-xs bg-blue-500 text-white rounded-full px-1.5">{imageAssets.length}</span>}
        </button>
      </div>

      {/* ===== ICONS TAB ===== */}
      {subTab === 'icons' && (
        <div className="space-y-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t.settings.assetsIconsHint.replace('{count}', String(iconsLoaded && allIcons.length > 0 ? allIcons.length : 5039))}
            <code className="ml-1 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono">
              {'<svg class="icon icon-16"><use href="./vendor/icons.svg#icon-NAME"/></svg>'}
            </code>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder={t.settings.assetsIconSearchPlaceholder}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {iconSearch.trim() ? (
            /* Search results */
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{filteredIcons.length} {t.settings.assetsIconsCount}</span>
                {searchTotalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button disabled={iconPage <= 1} onClick={() => setIconPage((p) => p - 1)} className="px-2 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                    <span className="text-xs text-gray-500">{iconPage}/{searchTotalPages}</span>
                    <button disabled={iconPage >= searchTotalPages} onClick={() => setIconPage((p) => p + 1)} className="px-2 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {searchPageIcons.map((ic) => <IconCard key={ic} name={ic} />)}
              </div>
              {filteredIcons.length === 0 && !iconsLoaded && (
                <div className="text-center py-6 text-gray-400 text-xs flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{t.settings.assetsIconsLoading}</div>
              )}
              {filteredIcons.length === 0 && iconsLoaded && (
                <div className="text-center py-6 text-gray-400 text-xs">{t.settings.assetsIconsEmpty}</div>
              )}
            </div>
          ) : (
            /* Predefined categories */
            <div className="space-y-4">
              {ICON_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{cat.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {cat.icons.map((ic) => <IconCard key={ic} name={ic} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-400 dark:text-gray-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            {t.settings.assetsIconTip}
            <a href="https://tabler.io/icons" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">tabler.io/icons</a>
          </div>
        </div>
      )}

      {/* ===== ILLUSTRATIONS TAB ===== */}
      {subTab === 'illustrations' && (
        <div className="space-y-3">
          {/* Sub-tabs: unDraw / custom */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <button
              onClick={() => setIllSubTab('undraw')}
              className={`px-3 py-1 text-xs rounded transition-colors ${illSubTab === 'undraw' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 font-medium' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {t.settings.assetsIllSub1} {undrawCatalog.length > 0 && <span className="ml-1 bg-purple-500 text-white rounded-full px-1.5 text-[10px]">{undrawCatalog.length}</span>}
            </button>
            <button
              onClick={() => setIllSubTab('custom')}
              className={`px-3 py-1 text-xs rounded transition-colors ${illSubTab === 'custom' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 font-medium' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {t.settings.assetsIllSub2} {illustrations.length > 0 && <span className="ml-1 bg-gray-500 text-white rounded-full px-1.5 text-[10px]">{illustrations.length}</span>}
            </button>
          </div>

          {/* unDraw catalog section */}
          {illSubTab === 'undraw' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={undrawSearch}
                    onChange={(e) => setUndrawSearch(e.target.value)}
                    placeholder={t.settings.assetsIllSearchPlaceholder}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-gray-500">{t.settings.assetsIllThemeColor}</span>
                  <input
                    type="color"
                    value={undrawColor}
                    onChange={(e) => setUndrawColor(e.target.value)}
                    className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0.5"
                    title={t.settings.assetsIllThemeColorTitle}
                  />
                </div>
              </div>

              {!undrawLoaded && (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  <span className="text-sm">{t.settings.assetsIllLoading}</span>
                </div>
              )}

              {undrawLoaded && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{filteredUndraw.length} {t.settings.assetsIllCount}{undrawSearch ? t.settings.assetsIllCountSearch : ''}</span>
                    {undrawTotalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button disabled={undrawPage <= 1} onClick={() => setUndrawPage((p) => p - 1)} className="px-2 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">{t.settings.assetsIllPrevPage}</button>
                        <span className="text-xs text-gray-500 px-1">{undrawPage}/{undrawTotalPages}</span>
                        <button disabled={undrawPage >= undrawTotalPages} onClick={() => setUndrawPage((p) => p + 1)} className="px-2 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">{t.settings.assetsIllNextPage}</button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {undrawPageItems.map((item) => (
                      <button
                        key={item.id || item.slug}
                        onClick={() => setUndrawPreview({ title: item.title, url: getUndrawUrl(item.url) })}
                        className="flex flex-col items-center p-2 border border-gray-200 dark:border-gray-600 rounded-xl hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors group text-left"
                        title={`${t.settings.assetsIllPreviewTitle}: ${item.title}`}
                      >
                        <div className="w-full aspect-[4/3] bg-white dark:bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center mb-1.5 border border-gray-100 dark:border-gray-600">
                          <img
                            src={getUndrawUrl(item.url)}
                            alt={item.title}
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight truncate w-full group-hover:text-purple-600 dark:group-hover:text-purple-400">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Custom illustrations section */}
          {illSubTab === 'custom' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">{t.settings.assetsCustomIllHint}</div>
                <button
                  onClick={() => setShowAddForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  <Plus size={12} />
                  {t.settings.assetsAddIllBtn}
                </button>
              </div>

              {showAddForm && (
                <div className="border border-blue-300 dark:border-blue-600 rounded-xl p-4 bg-blue-50/30 dark:bg-blue-900/10 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.assetsIllNameLabel}</label>
                      <input
                        value={newIll.name ?? ''}
                        onChange={(e) => setNewIll((p) => ({ ...p, name: e.target.value }))}
                        placeholder={t.settings.assetsIllNamePlaceholder}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.assetsIllCatLabel}</label>
                      <select
                        title={t.settings.assetsIllCatLabel}
                        value={newIll.category ?? '商务协作'}
                        onChange={(e) => setNewIll((p) => ({ ...p, category: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        {ILLUSTRATION_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{lang === 'en-US' ? (ICON_CATEGORY_EN[c] ?? c) : c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.assetsIllDescLabel}</label>
                      <input
                        value={newIll.description ?? ''}
                        onChange={(e) => setNewIll((p) => ({ ...p, description: e.target.value }))}
                        placeholder={t.settings.assetsIllDescPlaceholder}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.assetsIllSvgLabel}</label>
                      <textarea
                        value={newIll.svgContent ?? ''}
                        onChange={(e) => { setNewIll((p) => ({ ...p, svgContent: e.target.value })); setSvgPreview(e.target.value); }}
                        rows={5}
                        placeholder="<svg viewBox='...' ...>...</svg>"
                        className="w-full px-2 py-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                      />
                    </div>
                    {svgPreview && svgPreview.trim().startsWith('<svg') && (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">{t.settings.assetsIllPreviewLabel}</label>
                        <div
                          className="w-32 h-24 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: svgPreview }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={handleAddIllustration} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                      <Check size={11} />{t.settings.assetsIllSaveBtn}
                    </button>
                    <button onClick={() => { setShowAddForm(false); setNewIll({ category: '商务协作', tags: [], builtIn: false }); setSvgPreview(''); }} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      {t.settings.assetsIllCancelBtn}
                    </button>
                  </div>
                </div>
              )}

              {builtInIllustrations.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">{t.settings.assetsBuiltinIllTitle}</div>
                  {builtInIllustrations.map((ill) => (
                    <div key={ill.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 mb-2">
                      <div className="w-12 h-10 flex-shrink-0 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: ill.svgContent }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{ill.name}</span>
                          <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">{lang === 'en-US' ? (ICON_CATEGORY_EN[ill.category] ?? ill.category) : ill.category}</span>
                          <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">{t.settings.assetsBuiltinBadge}</span>
                        </div>
                        {ill.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{ill.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customIllustrations.length === 0 && !showAddForm && (
                <div className="text-center py-8 text-gray-400">
                  <BookImage size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t.settings.assetsCustomIllEmpty}</p>
                  <p className="text-xs mt-1">{t.settings.assetsCustomIllEmptyHint}</p>
                </div>
              )}

              {customIllustrations.map((ill) => (
                <div key={ill.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                  <div className="w-12 h-10 flex-shrink-0 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: ill.svgContent }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{ill.name}</span>
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">{lang === 'en-US' ? (ICON_CATEGORY_EN[ill.category] ?? ill.category) : ill.category}</span>
                    </div>
                    {ill.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{ill.description}</p>}
                  </div>
                  <button onClick={() => removeIllustration(ill.id)} title={t.settings.assetsIllDeleteTitle} className="p-1.5 text-red-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== BACKGROUNDS TAB ===== */}
      {subTab === 'backgrounds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t.settings.assetsBgHint}
            </div>
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors">
              <Upload size={12} />
              {t.settings.assetsBgUploadBtn}
              <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
            </label>
          </div>

          {imageAssets.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Image size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t.settings.assetsBgEmpty}</p>
              <p className="text-xs mt-1">{t.settings.assetsBgEmptyHint}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {imageAssets.map((asset) => (
              <div key={asset.id} className="relative group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800">
                <button
                  onClick={() => setBgPreview({ name: asset.name, dataUrl: asset.dataUrl })}
                  className="w-full relative"
                  title={t.settings.assetsBgPreviewTitle}
                >
                  <img src={asset.dataUrl} alt={asset.name} className="w-full h-28 object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <Eye size={20} className="text-white drop-shadow" />
                  </div>
                </button>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">{asset.name}</span>
                  <button onClick={() => removeImageAsset(asset.id)} title={t.settings.assetsBgDeleteTitle} className="ml-1 p-1 text-red-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* unDraw preview modal */}
      {undrawPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setUndrawPreview(null)}>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setUndrawPreview(null)} title={t.settings.assetsCloseTitle} className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <X size={16} />
            </button>
            <h3 className="font-semibold text-sm mb-4">{undrawPreview.title}</h3>
            <img src={undrawPreview.url} alt={undrawPreview.title} className="w-full max-h-72 object-contain rounded-lg" />
            <div className="mt-4 flex items-center gap-2">
              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-1 truncate font-mono">{undrawPreview.url}</code>
              <button
                onClick={() => navigator.clipboard?.writeText(undrawPreview.url).catch(() => {})}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <Copy size={11} />
                {t.settings.assetsCopyLink}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background image preview modal */}
      {bgPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setBgPreview(null)}>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setBgPreview(null)} title={t.settings.assetsCloseTitle} className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <X size={16} />
            </button>
            <h3 className="font-semibold text-sm mb-3">{bgPreview.name}</h3>
            <img src={bgPreview.dataUrl} alt={bgPreview.name} className="w-full max-h-96 object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};

/* ---- Memory Tab (long-term & short-term memory management) ---- */
const MemoryTab: React.FC = () => {
  const { t } = useI18n();
  const { memoryShortTermRounds, setMemoryShortTermRounds } = useConfigStore();
  const [longTerm, setLongTerm] = useState('');
  const [shortTerm, setShortTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [lt, st] = await Promise.all([readMemory('long_term'), readMemory('short_term')]);
    setLongTerm(lt);
    setShortTerm(st);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClear = async (type: 'long_term' | 'short_term') => {
    if (!window.confirm(`${type === 'long_term' ? t.settings.memoryConfirmClearLong : t.settings.memoryConfirmClearShort}`)) return;
    await clearMemory(type);
    if (type === 'long_term') setLongTerm('');
    else setShortTerm('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-400">{t.settings.memoryLoading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Brain size={16} className="text-purple-500" />
        <h3 className="font-semibold text-sm">{t.settings.memoryTitle}</h3>
      </div>

      {/* Auto-management notice */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-3 text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
        <div className="font-semibold mb-1">{t.settings.memoryAutoTitle}</div>
        {t.settings.memoryAutoDesc}
      </div>

      {/* Short-term rounds setting */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{t.settings.memoryShortTermLabel}</span>
            <p className="text-xs text-gray-400 mt-0.5">{t.settings.memoryShortTermDesc}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMemoryShortTermRounds(Math.max(1, memoryShortTermRounds - 1))}
              title={t.settings.memoryDecBtn}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold transition-colors"
            >−</button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">{memoryShortTermRounds}</span>
            <button
              onClick={() => setMemoryShortTermRounds(Math.min(20, memoryShortTermRounds + 1))}
              title={t.settings.memoryIncBtn}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold transition-colors"
            >+</button>
          </div>
        </div>
      </div>

      {/* Long-term memory — read-only */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{t.settings.memoryLongTermTitle}</span>
            <span className="ml-1.5 text-xs text-gray-400">{t.settings.memoryLongTermNote}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title={t.settings.memoryRefreshTitle} className="p-1 text-gray-400 hover:text-blue-500 transition-colors">
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => handleClear('long_term')}
              className="text-xs text-red-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {t.settings.memoryClearBtn}
            </button>
          </div>
        </div>
        <pre className="w-full min-h-[140px] px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 font-mono whitespace-pre-wrap break-words leading-relaxed overflow-y-auto max-h-[280px] select-text text-gray-700 dark:text-gray-300">
          {longTerm.trim() || t.settings.memoryLongTermEmpty}
        </pre>
      </div>

      {/* Short-term memory — read-only */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{t.settings.memoryShortTermTitle}</span>
            <span className="ml-1.5 text-xs text-gray-400">{t.settings.memoryShortTermNote.replace('{count}', String(memoryShortTermRounds))}</span>
          </div>
          <button
            onClick={() => handleClear('short_term')}
            className="text-xs text-red-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            {t.settings.memoryClearBtn}
          </button>
        </div>
        <pre className="w-full min-h-[80px] px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50 font-mono whitespace-pre-wrap break-words leading-relaxed overflow-y-auto max-h-[200px] select-text text-gray-700 dark:text-gray-300">
          {shortTerm.trim() || t.settings.memoryShortEmpty}
        </pre>
      </div>
    </div>
  );
};

/* ---- Prompt Hints Tab (correction prompts for model hallucination) ---- */
interface PromptHintsTabProps {
  prompts: UserSystemPrompt[];
  addPrompt: (prompt: UserSystemPrompt) => void;
  updatePrompt: (id: string, patch: Partial<UserSystemPrompt>) => void;
  removePrompt: (id: string) => void;
}

/** English display names for built-in default prompt hints (IDs defined in configStore). */
const BUILTIN_PROMPT_NAMES_EN: Record<string, string> = {
  'hint-date-format': 'Date Format Recognition',
  'hint-number-unit': 'Number Unit Inference',
  'hint-missing-data': 'Null Value & Outlier Handling',
};

const PromptHintsTab: React.FC<PromptHintsTabProps> = ({ prompts, addPrompt, updatePrompt, removePrompt }) => {
  const { t, lang } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuf, setEditBuf] = useState<Partial<UserSystemPrompt>>({});
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  const handleAdd = () => {
    if (!newName.trim() || !newContent.trim()) return;
    addPrompt({ id: uuidv4(), name: newName.trim(), content: newContent.trim(), enabled: true });
    setNewName('');
    setNewContent('');
  };

  const startEdit = (p: UserSystemPrompt) => {
    setEditingId(p.id);
    setEditBuf({ name: p.name, content: p.content });
  };

  const saveEdit = (id: string) => {
    if (editBuf.name?.trim() && editBuf.content?.trim()) {
      updatePrompt(id, editBuf);
    }
    setEditingId(null);
  };

  const enabledCount = prompts.filter((p) => p.enabled).length;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        {t.settings.promptHintsWhat}
        <br />{t.settings.promptHintsEnabledCount.replace('{n}', String(enabledCount))}
      </div>

      {prompts.map((p) => (
        <div
          key={p.id}
          className={`rounded-xl p-4 space-y-2 border transition-colors ${
            p.enabled
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-gray-50 dark:bg-gray-700/50 border-transparent'
          }`}
        >
          {editingId === p.id ? (
            <>
              <input
                value={editBuf.name || ''}
                onChange={(e) => setEditBuf((b) => ({ ...b, name: e.target.value }))}
                placeholder={t.settings.promptHintsRuleNamePlaceholder}
                title={t.settings.promptHintsRuleNamePlaceholder}
                className="w-full text-sm bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none font-medium"
              />
              <textarea
                value={editBuf.content || ''}
                onChange={(e) => setEditBuf((b) => ({ ...b, content: e.target.value }))}
                placeholder={t.settings.promptHintsContentPlaceholder}
                title={t.settings.promptHintsContentTitle}
                rows={4}
                className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 outline-none resize-none font-mono"
              />
              <button
                onClick={() => saveEdit(p.id)}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                <Check size={12} /> {t.settings.promptHintsSaveBtn}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{lang === 'en-US' ? (BUILTIN_PROMPT_NAMES_EN[p.id] ?? p.name) : p.name}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Toggle enabled/disabled */}
                  <button
                    onClick={() => updatePrompt(p.id, { enabled: !p.enabled })}
                    title={p.enabled ? t.settings.promptHintsEnableTitle : t.settings.promptHintsDisableTitle}
                    className={`transition-colors ${p.enabled ? 'text-green-500 hover:text-green-600' : 'text-gray-300 hover:text-gray-400'}`}
                  >
                    {p.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => startEdit(p)} title={t.settings.promptHintsEditTitle} className="text-gray-400 hover:text-blue-500">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => removePrompt(p.id)} title={t.settings.promptHintsDeleteTitle} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 bg-white dark:bg-gray-800 rounded-lg p-2 line-clamp-4 whitespace-pre-wrap font-mono leading-relaxed">
                {p.content}
              </div>
              {p.enabled && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  {t.settings.promptHintsEnabledBadge}
                </span>
              )}
            </>
          )}
        </div>
      ))}

      {/* Add new prompt hint */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
        <div className="text-sm font-medium">{t.settings.promptHintsAddTitle}</div>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.settings.promptHintsAddNamePlaceholder}
          title={t.settings.promptHintsRuleNamePlaceholder}
          className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none"
        />
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={t.settings.promptHintsAddContentPlaceholder}
          title={t.settings.promptHintsContentTitle}
          rows={4}
          className="w-full text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 outline-none resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || !newContent.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm py-1.5 rounded-lg transition-colors"
        >
          {t.settings.promptHintsAddBtn}
        </button>
      </div>
    </div>
  );
};

/* ---- ReAct Agent Config Section ---- */
const ReactAgentConfigSection: React.FC = () => {
  const { t } = useI18n();
  const { reactMaxSteps, setReactMaxSteps } = useConfigStore();
  const [inputVal, setInputVal] = useState(String(reactMaxSteps));

  const handleBlur = () => {
    const n = parseInt(inputVal, 10);
    if (!isNaN(n) && (n === -1 || n >= 1)) {
      setReactMaxSteps(n);
    } else {
      setInputVal(String(reactMaxSteps));
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain size={14} className="text-blue-500" />
        <span className="text-sm font-medium">{t.settings.reactAgentTitle}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t.settings.reactAgentDesc}
      </p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={handleBlur}
          min={-1}
          step={1}
          title={t.settings.reactAgentTitle}
          placeholder="30"
          className="w-28 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-400/40 text-sm font-mono"
        />
        <span className="text-xs text-gray-400">{t.settings.reactAgentUnit}（{t.settings.reactAgentCurrent}{reactMaxSteps === -1 ? t.settings.reactAgentUnlimited : t.settings.reactAgentMax.replace('{n}', String(reactMaxSteps))}）</span>
        {reactMaxSteps !== 30 && (
          <button
            onClick={() => { setReactMaxSteps(30); setInputVal('30'); }}
            className="text-xs text-blue-500 hover:underline"
          >
            {t.settings.reactAgentReset}
          </button>
        )}
      </div>
    </div>
  );
};

/* ---- System Info Tab ---- */
import type { WindowsIdentity } from '../types';

interface SystemInfoTabProps {
  identity: WindowsIdentity | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

const SystemInfoTab: React.FC<SystemInfoTabProps> = ({ identity, loading, error, onRefresh }) => {
  const { t } = useI18n();
  const rows: Array<{ label: string; value: string; mono?: boolean }> = identity
    ? [
        { label: t.settings.sysInfoLogin, value: identity.displayName, mono: true },
        { label: t.settings.sysInfoUsername, value: identity.username, mono: true },
        { label: t.settings.sysInfoDomain, value: identity.domain || '—', mono: true },
        {
          label: 'SID',
          value: identity.sid || t.settings.sysInfoSidFallback,
          mono: true,
        },
        { label: t.settings.sysInfoSource, value: identity.source === 'whoami' ? t.settings.sysInfoSourcePrecise : t.settings.sysInfoSourceFallback },
        {
          label: t.settings.sysInfoLastSeen,
          value: new Date(identity.lastSeenAt).toLocaleString(),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        <strong>{t.settings.sysInfoTitle}</strong><br />
        {t.settings.sysInfoDesc1}<br />
        {t.settings.sysInfoDesc2}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
          <RefreshCw size={16} className="animate-spin" />
          {t.settings.sysInfoLoading}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{t.settings.sysInfoErrorPrefix}{error}</span>
        </div>
      )}

      {/* Identity card */}
      {!loading && identity && (
        <>
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                identity.isFallback
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              {identity.isFallback ? (
                <>
                  <AlertCircle size={11} /> {t.settings.sysInfoFallbackBadge}
                </>
              ) : (
                <>
                  <ShieldCheck size={11} /> {t.settings.sysInfoPreciseBadge}
                </>
              )}
            </div>
          </div>

          {/* Info table */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden">
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-start gap-4 px-4 py-3 text-sm ${
                  i < rows.length - 1 ? 'border-b border-gray-200 dark:border-gray-600' : ''
                }`}
              >
                <span className="w-32 flex-shrink-0 text-gray-500 text-xs pt-0.5">{row.label}</span>
                <span
                  className={`flex-1 break-all text-xs leading-relaxed ${
                    row.mono ? 'font-mono' : ''
                  } ${
                    row.label === 'SID' && !identity.sid
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Permission readiness hint */}
          <div
            className={`rounded-xl p-3 text-xs leading-relaxed ${
              identity.isFallback
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            }`}
          >
            {identity.isFallback ? (
              <>
                {t.settings.sysInfoFallbackLine1}<br />
                {t.settings.sysInfoFallbackLine2} <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{identity.domain}\{identity.username}</code> {t.settings.sysInfoFallbackLine3}
              </>
            ) : (
              <>
                {t.settings.sysInfoSuccessLine1}<br />
                {t.settings.sysInfoSuccessLine2} <code className="bg-green-100 dark:bg-green-900/40 px-1 rounded font-mono">{identity.sid.slice(0, 28)}…</code> {t.settings.sysInfoSuccessLine3}
              </>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !identity && !error && (
        <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
          <User size={32} className="opacity-40" />
          <p className="text-sm">{t.settings.sysInfoEmpty}</p>
        </div>
      )}

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? t.settings.sysInfoRefreshing : t.settings.sysInfoRefreshBtn}
      </button>
    </div>
  );
};

/* ---- Activation Tab ---- */
interface ActivationTabProps {
  status: ActivationStatus | null;
  onReactivated?: (status: ActivationStatus) => void;
}

const ActivationTab: React.FC<ActivationTabProps> = ({ status, onReactivated }) => {
  const { t } = useI18n();
  const [newCode, setNewCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [machineCode, setMachineCode] = useState<string>(status?.machineCode ?? '...');

  // Refresh machine code if not yet available
  React.useEffect(() => {
    if (!machineCode || machineCode === '...') {
      window.electronAPI?.activationGetMachineCode?.().then(setMachineCode).catch(() => {});
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(machineCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async () => {
    const trimmed = newCode.trim();
    if (!trimmed) { setError(t.settings.activationEnterCode); return; }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI?.activationSubmit?.(trimmed);
      if (!result) { setError(t.settings.activationApiUnavailable); return; }
      if (result.ok && result.status) {
        setSuccess(t.settings.activationSuccess);
        setNewCode('');
        onReactivated?.(result.status as ActivationStatus);
      } else {
        setError(result.message || t.settings.activationFailed);
      }
    } catch { setError(t.settings.activationRequestFailed); }
    finally { setSubmitting(false); }
  };

  const activated = status?.activated;
  const expiryDate = status?.expiry ? new Date(status.expiry) : null;

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className={`rounded-xl p-4 flex items-start gap-3 border ${
        activated
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}>
        {activated
          ? <ShieldCheck size={22} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          : <ShieldAlert size={22} className="text-red-500 flex-shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm mb-1 ${activated ? 'text-green-700 dark:text-green-300' : 'text-red-600'}`}>
            {activated ? t.settings.activationActivated : t.settings.activationNotActivated}
          </div>
          {activated && expiryDate && (
            <div className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
              <div>
                {t.settings.activationExpiry}{expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              {status?.daysRemaining !== null && status?.daysRemaining !== undefined && (
                <div className={status.daysRemaining <= 30 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                  {t.settings.activationDaysRemaining.replace('{n}', String(status.daysRemaining))}
                  {status.daysRemaining <= 30 && ' ' + t.settings.activationExpiringSoon}
                </div>
              )}
            </div>
          )}
          {!activated && (
            <div className="text-xs text-red-500 mt-0.5">{status?.reason || t.settings.activationNotActivatedReason}</div>
          )}
        </div>
      </div>

      {/* Machine code */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t.settings.activationMachineCodeLabel}</label>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-600">
          <span className="font-mono text-base font-bold tracking-[.2em] text-gray-800 dark:text-gray-100 flex-1 select-all">
            {machineCode}
          </span>
          <button onClick={handleCopy} title={t.settings.activationCopyMachineTitle} className="text-gray-400 hover:text-blue-500 transition-colors">
            {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {t.settings.activationMachineCodeHint1}
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded mx-1">node scripts/generate-auth-code.js {machineCode}</code>
          {t.settings.activationMachineCodeHint2}
        </p>
      </div>

      {/* New auth code input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {activated ? t.settings.activationUpdateCode : t.settings.activationInputCode}
        </label>
        <input
          type="text"
          value={newCode}
          onChange={(e) => { setNewCode(e.target.value.toUpperCase()); setError(null); setSuccess(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit(); }}
          placeholder="YYYYMMDD-XXXXX-XXXXX"
          spellCheck={false}
          className="w-full font-mono text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-wider"
        />
        {error && (
          <div className="flex items-center gap-1.5 text-red-500 text-xs">
            <AlertCircle size={13} /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-1.5 text-green-500 text-xs">
            <Check size={13} /> {success}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !newCode.trim()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2.5 rounded-xl transition-colors"
        >
          {submitting ? <><Loader2 size={14} className="animate-spin" /> {t.settings.activationVerifying}</> : <><ShieldCheck size={14} /> {activated ? t.settings.activationUpdateBtn : t.settings.activationActivateBtn}</>}
        </button>
      </div>
    </div>
  );
};

/* ---- Storage Tab ---- */
const StorageTab: React.FC = () => {
  const { t } = useI18n();
  const [dataDir, setDataDir] = useState('');
  const [newDir, setNewDir] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    window.electronAPI?.fsGetDataDir?.().then((dir) => {
      setDataDir(dir || '');
    }).catch(() => {});
  }, []);

  const handleBrowse = async () => {
    if (!window.electronAPI?.fsSelectDirectory) return;
    const dir = await window.electronAPI.fsSelectDirectory();
    if (dir) setNewDir(dir);
  };

  const handleMigrate = async () => {
    if (!newDir.trim() || !window.electronAPI?.fsMigrateDataDir) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const result = await window.electronAPI.fsMigrateDataDir(newDir.trim());
      setMigrateResult(result);
      if (result.ok) {
        setDataDir(newDir.trim());
        setNewDir('');
      }
    } catch (e: unknown) {
      setMigrateResult({ ok: false, message: e instanceof Error ? e.message : t.settings.dsMigrateError });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-blue-500" />
        <h3 className="font-semibold text-sm">{t.settings.storageTitle}</h3>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        <strong>{t.settings.storageNoteKey}</strong> {t.settings.storageNote}
      </div>

      {/* Current directory */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400">{t.settings.currentDirLabel}</label>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-600">
          <FolderOpen size={15} className="text-gray-400 flex-shrink-0" />
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300 flex-1 break-all select-all">
            {dataDir || t.settings.storageLoading}
          </span>
          <button
            onClick={() => window.electronAPI?.fsOpenDataDir?.()}
            title={t.settings.openDirTitle}
            className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      {/* Directory migration */}
      <div className="space-y-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <div className="text-sm font-medium">{t.settings.migrateTitle}</div>
        <p className="text-xs text-gray-500">{t.settings.migrateDesc}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newDir}
            onChange={(e) => { setNewDir(e.target.value); setMigrateResult(null); }}
            placeholder={t.settings.migrateDirPlaceholder}
            title={t.settings.storageDirTitle}
            className="flex-1 text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 outline-none focus:ring-1 focus:ring-blue-400 font-mono"
          />
          <button
            onClick={handleBrowse}
            className="flex items-center gap-1 px-3 py-2 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <FolderOpen size={12} />
            {t.settings.browse}
          </button>
        </div>
        {migrateResult && (
          <div className={`text-xs px-3 py-2 rounded-lg ${migrateResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
            {migrateResult.ok ? '✓ ' : '✗ '}{migrateResult.message}
            {migrateResult.ok && <span className="block mt-0.5 text-green-600 dark:text-green-400">{t.settings.migrateRestartNote}</span>}
          </div>
        )}
        <button
          onClick={handleMigrate}
          disabled={!newDir.trim() || migrating}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2 rounded-xl transition-colors"
        >
          {migrating ? <><Loader2 size={14} className="animate-spin" /> {t.settings.migrating}</> : t.settings.migrateBtn}
        </button>
      </div>
    </div>
  );
};

/* ---- Data Parsing Tab ---- */
const DataParsingTab: React.FC = () => {
  const { t } = useI18n();
  const { dataParsingLimits, setDataParsingLimits } = useConfigStore();

  const FIELDS = [
    {
      key: 'excelMaxRows' as const,
      label: t.settings.excelMaxRows,
      desc: t.settings.excelMaxRowsDesc,
      unit: t.settings.excelMaxRowsUnit,
      min: 10, max: 100000, step: 100,
    },
    {
      key: 'csvMaxRows' as const,
      label: t.settings.csvMaxRows,
      desc: t.settings.csvMaxRowsDesc,
      unit: t.settings.csvMaxRowsUnit,
      min: 10, max: 100000, step: 100,
    },
    {
      key: 'pdfMaxChars' as const,
      label: t.settings.pdfMaxChars,
      desc: t.settings.pdfMaxCharsDesc,
      unit: t.settings.pdfMaxCharsUnit,
      min: 1000, max: 500000, step: 5000,
    },
    {
      key: 'textMaxChars' as const,
      label: t.settings.textMaxChars,
      desc: t.settings.textMaxCharsDesc,
      unit: t.settings.textMaxCharsUnit,
      min: 500, max: 200000, step: 1000,
    },
    {
      key: 'dbQueryMaxRows' as const,
      label: t.settings.dbQueryMaxRows,
      desc: t.settings.dbQueryMaxRowsDesc,
      unit: t.settings.dbQueryMaxRowsUnit,
      min: 10, max: 100000, step: 100,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-blue-500" />
        <h3 className="font-semibold text-sm">{t.settings.dataParsingTitle}</h3>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        {t.settings.dataParsingNote}
      </div>

      <div className="space-y-3">
        {FIELDS.map(({ key, label, desc, unit, min, max, step }) => (
          <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={dataParsingLimits[key]}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= min && v <= max) setDataParsingLimits({ [key]: v });
                  }}
                  title={label}
                  className="w-28 text-sm text-right bg-white dark:bg-gray-800 rounded-lg px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-xs text-gray-400 w-8 flex-shrink-0">{unit}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{t.settings.dataParsingRange}: {min.toLocaleString()} - {max.toLocaleString()} {unit}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t.settings.dataParsingImmediateEffect}</p>
    </div>
  );
};

/* ---- Datasources Tab ---- */
const DEFAULT_PORTS: Record<DatasourceType, number> = { mysql: 3306, doris: 9030, postgresql: 5432, presto: 8080 };

const EMPTY_DS = (): DatasourceConfig => ({
  id: uuidv4(),
  name: '',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: '',
  username: '',
  password: '',
  charset: 'utf8mb4',
  fetchSize: 1000,
  socketTimeout: 30,
  maxPoolSize: 10,
  validateOnBorrow: true,
  sshEnabled: false,
  sshPort: 22,
  options: {},
  createdAt: '',
  updatedAt: '',
});

const DatasourcesTab: React.FC = () => {
  const { t } = useI18n();
  const { datasources, loading, error, loadDatasources, saveDatasource, deleteDatasource, testDatasource } = useDatasourceStore();
  const [selected, setSelected] = useState<DatasourceConfig | null>(null);
  const [buf, setBuf] = useState<DatasourceConfig>(EMPTY_DS());
  const [isNew, setIsNew] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  const [dsSubTab, setDsSubTab] = useState<'config' | 'schema'>('config');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ basic: true, advanced: false, pool: false, ssh: false });
  const [saveError, setSaveError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const toggleSection = (key: string) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  useEffect(() => { loadDatasources(); }, [loadDatasources]);

  // Click existing datasource → read-only view mode
  const startView = (ds: DatasourceConfig) => {
    setSelected(ds);
    setBuf({ ...ds });
    setIsNew(false);
    setViewMode('view');
    setDsSubTab('config');
    setTestResult(null);
    setShowPw(false);
  };

  // Enter edit mode from view mode
  const enterEdit = () => {
    setViewMode('edit');
    setOpenSections({ basic: true, advanced: false, pool: false, ssh: false });
    setSaveError(null);
  };

  const startNew = () => {
    const ds = EMPTY_DS();
    setSelected(null);
    setBuf(ds);
    setIsNew(true);
    setViewMode('edit');
    setDsSubTab('config');
    setTestResult(null);
    setShowPw(false);
    setOpenSections({ basic: true, advanced: false, pool: false, ssh: false });
  };

  const handleSave = async () => {
    if (!buf.name.trim()) { setSaveError(t.settings.dsValidateName); return; }
    if (!buf.host.trim()) { setSaveError(t.settings.dsValidateHost); return; }
    if (!buf.database.trim()) { setSaveError(t.settings.dsValidateDb); return; }
    setSaveError(null);
    setSaving(true);
    try {
      await saveDatasource(buf);
      setIsNew(false);
      setSelected(buf);
      setViewMode('view');
      setTestResult(null);
      await loadDatasources();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.settings.dsConfirmDelete)) return;
    await deleteDatasource(id);
    if (selected?.id === id) { setSelected(null); setBuf(EMPTY_DS()); setIsNew(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const idToTest = isNew ? buf.id : (selected?.id ?? buf.id);
      if (isNew) { await saveDatasource(buf); await loadDatasources(); setIsNew(false); setSelected(buf); setViewMode('view'); }
      const res = await testDatasource(idToTest);
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const onTypeChange = (t: DatasourceType) => {
    setBuf((b) => ({ ...b, type: t, port: DEFAULT_PORTS[t] }));
  };

  const computeConnUrl = (b: DatasourceConfig): string => {
    try {
      const proto = b.type === 'postgresql' ? 'postgresql' : b.type === 'presto' ? 'presto' : b.type;
      const auth = b.username ? `${encodeURIComponent(b.username)}${b.password ? ':****' : ''}@` : '';
      return `${proto}://${auth}${b.host}:${b.port}/${b.database}`;
    } catch { return ''; }
  };

  const showRight = isNew || selected != null;
  const isEditing = viewMode === 'edit' || isNew;

  const DS_TYPE_COLORS: Record<string, string> = {
    mysql: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    doris: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    postgresql: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    presto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  };

  const SectionHeader: React.FC<{ sectionKey: string; title: string; badge?: string }> = ({ sectionKey, title, badge }) => (
    <button
      type="button"
      title={title}
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/80 rounded-lg transition-colors"
    >
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{title}</span>
      <div className="flex items-center gap-2">
        {badge && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded">{badge}</span>}
        {openSections[sectionKey] ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t.settings.dsTitle}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t.settings.dsDesc}
          </p>
        </div>
        <button
          onClick={startNew}
          title={t.settings.dsAddTitle}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <Plus size={13} /> {t.settings.dsAddTitle}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: list */}
        <div className="space-y-2">
          {loading && <div className="text-sm text-gray-400 animate-pulse">{t.settings.dsLoading}</div>}
          {!loading && datasources.length === 0 && !isNew && (
            <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
              {t.settings.dsEmpty}
            </div>
          )}
          {datasources.map((ds) => (
            <div
              key={ds.id}
              onClick={() => startView(ds)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                selected?.id === ds.id && !isNew
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-700/30'
              }`}
            >
              <Database size={14} className="text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{ds.name}</div>
                <div className="text-[11px] text-gray-400 truncate">{ds.type} · {ds.host}:{ds.port}/{ds.database}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(ds.id); }}
                title={t.settings.dsDeleteTitle}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {isNew && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-400 bg-blue-50 dark:bg-blue-900/20">
              <Database size={14} className="text-blue-400" />
              <span className="text-sm text-blue-600 dark:text-blue-300">{t.settings.dsNewItem}</span>
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {showRight && (
          <div className="lg:col-span-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-700/20 overflow-hidden">
            {/* Header bar with sub-tabs */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-700/40">
              <Database size={14} className="text-blue-400 flex-shrink-0" />
              <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex-1 truncate">
                {isNew ? t.settings.dsNewPanelTitle : selected?.name ?? ''}
                {!isNew && selected && (
                  <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${DS_TYPE_COLORS[selected.type] || 'bg-gray-100 text-gray-600'}`}>
                    {selected.type}
                  </span>
                )}
                {isEditing && !isNew && <span className="ml-2 text-[10px] text-amber-500">{t.settings.dsEditingBadge}</span>}
              </span>

              {/* Sub-tabs (only for existing saved datasources) */}
              {!isNew && selected && (
                <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden flex-shrink-0">
                  <button
                    onClick={() => { setDsSubTab('config'); }}
                    title={t.settings.dsConfigTab}
                    className={`px-3 py-1 text-xs transition-colors ${dsSubTab === 'config' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    {t.settings.dsConfigTab}
                  </button>
                  <button
                    onClick={() => { setDsSubTab('schema'); setViewMode('view'); }}
                    title={t.settings.dsSchemaTab}
                    className={`px-3 py-1 text-xs transition-colors flex items-center gap-1 ${dsSubTab === 'schema' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    <Network size={10} /> {t.settings.dsSchemaTab}
                  </button>
                </div>
              )}

              <button
                onClick={() => { setSelected(null); setBuf(EMPTY_DS()); setIsNew(false); setTestResult(null); setSaveError(null); setViewMode('view'); }}
                title={isNew ? t.settings.dsCancelNewTitle : t.settings.dsCloseTitle}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Schema sub-tab ── */}
            {!isNew && selected && dsSubTab === 'schema' && (
              <div className="p-3" style={{ height: 500, display: 'flex', flexDirection: 'column' }}>
                <SchemaGraphTab forDsId={selected.id} />
              </div>
            )}

            {/* ── Config sub-tab ── */}
            {(isNew || dsSubTab === 'config') && (
              <>
                {/* Read-only view */}
                {!isEditing && selected && (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Database size={20} className="text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-gray-800 dark:text-gray-200">{selected.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{selected.host}:{selected.port}/{selected.database}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-gray-400 mb-0.5">{t.settings.dsTypeLabel}</div>
                        <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${DS_TYPE_COLORS[selected.type] || 'bg-gray-100 text-gray-600'}`}>{selected.type}</span>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-0.5">{t.settings.dsPortLabel}</div>
                        <div className="font-mono text-gray-700 dark:text-gray-200">{selected.port}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-0.5">{t.settings.dsUsernameLabel}</div>
                        <div className="text-gray-700 dark:text-gray-200">{selected.username || <span className="text-gray-300 italic">{t.settings.dsValueNotSet}</span>}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-0.5">{t.settings.dsPasswordLabel}</div>
                        <div className="font-mono text-gray-400">{'••••••'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-400 mb-0.5">{t.settings.dsUrlAutoLabel}</div>
                        <code className="block px-2 py-1.5 text-[11px] font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-500 truncate">
                          {computeConnUrl(selected)}
                        </code>
                      </div>
                      <div className="col-span-2">
                        <div className="text-gray-400 mb-0.5">{t.settings.dsIdLabel}</div>
                        <code className="block px-2 py-1.5 text-[11px] font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-400">
                          {selected.id}
                        </code>
                      </div>
                      {selected.sshEnabled && (
                        <div className="col-span-2">
                          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                            {t.settings.dsSshTunnel.replace('{user}', selected.sshUser ?? '').replace('{host}', selected.sshHost ?? '').replace('{port}', String(selected.sshPort ?? 22))}
                          </span>
                        </div>
                      )}
                    </div>

                    {testResult && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}>
                        {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {testResult.message}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                      <button onClick={enterEdit} title={t.settings.dsEditBtn}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                        <Edit2 size={12} /> {t.settings.dsEditBtn}
                      </button>
                      <button onClick={handleTest} disabled={testing} title={t.settings.dsTestBtn}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 hover:border-blue-400 disabled:opacity-50 text-gray-600 dark:text-gray-300 rounded-lg transition-colors">
                        {testing ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
                        {t.settings.dsTestBtn}
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <>
                    <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                      <SectionHeader sectionKey="basic" title={t.settings.dsBasicSection} badge={t.settings.dsRequired} />
                      {openSections.basic && (
                        <div className="grid grid-cols-2 gap-3 pl-1">
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsNameLabel}</label>
                            <input title={t.settings.dsNameLabel} autoFocus={isNew} value={buf.name} onChange={(e) => setBuf((b) => ({ ...b, name: e.target.value }))} placeholder={t.settings.dsNamePlaceholder} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsTypeLabel}</label>
                            <select title={t.settings.dsTypeLabel} value={buf.type} onChange={(e) => onTypeChange(e.target.value as DatasourceType)} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                              <option value="mysql">MySQL</option>
                              <option value="doris">Apache Doris</option>
                              <option value="postgresql">PostgreSQL</option>
                              <option value="presto">Presto</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsPortLabel}</label>
                            <input title={t.settings.dsPortLabel} type="number" value={buf.port} onChange={(e) => setBuf((b) => ({ ...b, port: Number(e.target.value) }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsHostLabel}</label>
                            <input title={t.settings.dsHostLabel} value={buf.host} onChange={(e) => setBuf((b) => ({ ...b, host: e.target.value }))} placeholder={t.settings.dsHostPlaceholder} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsDbLabel}</label>
                            <input title={t.settings.dsDbLabel} value={buf.database} onChange={(e) => setBuf((b) => ({ ...b, database: e.target.value }))} placeholder={t.settings.dsDbPlaceholder} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsUsernameLabel}</label>
                            <input title={t.settings.dsUsernameLabel} value={buf.username} onChange={(e) => setBuf((b) => ({ ...b, username: e.target.value }))} placeholder={t.settings.dsUsernamePlaceholder} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsPasswordLabel}</label>
                            <div className="relative">
                              <input ref={passwordRef} title={t.settings.dsPasswordLabel} type={showPw ? 'text' : 'password'} value={buf.password === '__MASKED__' ? '' : buf.password} readOnly={buf.password === '__MASKED__'} onChange={(e) => setBuf((b) => ({ ...b, password: e.target.value }))} placeholder={buf.password === '__MASKED__' ? t.settings.dsPasswordSaved : '••••••••'} className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              {buf.password === '__MASKED__' ? (
                                <button type="button" title={t.settings.dsPasswordChange} onClick={() => setBuf((b) => ({ ...b, password: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 hover:text-blue-700">{t.settings.dsPasswordChange}</button>
                              ) : (
                                <button type="button" title={showPw ? t.settings.dsPasswordHide : t.settings.dsPasswordShow} onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsUrlAutoLabel}</label>
                            <code className="flex-1 px-2 py-1 text-[11px] font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-500 truncate block">
                              {computeConnUrl(buf) || t.settings.dsUrlAutoPlaceholder}
                            </code>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsIdLabel}</label>
                            <code className="block px-2 py-1 text-[11px] font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-gray-400">{buf.id}</code>
                          </div>
                        </div>
                      )}

                      <SectionHeader sectionKey="advanced" title={t.settings.dsAdvancedSection} />
                      {openSections.advanced && (
                        <div className="grid grid-cols-3 gap-3 pl-1">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsCharsetLabel}</label>
                            <select title={t.settings.dsCharsetLabel} value={buf.charset ?? 'utf8mb4'} onChange={(e) => setBuf((b) => ({ ...b, charset: e.target.value }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                              <option value="utf8mb4">utf8mb4</option><option value="utf8">utf8</option><option value="latin1">latin1</option>
                              <option value="gbk">gbk</option><option value="gb2312">gb2312</option><option value="utf16">utf16</option>
                              <option value="ascii">ascii</option><option value="binary">binary</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Fetch Size</label>
                            <input title="Fetch Size" type="number" value={buf.fetchSize ?? 1000} onChange={(e) => setBuf((b) => ({ ...b, fetchSize: Number(e.target.value) }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsSocketTimeoutLabel}</label>
                            <input title={t.settings.dsSocketTimeoutLabel} type="number" value={buf.socketTimeout ?? 30} onChange={(e) => setBuf((b) => ({ ...b, socketTimeout: Number(e.target.value) }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                        </div>
                      )}

                      <SectionHeader sectionKey="pool" title={t.settings.dsPoolSection} />
                      {openSections.pool && (
                        <div className="grid grid-cols-2 gap-3 pl-1">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t.settings.dsMaxPoolLabel}</label>
                            <input title={t.settings.dsMaxPoolLabel} type="number" value={buf.maxPoolSize ?? 10} onChange={(e) => setBuf((b) => ({ ...b, maxPoolSize: Number(e.target.value) }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </div>
                          <div className="flex items-center gap-2 pt-4">
                            <input id="validateOnBorrow" type="checkbox" title={t.settings.dsValidateLabel} checked={buf.validateOnBorrow ?? true} onChange={(e) => setBuf((b) => ({ ...b, validateOnBorrow: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-500" />
                            <label htmlFor="validateOnBorrow" className="text-xs text-gray-600 dark:text-gray-300">{t.settings.dsValidateLabel}</label>
                          </div>
                        </div>
                      )}

                      <SectionHeader sectionKey="ssh" title={t.settings.dsSshSection} badge={buf.sshEnabled ? t.settings.dsSshEnabled : undefined} />
                      {openSections.ssh && (
                        <div className="space-y-3 pl-1">
                          <div className="flex items-center gap-2">
                            <input id="sshEnabled" type="checkbox" title={t.settings.dsSshEnableLabel} checked={buf.sshEnabled ?? false} onChange={(e) => setBuf((b) => ({ ...b, sshEnabled: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-500" />
                            <label htmlFor="sshEnabled" className="text-xs font-medium text-gray-600 dark:text-gray-300">{t.settings.dsSshEnableLabel}</label>
                          </div>
                          {buf.sshEnabled && (
                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">{t.settings.dsSshHostLabel}</label><input title={t.settings.dsSshHostLabel} value={buf.sshHost ?? ''} onChange={(e) => setBuf((b) => ({ ...b, sshHost: e.target.value }))} placeholder="jump.example.com" className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>
                              <div><label className="block text-xs text-gray-500 mb-1">{t.settings.dsSshPortLabel}</label><input title={t.settings.dsSshPortLabel} type="number" value={buf.sshPort ?? 22} onChange={(e) => setBuf((b) => ({ ...b, sshPort: Number(e.target.value) }))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>
                              <div className="col-span-3"><label className="block text-xs text-gray-500 mb-1">{t.settings.dsSshUserLabel}</label><input title={t.settings.dsSshUserLabel} value={buf.sshUser ?? ''} onChange={(e) => setBuf((b) => ({ ...b, sshUser: e.target.value }))} placeholder="ec2-user" className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>
                              <div className="col-span-3"><label className="block text-xs text-gray-500 mb-1">{t.settings.dsSshKeyLabel}</label><textarea title={t.settings.dsSshKeyLabel} value={buf.sshPrivateKey ?? ''} onChange={(e) => setBuf((b) => ({ ...b, sshPrivateKey: e.target.value }))} rows={3} placeholder="-----BEGIN RSA PRIVATE KEY-----" className="w-full px-3 py-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" /></div>
                            </div>
                          )}
                        </div>
                      )}

                      {testResult && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                          {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {testResult.message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-700/30">
                      {saveError && (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 flex-1 min-w-0">
                          <XCircle size={11} className="flex-shrink-0" />
                          <span className="truncate">{saveError}</span>
                        </div>
                      )}
                      <button onClick={handleSave} disabled={saving} title={t.settings.dsSaveBtn} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t.settings.dsSaveBtn}
                      </button>
                      <button onClick={handleTest} disabled={testing} title={t.settings.dsTestBtn} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 hover:border-blue-400 disabled:opacity-50 text-gray-600 dark:text-gray-300 rounded-lg transition-colors">
                        {testing ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />} {t.settings.dsTestBtn}
                      </button>
                      {!isNew && (
                        <button onClick={() => { setViewMode('view'); setSaveError(null); setBuf({ ...selected! }); }} title={t.settings.dsCancelBtn} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          {t.settings.dsCancelBtn}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---- Help Tab ---- */
/* ---- Language Tab ---- */
const LanguageTab: React.FC<{ currentLang: string; setLanguage: (lang: 'zh-CN' | 'en-US') => void }> = ({ currentLang, setLanguage }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t.settings.languageTitle}</h3>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {([
          { code: 'zh-CN', label: t.settings.langZhCN, flag: '🇨🇳' },
          { code: 'en-US', label: 'English', flag: '🇺🇸' },
        ] as const).map(({ code, label, flag }) => (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              currentLang === code
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-200'
            }`}
          >
            <span className="text-lg">{flag}</span>
            <span>{label}</span>
            {currentLang === code && <Check size={14} className="ml-auto text-blue-500" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm">{t.settings.languageNote}</p>
    </div>
  );
};

const HelpTab: React.FC = () => {
  const { t } = useI18n();
  const [openSection, setOpenSection] = useState<string | null>('quick-start');
  const [devClickCount, setDevClickCount] = useState(0);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const devClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionClick = () => {
    if (devUnlocked) return;
    const next = devClickCount + 1;
    setDevClickCount(next);
    if (devClickTimer.current) clearTimeout(devClickTimer.current);
    devClickTimer.current = setTimeout(() => setDevClickCount(0), 3000);
    if (next >= 10) {
      setDevUnlocked(true);
      setDevClickCount(0);
      if (devClickTimer.current) clearTimeout(devClickTimer.current);
      // Unlock DevTools in main process (session-only)
      (window as any).electronAPI?.devtoolsUnlock?.();
    }
  };

  const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => {
    const open = openSection === id;
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setOpenSection(open ? null : id)}
          title={title}
        >
          <span>{title}</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {open && (
          <div className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300 leading-relaxed space-y-3 bg-white dark:bg-gray-800">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen size={16} className="text-blue-500" />
        <h3 className="font-semibold text-sm">{t.settings.helpTitle}</h3>
      </div>

      <Section id="quick-start" title={t.settings.helpQuickStart}>
        <ol className="space-y-3 list-none">
          {[
            { step: '1', title: t.settings.helpQS1Title, desc: t.settings.helpQS1Desc },
            { step: '2', title: t.settings.helpQS2Title, desc: t.settings.helpQS2Desc },
            { step: '3', title: t.settings.helpQS3Title, desc: t.settings.helpQS3Desc },
            { step: '4', title: t.settings.helpQS4Title, desc: t.settings.helpQS4Desc },
            { step: '5', title: t.settings.helpQS5Title, desc: t.settings.helpQS5Desc },
          ].map(({ step, title, desc }) => (
            <li key={step} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{step}</span>
              <div>
                <div className="font-semibold text-gray-700 dark:text-gray-200 mb-0.5">{title}</div>
                <div>{desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="features" title={t.settings.helpFeatures}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '📊', name: t.settings.helpFeat1Name, desc: t.settings.helpFeat1Desc },
            { icon: '📑', name: t.settings.helpFeat2Name, desc: t.settings.helpFeat2Desc },
            { icon: '📄', name: t.settings.helpFeat3Name, desc: t.settings.helpFeat3Desc },
            { icon: '🎞️', name: t.settings.helpFeat4Name, desc: t.settings.helpFeat4Desc },
            { icon: '📝', name: t.settings.helpFeat5Name, desc: t.settings.helpFeat5Desc },
            { icon: '🖼️', name: t.settings.helpFeat6Name, desc: t.settings.helpFeat6Desc },
          ].map(({ icon, name, desc }) => (
            <div key={name} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="font-medium mb-1">{icon} {name}</div>
              <div className="text-gray-500">{desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="charts" title={t.settings.helpChartsTitle}>
        <p>{t.settings.helpChartsIntro}</p>
        <div className="space-y-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">{t.settings.helpChartsECharts}</div>
            <p>{t.settings.helpChartsEChartsDesc}</p>
            <p className="mt-1 text-gray-500">{t.settings.helpChartsEChartsTrigger}</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">{t.settings.helpChartsApex}</div>
            <p>{t.settings.helpChartsApexDesc}</p>
            <p className="mt-1 text-gray-500">{t.settings.helpChartsApexTrigger}</p>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          <div className="font-semibold text-amber-700 dark:text-amber-300 mb-1">{t.settings.helpChartsErrorTitle}</div>
          <p>{t.settings.helpChartsErrorDesc}</p>
        </div>
      </Section>

      <Section id="themes" title={t.settings.helpThemesTitle}>
        <div className="space-y-3">
          <div>
            <div className="font-semibold mb-1">{t.settings.helpThemesStyle}</div>
            <p>{t.settings.helpThemesStyleDesc}</p>
          </div>
          <div>
            <div className="font-semibold mb-1">{t.settings.helpThemesTheme}</div>
            <p>{t.settings.helpThemesThemeDesc}</p>
          </div>
          <div>
            <div className="font-semibold mb-1">{t.settings.helpThemesGlobal}</div>
            <p>{t.settings.helpThemesGlobalDesc}</p>
          </div>
        </div>
      </Section>

      <Section id="memory" title={t.settings.helpMemoryTitle}>
        <div className="space-y-3">
          <p>{t.settings.helpMemoryIntro}</p>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
            <div>
              <span className="font-semibold">{t.settings.helpMemoryLongTitle}</span>
              <span className="text-gray-500 ml-1">{t.settings.helpMemoryLongSub}</span>
              <p className="mt-0.5">{t.settings.helpMemoryLongDesc}</p>
            </div>
            <div>
              <span className="font-semibold">{t.settings.helpMemoryShortTitle}</span>
              <span className="text-gray-500 ml-1">{t.settings.helpMemoryShortSub}</span>
              <p className="mt-0.5">{t.settings.helpMemoryShortDesc}</p>
            </div>
          </div>
          <p className="text-gray-500">{t.settings.helpMemoryNote}</p>
        </div>
      </Section>

      <Section id="datasources" title={t.settings.helpDsTitle}>
        <div className="space-y-3">
          <p>{t.settings.helpDsIntro}</p>
          <div className="space-y-2">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">{t.settings.helpDsDbTypesTitle}</div>
              <div className="grid grid-cols-2 gap-1">
                {['MySQL / MariaDB', 'PostgreSQL', 'Presto / Trino', 'ClickHouse', 'SQL Server', 'Oracle', 'SQLite', 'Hive'].map((db) => (
                  <span key={db} className="text-xs bg-white dark:bg-gray-700 rounded px-2 py-1">• {db}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">{t.settings.helpDsStepsTitle}</div>
              <ol className="space-y-1 list-decimal list-inside">
                <li>{t.settings.helpDsStep1}</li>
                <li>{t.settings.helpDsStep2}</li>
                <li>{t.settings.helpDsStep3}</li>
                <li>{t.settings.helpDsStep4}</li>
                <li>{t.settings.helpDsStep5}</li>
              </ol>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
              <div className="font-semibold text-amber-700 dark:text-amber-300 mb-1">{t.settings.helpDsSecurityTitle}</div>
              <p>{t.settings.helpDsSecurityDesc}</p>
            </div>
          </div>
        </div>
      </Section>

      <Section id="file-parsing" title={t.settings.helpFileTitle}>
        <div className="space-y-3">
          <p>{t.settings.helpFileIntro}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { type: t.settings.helpFileType1Name, formats: t.settings.helpFileType1Formats, desc: t.settings.helpFileType1Desc },
              { type: t.settings.helpFileType2Name, formats: t.settings.helpFileType2Formats, desc: t.settings.helpFileType2Desc },
              { type: t.settings.helpFileType3Name, formats: t.settings.helpFileType3Formats, desc: t.settings.helpFileType3Desc },
              { type: t.settings.helpFileType4Name, formats: t.settings.helpFileType4Formats, desc: t.settings.helpFileType4Desc },
              { type: t.settings.helpFileType5Name, formats: t.settings.helpFileType5Formats, desc: t.settings.helpFileType5Desc },
              { type: t.settings.helpFileType6Name, formats: t.settings.helpFileType6Formats, desc: t.settings.helpFileType6Desc },
            ].map(({ type, formats, desc }) => (
              <div key={type} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5">
                <div className="font-medium text-gray-700 dark:text-gray-200">{type}</div>
                <div className="text-[10px] font-mono text-blue-500 mt-0.5">{formats}</div>
                <div className="text-gray-500 mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="font-semibold mb-1">{t.settings.helpFileSizeTitle}</div>
            <p>{t.settings.helpFileSizeDesc}</p>
          </div>
        </div>
      </Section>

      <Section id="faq" title={t.settings.helpFaqTitle}>
        <div className="space-y-4">
          {[
            { q: t.settings.helpFaqQ1, a: t.settings.helpFaqA1 },
            { q: t.settings.helpFaqQ2, a: t.settings.helpFaqA2 },
            { q: t.settings.helpFaqQ3, a: t.settings.helpFaqA3 },
            { q: t.settings.helpFaqQ4, a: t.settings.helpFaqA4 },
            { q: t.settings.helpFaqQ5, a: t.settings.helpFaqA5 },
          ].map(({ q, a }) => (
            <div key={q}>
              <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">Q: {q}</div>
              <div className="text-gray-500">A: {a}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="text-xs text-center text-gray-400 pt-2 select-none space-y-1">
        {/* Secret 10-click to unlock DevTools — no hover/cursor effect shown */}
        <div>
          <span onClick={handleVersionClick} className="cursor-default">
            Datell v1.0
          </span>
          {devUnlocked && (
            <span className="ml-2 text-green-500 font-medium">{t.settings.helpDevUnlocked}</span>
          )}
          {!devUnlocked && devClickCount >= 5 && (
            <span className="ml-1 text-gray-300">· {10 - devClickCount}...</span>
          )}
        </div>
        <div>
          {t.settings.helpOpenSource}{' '}
          <a
            href="https://github.com/aiis2/datell"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          >
            github.com/aiis2/datell
          </a>
        </div>
      </div>
    </div>
  );
};

/* ---- Schema Graph Tab ---- */
const SchemaGraphTab: React.FC<{ forDsId?: string }> = ({ forDsId }) => {
  const { t } = useI18n();
  const { datasources, getDatasourceSchema, getTableData } = useDatasourceStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTableComment, setShowTableComment] = useState(true);
  const [showColumnComment, setShowColumnComment] = useState(true);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  // Fullscreen ER diagram state
  const [showFullscreen, setShowFullscreen] = useState(false);
  const fullscreenSvgRef = useRef<HTMLDivElement>(null);
  const [fsScale, setFsScale] = useState(1);
  const [fsPanX, setFsPanX] = useState(0);
  const [fsPanY, setFsPanY] = useState(0);
  const [fsIsPanning, setFsIsPanning] = useState(false);
  const [fsPanStart, setFsPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });

  // Auto-load when embedded in DatasourcesTab (forDsId provided)
  useEffect(() => {
    if (forDsId) { loadSchema(forDsId); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forDsId]);

  const loadSchema = async (id: string, search?: string) => {
    setSelectedId(id);
    setSchema(null);
    setErr(null);
    setSelectedTable(null);
    setTableData(null);
    setScale(1); setPanX(0); setPanY(0);
    setLoading(true);
    try {
      const s = await getDatasourceSchema(id, { limit: 10, search: search || undefined });
      setSchema(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (selectedId) loadSchema(selectedId, q);
  };

  const handleClickTable = async (tableName: string) => {
    if (!selectedId) return;
    setSelectedTable(tableName);
    setTableData(null);
    setTableDataLoading(true);
    try {
      const data = await getTableData(selectedId, tableName);
      setTableData({ columns: data.columns, rows: data.rows });
    } catch { /* ignore */ }
    finally { setTableDataLoading(false); }
  };

  // Wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(4, Math.max(0.2, s * delta)));
  }, []);

  useEffect(() => {
    const el = svgContainerRef.current;
    if (el) { el.addEventListener('wheel', handleWheel, { passive: false }); }
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [handleWheel]);

  // Fullscreen wheel zoom
  const handleFsWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setFsScale((s) => Math.min(4, Math.max(0.2, s * delta)));
  }, []);

  useEffect(() => {
    if (!showFullscreen) return;
    const el = fullscreenSvgRef.current;
    if (el) { el.addEventListener('wheel', handleFsWheel, { passive: false }); }
    return () => { if (el) el.removeEventListener('wheel', handleFsWheel); };
  }, [handleFsWheel, showFullscreen]);

  // Close fullscreen on Escape key
  useEffect(() => {
    if (!showFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFullscreen]);

  const ds = datasources.find((d) => d.id === selectedId);
  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

  const renderERDiagram = (sch: SchemaInfo, ps: {
    ref: React.RefObject<HTMLDivElement | null>;
    scale: number; panX: number; panY: number;
    isPanning: boolean;
    panStart: { x: number; y: number; panX: number; panY: number };
    setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
    setPanX: React.Dispatch<React.SetStateAction<number>>;
    setPanY: React.Dispatch<React.SetStateAction<number>>;
    setPanStart: React.Dispatch<React.SetStateAction<{ x: number; y: number; panX: number; panY: number }>>;
    minHeight?: number;
  }) => {
    const tables = sch.tables;
    const colCount = Math.max(1, Math.min(3, tables.length));
    const cardW = 200;
    const gapX = 40;
    const gapY = 36;
    const headerH = showTableComment ? 38 : 26;
    const colRowH = showColumnComment ? 22 : 18;
    const rowH = (t: typeof tables[0]) => headerH + t.columns.length * colRowH + 8;
    const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
    let cx = 16; let cy = 16; let maxH = 0;
    tables.forEach((t, i) => {
      const h = rowH(t);
      positions.push({ x: cx, y: cy, w: cardW, h });
      maxH = Math.max(maxH, h);
      if ((i + 1) % colCount === 0) { cx = 16; cy += maxH + gapY; maxH = 0; }
      else { cx += cardW + gapX; }
    });
    const svgH = cy + maxH + 48;
    const svgW = colCount * (cardW + gapX) + 16;

    return (
      <div
        ref={ps.ref}
        style={{ cursor: ps.isPanning ? 'grabbing' : 'grab', userSelect: 'none', overflow: 'hidden', height: '100%', minHeight: ps.minHeight ?? 280, position: 'relative' }}
        onMouseDown={(e) => { ps.setIsPanning(true); ps.setPanStart({ x: e.clientX, y: e.clientY, panX: ps.panX, panY: ps.panY }); }}
        onMouseMove={(e) => { if (ps.isPanning) { ps.setPanX(ps.panStart.panX + e.clientX - ps.panStart.x); ps.setPanY(ps.panStart.panY + e.clientY - ps.panStart.y); } }}
        onMouseUp={() => ps.setIsPanning(false)}
        onMouseLeave={() => ps.setIsPanning(false)}
      >
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ transform: `translate(${ps.panX}px,${ps.panY}px) scale(${ps.scale})`, transformOrigin: '0 0', transition: ps.isPanning ? 'none' : 'transform 0.1s', width: '100%' }}
        >
          {tables.map((t, i) => {
            const p = positions[i];
            const color = COLORS[i % COLORS.length];
            const isSelected = selectedTable === t.name;
            return (
              <g key={t.name} style={{ cursor: 'pointer' }} onClick={() => handleClickTable(t.name)}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                  fill={isSelected ? '#eff6ff' : '#fff'}
                  stroke={isSelected ? '#3b82f6' : color}
                  strokeWidth={isSelected ? 2.5 : 1.5} />
                {/* Header */}
                <rect x={p.x} y={p.y} width={p.w} height={headerH} rx={8} fill={color} />
                <rect x={p.x} y={p.y + headerH - 8} width={p.w} height={8} fill={color} />
                <text x={p.x + 10} y={p.y + 16} fill="#fff" fontSize={11} fontWeight="bold">{t.name}</text>
                {showTableComment && t.comment && (
                  <text x={p.x + 10} y={p.y + 30} fill="rgba(255,255,255,0.85)" fontSize={9}>{t.comment.slice(0, 28)}</text>
                )}
                {/* Columns */}
                {t.columns.map((col, ci) => {
                  const cy2 = p.y + headerH + ci * colRowH + 4;
                  return (
                    <g key={col.name}>
                      {ci > 0 && <line x1={p.x + 6} y1={cy2} x2={p.x + p.w - 6} y2={cy2} stroke="#f3f4f6" strokeWidth="0.8" />}
                      <text x={p.x + 10} y={cy2 + 12} fill="#374151" fontSize={9}>{col.name}{col.nullable ? '' : ' *'}</text>
                      <text x={p.x + p.w - 8} y={cy2 + 12} fill="#9ca3af" fontSize={8} textAnchor="end">{col.type.split('(')[0]}</text>
                      {showColumnComment && col.comment && (
                        <text x={p.x + 10} y={cy2 + 21} fill="#a0aec0" fontSize={7.5}>{col.comment.slice(0, 26)}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }} className="space-y-0 gap-0">
      {/* Top controls */}
      <div className="flex items-center flex-wrap gap-2 mb-2">
        {/* Title + datasource selector — only shown in standalone mode */}
        {!forDsId && (
          <>
            <div className="flex items-center gap-1.5">
              <Network size={14} className="text-blue-500" />
              <span className="text-sm font-semibold">{t.settings.dsSchemaTab}</span>
            </div>
            {datasources.length === 0 ? (
              <span className="text-xs text-gray-400">{t.settings.dsSchemaNoDs}</span>
            ) : (
              <div className="flex flex-wrap gap-1.5 flex-1">
                {datasources.map((d) => (
                  <button key={d.id} onClick={() => loadSchema(d.id)} title={`${d.type} · ${d.host}:${d.port}/${d.database}`}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      selectedId === d.id ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}>
                    <Database size={10} />{d.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {selectedId && (
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {/* Search */}
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                title={t.settings.dsSchemaSearchPlaceholder}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={t.settings.dsSchemaSearchPlaceholder}
                className="pl-6 pr-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {/* Comment toggles */}
            <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={showTableComment} onChange={(e) => setShowTableComment(e.target.checked)} className="rounded" />
              {t.settings.dsSchemaTableComment}
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={showColumnComment} onChange={(e) => setShowColumnComment(e.target.checked)} className="rounded" />
              {t.settings.dsSchemaColumnComment}
            </label>
            {/* Reset view */}
            <button onClick={() => { setScale(1); setPanX(0); setPanY(0); }} title={t.settings.dsSchemaResetView}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors" aria-label={t.settings.dsSchemaResetView}>
              <RefreshCw size={13} />
            </button>
            {/* Fullscreen ER diagram */}
            <button onClick={() => { setFsScale(1); setFsPanX(0); setFsPanY(0); setShowFullscreen(true); }} title={t.settings.dsSchemaFullscreen}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors" aria-label={t.settings.dsSchemaFullscreen}>
              <Maximize2 size={13} />
            </button>
          </div>
        )}
      </div>

      {schema && (
        <div className="text-xs text-gray-400 mb-1">
          {ds?.name} · {t.settings.dsSchemaInfoShown.replace('{shown}', String(schema.tables.length))}{schema.total && schema.total > schema.tables.length ? t.settings.dsSchemaInfoTotal.replace('{total}', String(schema.total)) : ''}
          <span className="ml-2 text-gray-300">· {t.settings.dsSchemaHint}</span>
        </div>
      )}

      {loading && <div className="flex items-center gap-2 text-xs text-gray-500 py-2"><Loader2 size={13} className="animate-spin" />{t.settings.dsSchemaLoading}</div>}
      {err && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{err}</div>}

      {/* ER canvas — flex-1 auto height */}
      {schema && (
        <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
          <div
            className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800"
            style={{ flex: 1, minHeight: 240, overflow: 'hidden' }}
          >
            {renderERDiagram(schema, {
              ref: svgContainerRef,
              scale, panX, panY, isPanning, panStart,
              setIsPanning, setPanX, setPanY, setPanStart,
            })}
          </div>

          {/* Table detail panel */}
          {selectedTable && (
            <div className="mt-2 border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50 dark:bg-blue-900/10">
              <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100 dark:border-blue-800">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {selectedTable}
                  {schema.tables.find(t => t.name === selectedTable)?.comment &&
                    <span className="ml-2 font-normal text-blue-400">— {schema.tables.find(t => t.name === selectedTable)?.comment}</span>
                  }
                </span>
                <button onClick={() => { setSelectedTable(null); setTableData(null); }} title={t.settings.dsSchemaClosePanel} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
              </div>
              {tableDataLoading && <div className="flex items-center gap-2 text-xs text-gray-500 p-3"><Loader2 size={12} className="animate-spin" />{t.settings.dsSchemaTableDataLoading}</div>}
              {tableData && (
                <div className="overflow-auto max-h-48">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-blue-100 dark:bg-blue-900/30">
                        {tableData.columns.map((col) => (
                          <th key={col} className="px-2 py-1.5 text-left font-semibold text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-700 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.slice(0, 100).map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-blue-50/50 dark:bg-blue-900/5'}>
                          {(row as unknown[]).map((cell, ci) => (
                            <td key={ci} className="px-2 py-1 text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700/50 whitespace-nowrap max-w-xs truncate">
                              {cell === null ? <span className="text-gray-300 italic">NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableData.rows.length === 0 && <p className="text-xs text-gray-400 text-center py-3">{t.settings.dsSchemaTableNoData}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedId && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Network size={32} className="mb-3 opacity-30" />
          {forDsId ? (
            <p className="text-sm">{t.settings.dsSchemaConnecting}</p>
          ) : (
            <>
              <p className="text-sm">{t.settings.dsSchemaSelectSource}</p>
              <p className="text-xs mt-1 text-gray-300">{t.settings.dsSchemaSelectSourceHint}</p>
            </>
          )}
        </div>
      )}

      {/* Fullscreen ER Diagram Overlay */}
      {showFullscreen && schema && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column' }}>
          {/* Header bar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-950/95 border-b border-white/10 flex-shrink-0">
            <Network size={14} className="text-blue-400" />
            <span className="text-sm font-semibold text-white">{t.settings.dsSchemaErTitle}</span>
            {ds && <span className="text-xs text-gray-400">{ds.name}</span>}
            <span className="text-xs text-gray-600 hidden sm:inline">· {schema.tables.length} {t.settings.dsSchemaHint}</span>
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none">
                <input type="checkbox" checked={showTableComment} onChange={(e) => setShowTableComment(e.target.checked)} className="rounded" />
                {t.settings.dsSchemaTableComment}
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none">
                <input type="checkbox" checked={showColumnComment} onChange={(e) => setShowColumnComment(e.target.checked)} className="rounded" />
                {t.settings.dsSchemaColumnComment}
              </label>
              <div className="flex items-center gap-1 ml-1">
                <button onClick={() => setFsScale((s) => Math.min(4, s * 1.2))} title={t.settings.dsSchemaZoomIn}
                  className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"><ZoomIn size={13} /></button>
                <span className="text-xs text-white/50 select-none w-10 text-center">{Math.round(fsScale * 100)}%</span>
                <button onClick={() => setFsScale((s) => Math.max(0.2, s * 0.8))} title={t.settings.dsSchemaZoomOut}
                  className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"><ZoomOut size={13} /></button>
                <button onClick={() => { setFsScale(1); setFsPanX(0); setFsPanY(0); }} title={t.settings.dsSchemaResetView}
                  className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"><RefreshCw size={13} /></button>
              </div>
              <button onClick={() => setShowFullscreen(false)} title={t.settings.dsSchemaCloseFullscreen}
                className="ml-1 p-1.5 rounded bg-white/10 hover:bg-red-500/70 text-white transition-colors"><X size={14} /></button>
            </div>
          </div>
          {/* ER Canvas */}
          <div style={{ flex: 1, overflow: 'hidden', background: '#f1f5f9' }}>
            {renderERDiagram(schema, {
              ref: fullscreenSvgRef,
              scale: fsScale, panX: fsPanX, panY: fsPanY,
              isPanning: fsIsPanning, panStart: fsPanStart,
              setIsPanning: setFsIsPanning, setPanX: setFsPanX, setPanY: setFsPanY, setPanStart: setFsPanStart,
              minHeight: 500,
            })}
          </div>
        </div>
      )}
    </div>
  );
};


/* ---- Knowledge Base Tab (RAG) ---- */
const KnowledgeBaseTab: React.FC = () => {
  const { t } = useI18n();
  const { collections, documents, chunks, chunksDocumentId, activeCollectionId, loading, setActiveCollection, loadCollections, createCollection, deleteCollection, addDocument, removeDocument, loadChunks, searchFts, updateChunk } = useRagStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'local' | 'dify' | 'ragflow'>('local');
  const [newEmbModel, setNewEmbModel] = useState('');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newDatasetId, setNewDatasetId] = useState('');
  const [creating, setCreating] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ftsQuery, setFtsQuery] = useState('');
  const [ftsResults, setFtsResults] = useState<any[]>([]);
  const [ftsLoading, setFtsLoading] = useState(false);
  const [rightPanel, setRightPanel] = useState<'chunks' | 'search'>('chunks');
  const [chunkPage, setChunkPage] = useState(0);
  const CHUNKS_PER_PAGE = 20;

  // ── Import dialog state ─────────────────────────────────────────────────
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [chunkMode, setChunkMode] = useState<'auto' | 'custom'>('auto');
  const [chunkDelimiter, setChunkDelimiter] = useState('\\n\\n');
  const [chunkMaxLength, setChunkMaxLength] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [chunkRemoveWhitespace, setChunkRemoveWhitespace] = useState(false);
  const [chunkRemoveUrls, setChunkRemoveUrls] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);

  // ── Chunk detail popup state ─────────────────────────────────────────────
  const [selectedChunk, setSelectedChunk] = useState<any | null>(null);
  const [chunkEditMode, setChunkEditMode] = useState(false);
  const [chunkEditContent, setChunkEditContent] = useState('');
  const [chunkSaving, setChunkSaving] = useState(false);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const hasSelected = activeCollectionId != null;
  const activeCol = collections.find((c) => c.id === activeCollectionId) ?? null;

  const resetForm = () => {
    setNewName(''); setNewDesc(''); setNewType('local'); setNewEmbModel('');
    setNewApiUrl(''); setNewApiKey(''); setNewDatasetId(''); setFormError(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setFormError(t.settings.ragErrFillName); return; }
    if ((newType === 'dify' || newType === 'ragflow') && !newApiUrl.trim()) { setFormError(t.settings.ragErrFillApi); return; }
    setCreating(true); setFormError(null);
    try {
      const col = await createCollection({ name: newName.trim(), description: newDesc.trim(), type: newType, embedding_model: newEmbModel.trim(), api_url: newApiUrl.trim(), api_key: newApiKey.trim(), dataset_id: newDatasetId.trim() });
      setShowNewForm(false); resetForm(); setActiveCollection(col.id);
    } catch (e) { setFormError(String(e)); }
    finally { setCreating(false); }
  };

  const handleAddFile = async () => {
    if (!activeCollectionId) return;
    const fp = await (window as any).electronAPI?.fsSelectFile?.(['.txt', '.md', '.csv', '.json', '.pdf']);
    if (!fp) return;
    setImportFilePath(fp);
    setPreviewChunks([]);
    setChunkMode('auto');
    setChunkDelimiter('\\n\\n');
    setChunkMaxLength(500);
    setChunkOverlap(50);
    setChunkRemoveWhitespace(false);
    setChunkRemoveUrls(false);
    setShowImportDialog(true);
  };

  const getChunkOpts = (): ChunkOptions => ({
    mode: chunkMode,
    delimiter: chunkMode === 'custom' ? chunkDelimiter.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : '\n\n',
    maxLength: chunkMaxLength,
    overlap: chunkOverlap,
    removeExtraWhitespace: chunkRemoveWhitespace,
    removeUrlsEmails: chunkRemoveUrls,
  });

  const handlePreviewChunks = async () => {
    if (!importFilePath) return;
    setPreviewing(true);
    try {
      const chunks = await (window as any).electronAPI?.ragChunksPreview?.(importFilePath, getChunkOpts());
      setPreviewChunks(chunks || []);
    } catch { setPreviewChunks([]); }
    finally { setPreviewing(false); }
  };

  const handleConfirmImport = async () => {
    if (!activeCollectionId || !importFilePath) return;
    setAddingFile(true); setFileError(null);
    try {
      const embCfg = activeCol?.embedding_model && activeCol?.api_url
        ? { baseUrl: activeCol.api_url, apiKey: activeCol.api_key, model: activeCol.embedding_model } : undefined;
      await addDocument(activeCollectionId, importFilePath, embCfg, getChunkOpts());
      setShowImportDialog(false); setImportFilePath(null); setPreviewChunks([]);
    } catch (e) { setFileError(String(e)); }
    finally { setAddingFile(false); }
  };

  const handleViewChunks = async (docId: string) => {
    if (!activeCollectionId) return;
    setRightPanel('chunks'); setChunkPage(0);
    await loadChunks(activeCollectionId, docId);
  };

  const handleChunkClick = (chunk: any) => {
    setSelectedChunk(chunk);
    setChunkEditMode(false);
    setChunkEditContent(chunk.content);
  };

  const handleSaveChunk = async () => {
    if (!selectedChunk || !chunkEditContent.trim()) return;
    setChunkSaving(true);
    try {
      await updateChunk(selectedChunk.id, chunkEditContent.trim());
      setSelectedChunk((prev: any) => prev ? { ...prev, content: chunkEditContent.trim() } : null);
      setChunkEditMode(false);
    } catch { /* ignore */ }
    finally { setChunkSaving(false); }
  };

  const handleFtsSearch = async () => {
    if (!ftsQuery.trim() || !activeCollectionId) return;
    setFtsLoading(true); setRightPanel('search');
    try {
      const results = await searchFts(activeCollectionId, ftsQuery, 20);
      setFtsResults(results);
    } catch { setFtsResults([]); }
    finally { setFtsLoading(false); }
  };

  const TYPE_LABELS: Record<string, string> = { local: t.settings.ragTypeLocalLabel, dify: 'Dify', ragflow: 'RAGflow' };
  const TYPE_COLORS: Record<string, string> = {
    local: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    dify: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    ragflow: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  };

  const pagedChunks = chunks.slice(chunkPage * CHUNKS_PER_PAGE, (chunkPage + 1) * CHUNKS_PER_PAGE);
  const totalPages = Math.ceil(chunks.length / CHUNKS_PER_PAGE);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* ── Import chunk settings dialog ── */}
      {showImportDialog && importFilePath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t.settings.ragImportTitle}</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-sm">{importFilePath.split(/[\\/]/).pop()}</p>
              </div>
              <button onClick={() => { setShowImportDialog(false); setPreviewChunks([]); }} title={t.settings.ragImportCancelTitle} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Mode selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t.settings.ragImportModeLabel}</label>
                <div className="flex gap-2">
                  {(['auto', 'custom'] as const).map((m) => (
                    <button key={m} onClick={() => setChunkMode(m)} title={m === 'auto' ? t.settings.ragImportModeAuto : t.settings.ragImportModeCustom}
                      className={`flex-1 py-2 text-xs rounded-lg border-2 transition-all ${chunkMode === m ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300'}`}>
                      {m === 'auto' ? t.settings.ragImportModeAuto : t.settings.ragImportModeCustom}
                    </button>
                  ))}
                </div>
                {chunkMode === 'auto' && (
                  <p className="text-xs text-gray-400 mt-2">{t.settings.ragImportAutoHint}</p>
                )}
              </div>

              {/* Custom options */}
              {chunkMode === 'custom' && (
                <div className="space-y-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t.settings.ragImportDelimLabel}</label>
                    <input title={t.settings.ragImportDelimLabel} value={chunkDelimiter} onChange={(e) => setChunkDelimiter(e.target.value)} placeholder="\\n\\n"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.ragImportMaxLenLabel} <span className="text-indigo-500 font-medium">{chunkMaxLength}</span></label>
                      <input title={t.settings.ragImportMaxLenLabel} type="range" min={100} max={2000} step={50} value={chunkMaxLength}
                        onChange={(e) => setChunkMaxLength(Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t.settings.ragImportOverlapLabel} <span className="text-indigo-500 font-medium">{chunkOverlap}</span></label>
                      <input title={t.settings.ragImportOverlapLabel} type="range" min={0} max={200} step={10} value={chunkOverlap}
                        onChange={(e) => setChunkOverlap(Number(e.target.value))} className="w-full accent-indigo-500" />
                    </div>
                  </div>
                </div>
              )}

              {/* Preprocessing */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{t.settings.ragImportPreprocessLabel}</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={chunkRemoveWhitespace} onChange={(e) => setChunkRemoveWhitespace(e.target.checked)} className="accent-indigo-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{t.settings.ragImportRemoveWS}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={chunkRemoveUrls} onChange={(e) => setChunkRemoveUrls(e.target.checked)} className="accent-indigo-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{t.settings.ragImportRemoveUrls}</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.settings.ragImportPreviewLabel}</label>
                  <button onClick={handlePreviewChunks} disabled={previewing} title={t.settings.ragImportPreviewBtn}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg">
                    {previewing ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                    {previewing ? t.settings.ragImportPreviewing : t.settings.ragImportPreviewBtn}
                  </button>
                </div>
                {previewChunks.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-2">
                    {previewChunks.map((c, i) => (
                      <div key={i} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full mr-1.5">#{i + 1}</span>
                        <span className="text-[10px] text-gray-400">{t.settings.ragImportPreviewChars.replace('{count}', String(c.length))}</span>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed line-clamp-3">{c}</p>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-400 text-center">{t.settings.ragImportPreviewTotal.replace('{count}', String(previewChunks.length))}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              {fileError && <p className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11}/>{fileError}</p>}
              {!fileError && <span className="text-xs text-gray-400">{t.settings.ragImportConfirmHint}</span>}
              <div className="flex gap-2">
                <button onClick={() => { setShowImportDialog(false); setPreviewChunks([]); }} title={t.settings.ragImportCancelTitle}
                  className="px-4 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">{t.settings.ragImportCancelBtn}</button>
                <button onClick={handleConfirmImport} disabled={addingFile} title={t.settings.ragImportConfirmBtn}
                  className="flex items-center gap-1 px-4 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg">
                  {addingFile ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  {addingFile ? t.settings.ragImportImporting : t.settings.ragImportConfirmBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Chunk detail popup ── */}
      {selectedChunk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">#{selectedChunk.chunk_index + 1}</span>
                <span className="text-xs text-gray-400">{t.settings.ragChunkChars.replace('{count}', String(selectedChunk.content.length))}</span>
                <span className="text-xs text-gray-300">{new Date(selectedChunk.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
              <div className="flex items-center gap-2">
                {!chunkEditMode && (
                  <button onClick={() => setChunkEditMode(true)} title={t.settings.ragChunkEditTitle}
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Edit2 size={11} /> {t.settings.ragChunkEditBtn}
                  </button>
                )}
                <button onClick={() => { setSelectedChunk(null); setChunkEditMode(false); }} title={t.settings.ragChunkCloseTitle} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {chunkEditMode ? (
                <textarea
                  title={t.settings.ragChunkEditTitle}
                  value={chunkEditContent}
                  onChange={(e) => setChunkEditContent(e.target.value)}
                  className="w-full h-full min-h-[300px] text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 leading-relaxed"
                />
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{selectedChunk.content}</p>
              )}
            </div>
            {chunkEditMode && (
              <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button onClick={() => { setChunkEditMode(false); setChunkEditContent(selectedChunk.content); }} title={t.settings.ragChunkCancelEditTitle}
                  className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">{t.settings.ragChunkCancelBtn}</button>
                <button onClick={handleSaveChunk} disabled={chunkSaving} title={t.settings.ragChunkSaveTitle}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg">
                  {chunkSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} {t.settings.ragChunkSaveBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Library size={14} className="text-indigo-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.settings.ragTitle}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{t.settings.ragDesc}</p>
        </div>
        <button onClick={() => { setShowNewForm(!showNewForm); resetForm(); }} title={t.settings.ragNewBtn}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors flex-shrink-0">
          <Plus size={12} /> {t.settings.ragNewBtn}
        </button>
      </div>

      {/* Create form */}
      {showNewForm && (
        <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50 dark:bg-indigo-900/10 p-3 space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{t.settings.ragNewFormTitle}</span>
            <button onClick={() => { setShowNewForm(false); resetForm(); }} title={t.settings.ragCancelTitle} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragNameLabel}</label>
              <input title={t.settings.ragNameLabel} value={newName} onChange={e=>setNewName(e.target.value)} placeholder={t.settings.ragNamePlaceholder} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
            <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragDescLabel}</label>
              <input title={t.settings.ragDescLabel} value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder={t.settings.ragDescPlaceholder} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
            <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragTypeLabel}</label>
              <select title={t.settings.ragTypeLabel} value={newType} onChange={e=>setNewType(e.target.value as any)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                <option value="local">{t.settings.ragTypeLocal}</option><option value="dify">{t.settings.ragTypeDify}</option><option value="ragflow">{t.settings.ragTypeRagflow}</option>
              </select></div>
            {newType === 'local' && (
              <div className="col-span-3"><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragEmbLabel}</label>
                <input title={t.settings.ragEmbLabel} value={newEmbModel} onChange={e=>setNewEmbModel(e.target.value)} placeholder={t.settings.ragEmbPlaceholder} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
            )}
            {newType !== 'local' && (<>
              <div className="col-span-3"><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragApiLabel}</label>
                <input title={t.settings.ragApiLabel} value={newApiUrl} onChange={e=>setNewApiUrl(e.target.value)} placeholder="https://api.dify.ai" className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.ragApiKey}</label>
                <input title={t.settings.ragApiKey} type="password" value={newApiKey} onChange={e=>setNewApiKey(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">{newType==='dify'?'Dataset ID':'KB ID'}</label>
                <input title="ID" value={newDatasetId} onChange={e=>setNewDatasetId(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
            </>)}
          </div>
          {formError && <p className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11}/>{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating} title={t.settings.ragCreateBtn} className="flex items-center gap-1 px-3 py-1 text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg">
              {creating?<Loader2 size={11} className="animate-spin"/>:<Check size={11}/>} {t.settings.ragCreateBtn}
            </button>
            <button onClick={()=>{setShowNewForm(false);resetForm();}} title={t.settings.ragCancelBtn} className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">{t.settings.ragCancelBtn}</button>
          </div>
        </div>
      )}

      {/* Three-column body */}
      <div className="grid grid-cols-[180px_1fr_1fr] gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Col 1: Collection list */}
        <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">{t.settings.ragListTitle.replace('{count}', String(collections.length))}</span>
          {loading && collections.length === 0 && <div className="text-xs text-gray-400 py-2">{t.settings.ragLoading}</div>}
          {!loading && collections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <Library size={20} className="mb-2 opacity-30"/>{t.settings.ragEmpty}
            </div>
          )}
          {collections.map((col) => (
            <div key={col.id} onClick={()=>setActiveCollection(col.id)}
              className={`px-2.5 py-2 rounded-xl border cursor-pointer transition-all ${activeCollectionId===col.id?'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm':'border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-700/20'}`}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate text-gray-700 dark:text-gray-200">{col.name}</div>
                  {col.description && <div className="text-[10px] text-gray-400 truncate mt-0.5">{col.description}</div>}
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[col.type]||''}`}>{TYPE_LABELS[col.type]||col.type}</span>
                  </div>
                </div>
                <button onClick={(e)=>{e.stopPropagation();deleteCollection(col.id);}} title={t.settings.ragDeleteTitle} className="text-gray-200 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"><Trash2 size={11}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* Col 2: Documents */}
        <div className="flex flex-col gap-2 overflow-hidden">
          {!hasSelected ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <BookOpen size={24} className="mb-2 opacity-30"/>{t.settings.ragSelectHint}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t.settings.ragDocsTitle.replace('{count}', String(documents.length))}</span>
                <button onClick={handleAddFile} disabled={addingFile} title={t.settings.ragAddDocBtn}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                  {addingFile?<Loader2 size={10} className="animate-spin"/>:<Upload size={10}/>}
                  {addingFile?t.settings.ragProcessing:t.settings.ragAddDocBtn}
                </button>
              </div>
              {fileError && <p className="text-[10px] text-red-500 flex items-center gap-1 flex-shrink-0"><XCircle size={10}/>{fileError}</p>}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {!loading && documents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <Upload size={20} className="mb-2 opacity-30"/>{t.settings.ragDocsEmpty}
                  </div>
                )}
                {documents.map((doc) => (
                  <div key={doc.id}
                    onClick={()=>handleViewChunks(doc.id)}
                    className={`bg-white dark:bg-gray-700/30 border rounded-xl px-2.5 py-2 cursor-pointer transition-all hover:border-indigo-300 ${chunksDocumentId===doc.id?'border-indigo-400':'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate text-gray-700 dark:text-gray-200">{doc.filename}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{(doc.size/1024).toFixed(1)} KB</span>
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-1.5 rounded-full">{doc.chunk_count} {t.settings.ragChunksView}</span>
                          <span className="text-[10px] text-gray-300">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </div>
                      <button onClick={(e)=>{e.stopPropagation();removeDocument(doc.id);}} title={t.settings.ragDeleteDocTitle} className="text-gray-200 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"><Trash2 size={11}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Col 3: Chunks viewer / FTS search */}
        <div className="flex flex-col gap-2 overflow-hidden">
          {/* FTS search bar */}
          {hasSelected && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="relative flex-1">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input title={t.settings.ragSearchTitle} value={ftsQuery} onChange={e=>setFtsQuery(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleFtsSearch()}
                  placeholder={t.settings.ragSearchPlaceholder} className="w-full pl-6 pr-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
              </div>
              <button onClick={handleFtsSearch} disabled={ftsLoading||!ftsQuery.trim()} title={t.settings.ragSearchTitle}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 disabled:opacity-50 text-white rounded-lg">
                {ftsLoading?<Loader2 size={11} className="animate-spin"/>:<Search size={11}/>}
              </button>
              <div className="flex border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden text-[10px]">
                <button onClick={()=>setRightPanel('chunks')} title={t.settings.ragChunksView}
                  className={`px-2 py-1 ${rightPanel==='chunks'?'bg-indigo-500 text-white':'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{t.settings.ragChunksView}</button>
                <button onClick={()=>setRightPanel('search')} title={t.settings.ragSearchView}
                  className={`px-2 py-1 ${rightPanel==='search'?'bg-indigo-500 text-white':'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{t.settings.ragSearchView}</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-0.5">
            {!hasSelected && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <Search size={24} className="mb-2 opacity-30"/>{t.settings.ragSelectDocHint}
              </div>
            )}

            {/* Chunks panel */}
            {hasSelected && rightPanel === 'chunks' && (
              <div className="space-y-2">
                {chunks.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <BookOpen size={20} className="mb-2 opacity-30"/>{t.settings.ragChunksEmptyHint}
                  </div>
                )}
                {pagedChunks.map((chunk) => (
                  <div key={chunk.id}
                    onClick={() => handleChunkClick(chunk)}
                    className="bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full">#{chunk.chunk_index + 1}</span>
                      <span className="text-[10px] text-gray-300">{chunk.content.length} {t.settings.ragChunksView}</span>
                      <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">{t.settings.ragChunkClickHint}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-4">{chunk.content}</p>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={()=>setChunkPage(p=>Math.max(0,p-1))} disabled={chunkPage===0} title={t.settings.ragPrevPage}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700">{t.settings.ragPrevPage}</button>
                    <span className="text-xs text-gray-400">{t.settings.ragPageInfo.replace('{page}', String(chunkPage+1)).replace('{total}', String(totalPages)).replace('{count}', String(chunks.length))}</span>
                    <button onClick={()=>setChunkPage(p=>Math.min(totalPages-1,p+1))} disabled={chunkPage>=totalPages-1} title={t.settings.ragNextPage}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700">{t.settings.ragNextPage}</button>
                  </div>
                )}
              </div>
            )}

            {/* FTS search results */}
            {hasSelected && rightPanel === 'search' && (
              <div className="space-y-2">
                {ftsResults.length === 0 && !ftsLoading && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <Search size={20} className="mb-2 opacity-30"/>{t.settings.ragSearchEmptyHint}
                  </div>
                )}
                {ftsResults.map((r, i) => (
                  <div key={r.id||i} className="bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-400 truncate flex-1">{r.filename}</span>
                      {r.score != null && <span className="text-[10px] text-green-500 flex-shrink-0">{t.settings.ragScoreLabel}{typeof r.score==='number'?r.score.toFixed(3):r.score}</span>}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-5">
                      {ftsQuery ? r.content.replace(new RegExp(`(${ftsQuery.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '【$1】') : r.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


/* ---- Knowledge Graph Tab ---- */
const KnowledgeGraphTab: React.FC = () => {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [showEdgeForm, setShowEdgeForm] = useState(false);
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeType, setNodeType] = useState('custom');
  const [nodeProps, setNodeProps] = useState('{}');
  const [edgeSrc, setEdgeSrc] = useState('');
  const [edgeLabel, setEdgeLabel] = useState('');
  const [edgeTgt, setEdgeTgt] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(['all']));
  const [bottomTab, setBottomTab] = useState<'nodes' | 'triples'>('nodes');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const apiFn = () => (window as any).electronAPI;

  const load = async () => {
    setLoading(true);
    try {
      const [n, e] = await Promise.all([apiFn().kgraphNodesList(), apiFn().kgraphEdgesList()]);
      setNodes(n || []);
      setEdges(e || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const NODE_TYPE_LIST = ['custom', 'schema', 'rag', 'agent'];
  const TYPE_COLORS: Record<string, string> = {
    custom: '#6b7280', schema: '#3b82f6', rag: '#8b5cf6', agent: '#10b981',
  };
  const getColor = (k: string) => TYPE_COLORS[k] || '#6b7280';

  useEffect(() => {
    const echarts = (window as any).echarts;
    if (!echarts || !chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }
    const chart = chartInstance.current;

    const filteredNodes = visibleTypes.has('all') || visibleTypes.size === 0
      ? nodes
      : nodes.filter((n: any) => visibleTypes.has(n.type));
    const filteredIds = new Set(filteredNodes.map((n: any) => n.id));
    const filteredEdges = edges.filter((e: any) => filteredIds.has(e.source_id) && filteredIds.has(e.target_id));

    const categories = NODE_TYPE_LIST.map((tp) => ({ name: tp, itemStyle: { color: getColor(tp) } }));

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: any) => {
          if (p.dataType === 'node') return `<b>${p.data.name}</b><br/>${p.data.type}`;
          if (p.dataType === 'edge') return p.data.label || '';
          return '';
        },
      },
      legend: [{
        data: categories.map((c) => c.name),
        orient: 'vertical' as const,
        right: 8,
        top: 'middle',
        textStyle: { fontSize: 11, color: '#9ca3af' },
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
      }],
      series: [{
        type: 'graph',
        layout: 'force',
        animation: true,
        data: filteredNodes.map((n: any) => ({
          id: n.id,
          name: n.label,
          type: n.type,
          category: NODE_TYPE_LIST.indexOf(n.type),
          symbolSize: 32,
          label: { show: true, fontSize: 10 },
          itemStyle: { color: getColor(n.type) },
        })),
        links: filteredEdges.map((e: any) => ({
          source: e.source_id,
          target: e.target_id,
          label: { show: true, formatter: e.label, fontSize: 9, color: '#9ca3af' },
          lineStyle: { color: '#d1d5db', curveness: 0.1 },
        })),
        categories,
        roam: true,
        draggable: true,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
        force: {
          repulsion: 350,
          gravity: 0.08,
          edgeLength: [60, 180],
          layoutAnimation: true,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 2 },
        },
      }],
    }, true);

    requestAnimationFrame(() => chart.resize());

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); };
  }, [nodes, edges, visibleTypes]);

  useEffect(() => () => { chartInstance.current?.dispose(); chartInstance.current = null; }, []);

  const toggleType = (tp: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (tp === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(tp)) { next.delete(tp); if (next.size === 0) next.add('all'); }
      else next.add(tp);
      return next;
    });
  };

  const handleCreateNode = async () => {
    if (!nodeLabel.trim()) { setFormError(t.settings.kgErrFillName); return; }
    let props: Record<string, unknown> = {};
    try { props = JSON.parse(nodeProps || '{}'); } catch { setFormError(t.settings.kgErrJsonProps); return; }
    setSaving(true); setFormError(null);
    try {
      const n = await apiFn().kgraphNodesCreate({ type: nodeType, label: nodeLabel.trim(), properties: props, created_by: 'user' });
      setNodes((prev) => [n, ...prev]);
      setShowNodeForm(false); setNodeLabel(''); setNodeType('custom'); setNodeProps('{}');
    } catch (e) { setFormError(String(e)); } finally { setSaving(false); }
  };

  const handleCreateEdge = async () => {
    if (!edgeSrc || !edgeTgt) { setFormError(t.settings.kgErrSelectNodes); return; }
    if (!edgeLabel.trim()) { setFormError(t.settings.kgErrFillRelation); return; }
    setSaving(true); setFormError(null);
    try {
      const e = await apiFn().kgraphEdgesCreate({ source_id: edgeSrc, target_id: edgeTgt, label: edgeLabel.trim(), properties: {} });
      setEdges((prev) => [e, ...prev]);
      setShowEdgeForm(false); setEdgeSrc(''); setEdgeLabel(''); setEdgeTgt('');
    } catch (e) { setFormError(String(e)); } finally { setSaving(false); }
  };

  const deleteNode = async (id: string) => {
    await apiFn().kgraphNodesDelete(id);
    setNodes((prev) => prev.filter((n: any) => n.id !== id));
    setEdges((prev) => prev.filter((e: any) => e.source_id !== id && e.target_id !== id));
  };
  const deleteEdge = async (id: string) => {
    await apiFn().kgraphEdgesDelete(id);
    setEdges((prev) => prev.filter((e: any) => e.id !== id));
  };

  const getNodeLabel = (id: string) => nodes.find((n: any) => n.id === id)?.label || id.slice(0, 8) + '…';

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Share2 size={14} className="text-emerald-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.settings.kgTitle}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{t.settings.kgDesc}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => { setShowEdgeForm(!showEdgeForm); setShowNodeForm(false); setFormError(null); }} title={t.settings.kgNewEdgeBtn}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-emerald-400 rounded-lg transition-colors">
            <Link2 size={12} /> {t.settings.kgNewEdgeBtn}
          </button>
          <button onClick={() => { setShowNodeForm(!showNodeForm); setShowEdgeForm(false); setFormError(null); }} title={t.settings.kgNewNodeBtn}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors">
            <Plus size={12} /> {t.settings.kgNewNodeBtn}
          </button>
          <button onClick={load} disabled={loading} title={t.settings.kgRefreshTitle} className="p-1.5 text-gray-400 hover:text-emerald-500 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Inline forms */}
      {(showNodeForm || showEdgeForm) && (
        <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 p-3 flex-shrink-0">
          {showNodeForm && (
            <div className="grid grid-cols-4 gap-2 items-end">
              <div className="col-span-2"><label className="block text-[10px] text-gray-500 mb-1">{t.settings.kgNodeNameLabel}</label>
                <input title={t.settings.kgNodeNameLabel} value={nodeLabel} onChange={e=>setNodeLabel(e.target.value)} placeholder={t.settings.kgNodeNamePlaceholder} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400" /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.kgNodeTypeLabel}</label>
                <select title={t.settings.kgNodeTypeLabel} value={nodeType} onChange={e=>setNodeType(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="custom">{t.settings.kgNodeCustom}</option><option value="schema">Schema</option><option value="rag">RAG</option><option value="agent">Agent</option>
                </select></div>
              <div className="flex gap-1 items-end pb-0.5">
                <button onClick={handleCreateNode} disabled={saving} title={t.settings.kgCreateBtn} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg">
                  {saving?<Loader2 size={10} className="animate-spin"/>:<Check size={10}/>} {t.settings.kgCreateBtn}
                </button>
                <button onClick={()=>{setShowNodeForm(false);setFormError(null);}} title={t.settings.kgCancelBtn} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 rounded-lg hover:bg-gray-50">{t.settings.kgCancelBtn}</button>
              </div>
            </div>
          )}
          {showEdgeForm && (
            <div className="grid grid-cols-4 gap-2 items-end">
              <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.kgSrcNodeLabel}</label>
                <select title={t.settings.kgSrcNodeLabel} value={edgeSrc} onChange={e=>setEdgeSrc(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="">{t.settings.kgSelectHint}</option>{nodes.map((n:any)=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.kgRelationLabel}</label>
                <input title={t.settings.kgRelationLabel} value={edgeLabel} onChange={e=>setEdgeLabel(e.target.value)} placeholder={t.settings.kgRelationPlaceholder} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400" /></div>
              <div><label className="block text-[10px] text-gray-500 mb-1">{t.settings.kgTgtNodeLabel}</label>
                <select title={t.settings.kgTgtNodeLabel} value={edgeTgt} onChange={e=>setEdgeTgt(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="">{t.settings.kgSelectHint}</option>{nodes.map((n:any)=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select></div>
              <div className="flex gap-1 items-end pb-0.5">
                <button onClick={handleCreateEdge} disabled={saving} title={t.settings.kgCreateBtn} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 disabled:opacity-50 text-white rounded-lg">
                  {saving?<Loader2 size={10} className="animate-spin"/>:<Link2 size={10}/>} {t.settings.kgCreateBtn}
                </button>
                <button onClick={()=>{setShowEdgeForm(false);setFormError(null);}} title={t.settings.kgCancelBtn} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 rounded-lg hover:bg-gray-50">{t.settings.kgCancelBtn}</button>
              </div>
            </div>
          )}
          {formError && <p className="text-xs text-red-500 flex items-center gap-1 mt-2"><XCircle size={11}/>{formError}</p>}
        </div>
      )}

      {/* Main: left filter + center chart */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left filter panel */}
        <div className="w-28 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t.settings.kgFilterTitle}</div>
            {(['all', ...NODE_TYPE_LIST] as string[]).map((tp) => (
              <label key={tp} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                <input type="checkbox" checked={visibleTypes.has(tp)} onChange={()=>toggleType(tp)}
                  className="rounded" />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {tp === 'all' ? t.settings.kgFilterAll : tp}
                  <span className="ml-1 text-gray-400">({tp === 'all' ? nodes.length : nodes.filter((n:any)=>n.type===tp).length})</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t.settings.kgStatsTitle}</div>
            <div className="space-y-1 text-xs text-gray-500">
              <div className="flex justify-between"><span>{t.settings.kgStatsNodes}</span><span className="font-medium">{nodes.length}</span></div>
              <div className="flex justify-between"><span>{t.settings.kgStatsRelations}</span><span className="font-medium">{edges.length}</span></div>
            </div>
          </div>
        </div>

        {/* Chart area - always render to allow ECharts init */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div
            className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            style={{ height: 360 }}
          >
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
            {nodes.length === 0 && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                <Share2 size={32} className="mb-3 opacity-20"/>
                <p className="text-sm">{t.settings.kgEmptyTitle}</p>
                <p className="text-xs mt-1 text-gray-300">{t.settings.kgEmptyHint}</p>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80">
                <Loader2 size={24} className="animate-spin text-emerald-500" />
              </div>
            )}
          </div>

          {/* Bottom: nodes / triples table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden flex-shrink-0">
            <div className="flex items-center border-b border-gray-100 dark:border-gray-700">
              {(['nodes', 'triples'] as const).map((tab) => (
                <button key={tab} onClick={()=>setBottomTab(tab)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${bottomTab===tab?'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500':'text-gray-400 hover:text-gray-700'}`}>
                  {tab === 'nodes' ? t.settings.kgNodesTab.replace('{count}', String(nodes.length)) : t.settings.kgTriplesTab.replace('{count}', String(edges.length))}
                </button>
              ))}
            </div>
            <div className="overflow-auto max-h-36">
              {bottomTab === 'nodes' && (
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColLabel}</th>
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColType}</th>
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColId}</th>
                    <th className="px-1 py-1 w-6"></th>
                  </tr></thead>
                  <tbody>
                    {nodes.map((n:any, i) => (
                      <tr key={n.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-700/20'}>
                        <td className="px-3 py-1 font-medium text-gray-700 dark:text-gray-200">{n.label}</td>
                        <td className="px-3 py-1">
                          <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: getColor(n.type)+'22', color: getColor(n.type) }}>{n.type}</span>
                        </td>
                        <td className="px-3 py-1 font-mono text-gray-400">{n.id.slice(0,8)}</td>
                        <td className="px-1 py-1"><button onClick={()=>deleteNode(n.id)} title={t.settings.kgDeleteTitle} className="text-gray-300 hover:text-red-500"><Trash2 size={11}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {bottomTab === 'triples' && (
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColSubject}</th>
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColRelation}</th>
                    <th className="px-3 py-1 text-left font-medium text-gray-400">{t.settings.kgColObject}</th>
                    <th className="px-1 py-1 w-6"></th>
                  </tr></thead>
                  <tbody>
                    {edges.map((e:any, i) => (
                      <tr key={e.id} className={i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-700/20'}>
                        <td className="px-3 py-1 text-emerald-600 dark:text-emerald-400 font-medium">{getNodeLabel(e.source_id)}</td>
                        <td className="px-3 py-1"><span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">{e.label}</span></td>
                        <td className="px-3 py-1 text-emerald-600 dark:text-emerald-400 font-medium">{getNodeLabel(e.target_id)}</td>
                        <td className="px-1 py-1"><button onClick={()=>deleteEdge(e.id)} title={t.settings.kgDeleteTitle} className="text-gray-300 hover:text-red-500"><Trash2 size={11}/></button></td>
                      </tr>
                    ))}
                    {edges.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">{t.settings.kgNoRelations}</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
