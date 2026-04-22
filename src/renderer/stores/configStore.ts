import { create } from 'zustand';
import type { ModelConfig, McpServerConfig, InstalledSkill, DynamicToolDef, UserSystemPrompt, IllustrationAsset, ImageAsset, PalettePreset } from '../types';
import type { ExternalSkill, RegistrySkillManifest } from '../../shared/skills';
import { DEFAULT_MODELS } from '../types';
import { dbAPI, isElectron } from '../services/dbAPI';
import type { CustomLayout } from '../types/layout';
import type { LangCode } from '../i18n';
import { detectSystemLanguage } from '../i18n';

/**
 * Compile-time flag injected by Vite's `define` option.
 * `true`  = enterprise build (built with ENTERPRISE_BUILD=true env var)
 * `false` = community / OSS build — all enterprise model code is tree-shaken out.
 */
declare const __ENTERPRISE_BUILD__: boolean;

const STORAGE_KEY = 'auto-report-config';

/**
 * Bump this number whenever user-added models should be reset.
 * This prevents dev-time model configs (e.g. 阿里云 CodePlan) from
 * persisting into production builds.
 */
const CONFIG_VERSION = 3;

/** Store ID for the built-in Pro enterprise model */
const LOCKED_PRO_ID = '__locked_pro__';
/** Store ID for the built-in Basic enterprise model */
const LOCKED_BASIC_ID = '__locked_basic__';
/** All locked model store IDs */
const LOCKED_IDS = new Set([LOCKED_PRO_ID, LOCKED_BASIC_ID]);

/** Default model API IDs (the actual model names sent to the inference endpoint) */
const LOCKED_PRO_DEFAULT_MODELID = 'Qwen3.5-397B-A17B-FP8';
const LOCKED_BASIC_DEFAULT_MODELID = 'Qwen3.5-397B-A17B';

/**
 * Built-in Pro enterprise model.
 * apiKey sentinel '__LOCKED_PRO_INTERNAL__' — real key injected in main process.
 * This object is NEVER persisted as a regular model.
 */
const LOCKED_PRO_MODEL: ModelConfig = {
  id: LOCKED_PRO_ID,
  name: '企业内置模型I',
  provider: 'openai-compatible',
  modelId: LOCKED_PRO_DEFAULT_MODELID,
  apiKey: '__LOCKED_PRO_INTERNAL__',
  baseUrl: '',
  locked: true,
  lockedTier: 'pro',
};

/**
 * Built-in Basic enterprise model.
 * apiKey sentinel '__LOCKED_BASIC_INTERNAL__' — real key injected in main process.
 * This object is NEVER persisted as a regular model.
 */
const LOCKED_BASIC_MODEL: ModelConfig = {
  id: LOCKED_BASIC_ID,
  name: '企业内置模型II',
  provider: 'openai-compatible',
  modelId: LOCKED_BASIC_DEFAULT_MODELID,
  apiKey: '__LOCKED_BASIC_INTERNAL__',
  baseUrl: '',
  locked: true,
  lockedTier: 'basic',
};

/** Default user system prompt hints for common hallucination correction */
const DEFAULT_USER_PROMPTS: UserSystemPrompt[] = [
  {
    id: 'hint-date-format',
    name: '日期格式统一识别',
    content:
      '【日期格式纠正】用户数据中的日期可能存在多种不规范写法，识别时请统一处理：\n' +
      '- "2026.1.1"、"2026-1-1"、"2026/1/1" 均识别为 2026年1月1日\n' +
      '- "2026.3.16"、"2026-3-16" 均识别为 2026年3月16日\n' +
      '- 区间格式如 "2026.1.1-2026.3.16" 识别为从2026年1月1日到2026年3月16日\n' +
      '- 月份/日期前导零可缺省（如 "03" 和 "3" 均有效）',
    enabled: true,
  },
  {
    id: 'hint-number-unit',
    name: '数字单位推断',
    content:
      '【数字单位推断】当数据中的数字没有明确单位时：\n' +
      '- 根据上下文推断单位（元/万元/亿、件/个、次、人等）\n' +
      '- 优先使用文件标题、列标题中的单位提示\n' +
      '- 若无法确定，在图表标注中说明"单位未知"',
    enabled: false,
  },
  {
    id: 'hint-missing-data',
    name: '空值与异常数据处理',
    content:
      '【空值处理规则】处理数据时：\n' +
      '- 空值/null/"-"/空字符串 统一视为0或缺失，在图表中以虚线或灰色标注\n' +
      '- 数值异常（如负数库存、超过100%的百分比）在报表中用⚠️警告标注\n' +
      '- 不要因为少数空值而跳过整列数据的分析',
    enabled: false,
  },
];

interface ConfigState {
  models: ModelConfig[];
  activeModelId: string;
  mcpServers: McpServerConfig[];
  installedSkills: InstalledSkill[];
  dynamicToolDefs: DynamicToolDef[];
  userSystemPrompts: UserSystemPrompt[];
  theme: 'light' | 'dark';
  /**
   * UI language preference.
   * 'zh-CN' = Simplified Chinese, 'en-US' = English.
   * Defaults to system language on first launch, persisted after user changes.
   */
  language: LangCode;
  /** Set the UI language and persist to storage. */
  setLanguage: (lang: LangCode) => void;
  /** Active palette preset ID. Default: 'palette-classic'. */
  paletteId: string;
  /** User-created custom palette presets (persisted via dbSetConfig). */
  customPalettes: PalettePreset[];
  /** ID of the currently selected report layout. undefined = none (base only). */
  reportLayoutId: string | undefined;
  /** User's last-set report preview panel width in pixels. Default 480. Range [300, 1400]. */
  reportPreviewWidth: number;
  /** ID of the active report preset. undefined = no preset active. */
  activePresetId: string | undefined;
  settingsOpen: boolean;
  /**
   * Preferred chart rendering engine.
   * 'auto'       → Agent decides based on style / context (default)
   * 'echarts'    → Always use generate_chart (ECharts)
   * 'apexcharts' → Always use generate_chart_apex (ApexCharts)
   */
  preferredChartEngine: 'auto' | 'echarts' | 'apexcharts';
  /**
   * How many recent session summaries to keep in short-term memory.
   * Older blocks are pruned after each consolidation. Default: 5.
   */
  memoryShortTermRounds: number;
  /**
   * Set of built-in tool names that are disabled by the user.
   * Built-in tools cannot be deleted, only toggled.
   */
  disabledBuiltInTools: string[];
  /**
   * External skills loaded from the datellData/skills directory at startup.
   * Not persisted to storage — reloaded fresh each launch.
   */
  externalSkills: ExternalSkill[];
  /** Registry-backed skills loaded from datellData/skills/registry/user at startup. */
  registrySkills: RegistrySkillManifest[];
  /**
   * Whether the enterprise model plugin is loaded at runtime.
   * Checked at startup via IPC; defaults to false until confirmed.
   * When false, locked enterprise models are hidden from the model selector.
   */
  enterprisePluginAvailable: boolean;
  /** Update enterprise plugin availability (called at startup after IPC check). */
  setEnterprisePluginAvailable: (available: boolean) => void;
  illustrations: IllustrationAsset[];
  addIllustration: (ill: IllustrationAsset) => void;
  removeIllustration: (id: string) => void;
  updateIllustration: (id: string, patch: Partial<IllustrationAsset>) => void;
  imageAssets: ImageAsset[];
  addImageAsset: (asset: ImageAsset) => void;
  removeImageAsset: (id: string) => void;
  /** Whether the left sidebar is in collapsed (icon-only) mode */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Max ReAct agent steps. -1 = unlimited. Default 30. */
  reactMaxSteps: number;
  setReactMaxSteps: (steps: number) => void;
  /** Max execution time (ms) per tool call. 0 = disabled. Default 120000 (2 min). */
  toolExecutionTimeoutMs: number;
  setToolExecutionTimeoutMs: (ms: number) => void;
  /** Timeout (ms) waiting for a first streaming token. 0 = disabled. Default 30000. */
  streamTimeoutMs: number;
  setStreamTimeoutMs: (ms: number) => void;
  /** Data parsing row limits — configurable per format */
  dataParsingLimits: {
    excelMaxRows: number;   // Default 200
    csvMaxRows: number;     // Default 200
    pdfMaxChars: number;    // Default 50000
    textMaxChars: number;   // Default 10000
    dbQueryMaxRows: number; // Default 500
  };
  setDataParsingLimits: (limits: Partial<ConfigState['dataParsingLimits']>) => void;
  /** User-created custom layouts (persisted via dbSetConfig). */
  customLayouts: CustomLayout[];
  addCustomLayout: (layout: CustomLayout) => void;
  removeCustomLayout: (id: string) => void;
  setActiveModel: (id: string) => void;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  addModel: (model: ModelConfig) => void;
  removeModel: (id: string) => void;
  addMcpServer: (config: McpServerConfig) => void;
  removeMcpServer: (id: string) => void;
  updateMcpServer: (id: string, patch: Partial<McpServerConfig>) => void;
  /** Update the discovered tools cache for an HTTP MCP server */
  updateMcpDiscoveredTools: (serverId: string, tools: McpServerConfig['discoveredTools']) => void;
  addSkill: (skill: InstalledSkill) => void;
  removeSkill: (id: string) => void;
  addDynamicTool: (tool: DynamicToolDef) => void;
  removeDynamicTool: (id: string) => void;
  addUserPrompt: (prompt: UserSystemPrompt) => void;
  updateUserPrompt: (id: string, patch: Partial<UserSystemPrompt>) => void;
  removeUserPrompt: (id: string) => void;
  toggleTheme: () => void;
  /** Set the active palette preset ID */
  setPaletteId: (id: string) => void;
  /** Add a new custom palette (user-created). */
  addCustomPalette: (palette: PalettePreset) => void;
  /** Update an existing custom palette by id. */
  updateCustomPalette: (id: string, patch: Partial<PalettePreset>) => void;
  /** Remove a custom palette by id. */
  removeCustomPalette: (id: string) => void;
  /** Load custom palettes from DB (called at startup). */
  loadCustomPalettes: () => Promise<void>;
  /** Set the active report layout. Pass undefined to use base layout only. */
  setReportLayoutId: (id: string | undefined) => void;
  /** Set the persisted report preview panel width. */
  setReportPreviewWidth: (width: number) => void;
  /** Set the active report preset ID. Pass undefined to clear. */
  setActivePresetId: (id: string | undefined) => void;
  setSettingsOpen: (open: boolean) => void;
  setPreferredChartEngine: (engine: 'auto' | 'echarts' | 'apexcharts') => void;
  setMemoryShortTermRounds: (rounds: number) => void;
  /** Toggle enable/disable a built-in tool by name */
  setBuiltInToolDisabled: (toolName: string, disabled: boolean) => void;
  /** Set the externalSkills list (called at startup from main process) */
  setExternalSkills: (skills: ConfigState['externalSkills']) => void;
  /** Set the registrySkills list (called at startup from main process) */
  setRegistrySkills: (skills: ConfigState['registrySkills']) => void;

  persist: () => void;
  hydrate: () => void;
}

/** Built-in SVG illustrations — always present, cannot be deleted */
const BUILT_IN_ILLUSTRATIONS: IllustrationAsset[] = [
  {
    id: '__builtin_handshake__',
    name: '商务握手',
    category: '商务协作',
    tags: ['握手', '合作', '方案对比', '谈判'],
    builtIn: true,
    description: '两人握手合作场景，适用于方案对比、合同签署、合作达成等封面或章节插图',
    svgContent: `<svg viewBox="0 0 200 160" width="200" height="160" style="opacity:0.85">
  <circle cx="100" cy="80" r="70" fill="var(--primary,#3b82f6)" opacity="0.08"/>
  <circle cx="65" cy="50" r="14" fill="var(--primary,#3b82f6)"/>
  <rect x="50" y="65" width="30" height="40" rx="8" fill="var(--primary,#3b82f6)"/>
  <rect x="74" y="80" width="30" height="10" rx="5" fill="var(--primary,#3b82f6)" transform="rotate(15,74,80)"/>
  <circle cx="135" cy="50" r="14" fill="#10b981"/>
  <rect x="120" y="65" width="30" height="40" rx="8" fill="#10b981"/>
  <rect x="96" y="80" width="30" height="10" rx="5" fill="#10b981" transform="rotate(-15,126,80)"/>
  <ellipse cx="100" cy="87" rx="12" ry="8" fill="#f59e0b"/>
  <circle cx="40" cy="30" r="3" fill="#f59e0b" opacity="0.6"/>
  <circle cx="160" cy="25" r="2" fill="#f59e0b" opacity="0.4"/>
  <circle cx="155" cy="130" r="2.5" fill="var(--primary,#3b82f6)" opacity="0.5"/>
</svg>`,
  },
  {
    id: '__builtin_data_analysis__',
    name: '数据分析人物',
    category: '数据分析',
    tags: ['数据', '图表', '分析', '汇报', '演示'],
    builtIn: true,
    description: '人物指向图表场景，适用于数据分析报告封面、KPI 展示、趋势说明',
    svgContent: `<svg viewBox="0 0 200 160" width="200" height="160" style="opacity:0.85">
  <rect x="20" y="90" width="160" height="50" rx="6" fill="var(--primary,#3b82f6)" opacity="0.1"/>
  <rect x="40" y="70" width="18" height="70" rx="4" fill="var(--primary,#3b82f6)" opacity="0.4"/>
  <rect x="70" y="50" width="18" height="90" rx="4" fill="var(--primary,#3b82f6)" opacity="0.6"/>
  <rect x="100" y="60" width="18" height="80" rx="4" fill="#10b981" opacity="0.7"/>
  <rect x="130" y="40" width="18" height="100" rx="4" fill="var(--primary,#3b82f6)" opacity="0.9"/>
  <circle cx="160" cy="35" r="15" fill="#f59e0b"/>
  <rect x="145" y="52" width="30" height="38" rx="8" fill="#f59e0b" opacity="0.7"/>
  <line x1="155" y1="58" x2="130" y2="80" stroke="var(--primary,#3b82f6)" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="130" cy="80" r="4" fill="var(--primary,#3b82f6)"/>
  <polyline points="40,100 70,80 100,90 130,60" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="4,3"/>
</svg>`,
  },
  {
    id: '__builtin_team_meeting__',
    name: '团队会议',
    category: '团队展示',
    tags: ['会议', '团队', '协作', '讨论', '汇报'],
    builtIn: true,
    description: '三人围桌讨论场景，适用于团队汇报、多方协作、项目启动封面',
    svgContent: `<svg viewBox="0 0 200 160" width="200" height="160" style="opacity:0.85">
  <ellipse cx="100" cy="105" rx="75" ry="20" fill="var(--card,#f1f5f9)"/>
  <rect x="25" y="95" width="150" height="10" rx="5" fill="var(--primary,#3b82f6)" opacity="0.2"/>
  <circle cx="60" cy="70" r="13" fill="var(--primary,#3b82f6)"/>
  <rect x="47" y="84" width="26" height="30" rx="7" fill="var(--primary,#3b82f6)" opacity="0.7"/>
  <circle cx="100" cy="45" r="13" fill="#10b981"/>
  <rect x="87" y="59" width="26" height="30" rx="7" fill="#10b981" opacity="0.7"/>
  <circle cx="140" cy="70" r="13" fill="#f59e0b"/>
  <rect x="127" y="84" width="26" height="30" rx="7" fill="#f59e0b" opacity="0.7"/>
  <rect x="30" y="35" width="32" height="22" rx="8" fill="white" stroke="var(--primary,#3b82f6)" stroke-width="1.5"/>
  <circle cx="36" cy="45" r="2.5" fill="var(--primary,#3b82f6)"/>
  <circle cx="43" cy="45" r="2.5" fill="var(--primary,#3b82f6)"/>
  <circle cx="50" cy="45" r="2.5" fill="var(--primary,#3b82f6)"/>
  <rect x="138" y="35" width="32" height="22" rx="8" fill="white" stroke="#f59e0b" stroke-width="1.5"/>
  <line x1="148" y1="45" x2="162" y2="45" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
  <line x1="148" y1="51" x2="158" y2="51" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
</svg>`,
  },
  {
    id: '__builtin_success__',
    name: '成功庆典',
    category: '成功庆典',
    tags: ['成功', '庆典', '目标', '达成', '奖杯', '完成'],
    builtIn: true,
    description: '举手人物与奖杯庆典场景，适用于年度总结、目标达成、里程碑章节',
    svgContent: `<svg viewBox="0 0 200 160" width="200" height="160" style="opacity:0.85">
  <rect x="85" y="110" width="30" height="8" rx="3" fill="#f59e0b"/>
  <rect x="78" y="118" width="44" height="6" rx="3" fill="#f59e0b" opacity="0.7"/>
  <path d="M90 60 Q100 30 110 60 L108 110 H92 Z" fill="#f59e0b"/>
  <path d="M90 60 Q75 55 78 80 Q85 90 92 90" fill="none" stroke="#f59e0b" stroke-width="3"/>
  <path d="M110 60 Q125 55 122 80 Q115 90 108 90" fill="none" stroke="#f59e0b" stroke-width="3"/>
  <circle cx="55" cy="55" r="6" fill="#7c4dff" opacity="0.6"/>
  <circle cx="145" cy="50" r="8" fill="var(--primary,#3b82f6)" opacity="0.5"/>
  <circle cx="50" cy="100" r="4" fill="#10b981" opacity="0.6"/>
  <circle cx="155" cy="95" r="5" fill="#f59e0b" opacity="0.4"/>
  <rect x="40" y="30" width="6" height="10" rx="2" fill="var(--primary,#3b82f6)" opacity="0.5" transform="rotate(20,43,35)"/>
  <rect x="150" y="35" width="6" height="10" rx="2" fill="#10b981" opacity="0.5" transform="rotate(-15,153,40)"/>
  <rect x="30" y="70" width="8" height="6" rx="2" fill="#f59e0b" opacity="0.5" transform="rotate(30,34,73)"/>
  <rect x="160" y="70" width="8" height="6" rx="2" fill="#7c4dff" opacity="0.5" transform="rotate(-20,164,73)"/>
  <circle cx="100" cy="40" r="12" fill="var(--primary,#3b82f6)"/>
  <line x1="100" y1="52" x2="100" y2="80" stroke="var(--primary,#3b82f6)" stroke-width="5" stroke-linecap="round"/>
  <line x1="100" y1="60" x2="80" y2="48" stroke="var(--primary,#3b82f6)" stroke-width="4" stroke-linecap="round"/>
  <line x1="100" y1="60" x2="120" y2="48" stroke="var(--primary,#3b82f6)" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  },
];

/** Merge saved illustrations, ensuring built-ins are always present */
function mergeWithBuiltInIllustrations(saved: IllustrationAsset[]): IllustrationAsset[] {
  const missing = BUILT_IN_ILLUSTRATIONS.filter((d) => !saved.find((s) => s.id === d.id));
  return [...BUILT_IN_ILLUSTRATIONS, ...saved.filter((s) => !s.builtIn), ...missing.filter((m) => !BUILT_IN_ILLUSTRATIONS.find((b) => b.id === m.id))];
}

function loadFromStorage(): Partial<ConfigState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Version mismatch: clear user-added models so stale dev configs
      // (e.g. 阿里云 CodePlan) never appear in fresh production builds.
      if ((data.configVersion as number | undefined) !== CONFIG_VERSION) {
        return { ...data, models: [] };
      }
      return data;
    }
  } catch { /* ignore */ }
  return {};
}

export const useConfigStore = create<ConfigState>((set, get) => {
  const saved = loadFromStorage();
  // User models from storage (strip locked models if accidentally saved)
  const userModels = (saved.models ?? []).filter((m) => !LOCKED_IDS.has(m.id));
  // Restore saved overrides for Pro locked model
  const savedProBaseUrl = (saved as any).lockedProBaseUrl as string | undefined;
  const savedProModelId = (saved as any).lockedProModelId as string | undefined;
  const proModelInstance: ModelConfig = {
    ...LOCKED_PRO_MODEL,
    ...(savedProBaseUrl ? { baseUrl: savedProBaseUrl } : {}),
    ...(savedProModelId ? { modelId: savedProModelId } : {}),
  };
  // Restore saved overrides for Basic locked model
  const savedBasicBaseUrl = (saved as any).lockedBasicBaseUrl as string | undefined;
  const savedBasicModelId = (saved as any).lockedBasicModelId as string | undefined;
  const basicModelInstance: ModelConfig = {
    ...LOCKED_BASIC_MODEL,
    ...(savedBasicBaseUrl ? { baseUrl: savedBasicBaseUrl } : {}),
    ...(savedBasicModelId ? { modelId: savedBasicModelId } : {}),
  };
  const initialModels = __ENTERPRISE_BUILD__
    ? [proModelInstance, basicModelInstance, ...(userModels.length ? userModels : DEFAULT_MODELS)]
    : [...(userModels.length ? userModels : DEFAULT_MODELS)];
  const initialActiveModelId = (() => {
    const savedId = saved.activeModelId as string | undefined;
    if (savedId && initialModels.some((m) => m.id === savedId)) return savedId;
    // Default to first non-locked model — enterprise plugin availability is checked asynchronously
    // and we must not default to a locked enterprise model when plugin is absent.
    return initialModels.find((m) => !LOCKED_IDS.has(m.id))?.id || initialModels[0]?.id || '';
  })();
  return {
    models: initialModels,
    activeModelId: initialActiveModelId,
    mcpServers: ((saved.mcpServers as McpServerConfig[]) || []).map((s) => ({ ...s, type: (s.type as string) === 'http' ? 'streamableHttp' : s.type })) as McpServerConfig[],
    installedSkills: saved.installedSkills || [],
    dynamicToolDefs: saved.dynamicToolDefs || [],
    userSystemPrompts: (saved.userSystemPrompts as UserSystemPrompt[])?.length
      ? (saved.userSystemPrompts as UserSystemPrompt[])
      : DEFAULT_USER_PROMPTS,
    theme: saved.theme || 'light',
    language: ((saved as any).language as LangCode) || detectSystemLanguage(),
    paletteId: ((saved as any).paletteId as string) || 'palette-classic',
    customPalettes: [],
    reportLayoutId: ((saved as any).reportLayoutId as string | undefined) || undefined,
    reportPreviewWidth: typeof (saved as any).reportPreviewWidth === 'number' ? (saved as any).reportPreviewWidth : 480,
    activePresetId: ((saved as any).activePresetId as string | undefined) || undefined,
    settingsOpen: false,
    preferredChartEngine: ((saved as any).preferredChartEngine as 'auto' | 'echarts' | 'apexcharts') || 'auto',
    memoryShortTermRounds: typeof (saved as any).memoryShortTermRounds === 'number' ? (saved as any).memoryShortTermRounds : 5,
    disabledBuiltInTools: (saved as any).disabledBuiltInTools as string[] || [],
    illustrations: mergeWithBuiltInIllustrations((saved as any).illustrations as IllustrationAsset[] || []),
    imageAssets: (saved as any).imageAssets as ImageAsset[] || [],
    externalSkills: [],
    registrySkills: [],
    enterprisePluginAvailable: false,
    setEnterprisePluginAvailable: (available) => {
      set((state) => {
        const updates: Partial<ConfigState> = { enterprisePluginAvailable: available };
        // If plugin is not available and active model is a locked enterprise model, auto-switch
        if (!available && LOCKED_IDS.has(state.activeModelId)) {
          const fallback = state.models.find((m) => !LOCKED_IDS.has(m.id));
          if (fallback) updates.activeModelId = fallback.id;
        }
        return updates;
      });
    },
    sidebarCollapsed: ((saved as any).sidebarCollapsed as boolean) || false,
    reactMaxSteps: typeof (saved as any).reactMaxSteps === 'number' ? (saved as any).reactMaxSteps : 30,
    toolExecutionTimeoutMs: typeof (saved as any).toolExecutionTimeoutMs === 'number' ? (saved as any).toolExecutionTimeoutMs : 120000,
    streamTimeoutMs: typeof (saved as any).streamTimeoutMs === 'number' ? (saved as any).streamTimeoutMs : 30000,
    dataParsingLimits: {
      excelMaxRows: typeof (saved as any).dataParsingLimits?.excelMaxRows === 'number' ? (saved as any).dataParsingLimits.excelMaxRows : 200,
      csvMaxRows: typeof (saved as any).dataParsingLimits?.csvMaxRows === 'number' ? (saved as any).dataParsingLimits.csvMaxRows : 200,
      pdfMaxChars: typeof (saved as any).dataParsingLimits?.pdfMaxChars === 'number' ? (saved as any).dataParsingLimits.pdfMaxChars : 50000,
      textMaxChars: typeof (saved as any).dataParsingLimits?.textMaxChars === 'number' ? (saved as any).dataParsingLimits.textMaxChars : 10000,
      dbQueryMaxRows: typeof (saved as any).dataParsingLimits?.dbQueryMaxRows === 'number' ? (saved as any).dataParsingLimits.dbQueryMaxRows : 500,
    },

    setSidebarCollapsed: (collapsed) => { set({ sidebarCollapsed: collapsed }); get().persist(); },
    setReactMaxSteps: (steps) => { set({ reactMaxSteps: steps }); get().persist(); },
    setToolExecutionTimeoutMs: (ms) => { set({ toolExecutionTimeoutMs: ms }); get().persist(); },
    setStreamTimeoutMs: (ms) => { set({ streamTimeoutMs: ms }); get().persist(); },
    setDataParsingLimits: (limits) => {
      set((s) => ({ dataParsingLimits: { ...s.dataParsingLimits, ...limits } }));
      get().persist();
    },

    customLayouts: [],
    addCustomLayout: (layout) => {
      set((s) => ({ customLayouts: [...s.customLayouts, layout] }));
      get().persist();
    },
    removeCustomLayout: (id) => {
      set((s) => ({ customLayouts: s.customLayouts.filter((l) => l.id !== id) }));
      get().persist();
    },

    setActiveModel: (id) => { set({ activeModelId: id }); get().persist(); },
    updateModel: (id, patch) => {
      if (LOCKED_IDS.has(id)) {
        // Only allow baseUrl and modelId updates for locked models
        const { baseUrl, modelId } = patch as Partial<ModelConfig>;
        if (baseUrl === undefined && modelId === undefined) return;
        const allowedPatch: Partial<ModelConfig> = {};
        if (baseUrl !== undefined) allowedPatch.baseUrl = baseUrl;
        if (modelId !== undefined) allowedPatch.modelId = modelId;
        set((s) => ({ models: s.models.map((m) => m.id === id ? { ...m, ...allowedPatch } : m) }));
        get().persist();
        return;
      }
      set((s) => ({
        models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
      get().persist();
    },
    addModel: (model) => { set((s) => ({ models: [...s.models, model] })); get().persist(); },
    removeModel: (id) => {
      if (LOCKED_IDS.has(id)) return; // Cannot remove built-in locked models
      set((s) => {
        const models = s.models.filter((m) => m.id !== id);
        const activeModelId = models.some((m) => m.id === s.activeModelId)
          ? s.activeModelId
          : (models.find((m) => !LOCKED_IDS.has(m.id))?.id || models[0]?.id || '');
        return { models, activeModelId };
      });
      get().persist();
    },
    addMcpServer: (config) => { set((s) => ({ mcpServers: [...s.mcpServers, config] })); get().persist(); },
    removeMcpServer: (id) => { set((s) => ({ mcpServers: s.mcpServers.filter((m) => m.id !== id) })); get().persist(); },
    updateMcpServer: (id, patch) => { set((s) => ({ mcpServers: s.mcpServers.map((m) => m.id === id ? { ...m, ...patch } : m) })); get().persist(); },
    updateMcpDiscoveredTools: (serverId, tools) => {
      set((s) => ({
        mcpServers: s.mcpServers.map((m) => m.id === serverId ? { ...m, discoveredTools: tools } : m),
      }));
      // Don't persist discoveredTools - they are transient and refreshed on demand
    },
    addSkill: (skill) => { set((s) => ({ installedSkills: [...s.installedSkills, skill] })); get().persist(); },
    removeSkill: (id) => { set((s) => ({ installedSkills: s.installedSkills.filter((s) => s.id !== id) })); get().persist(); },
    addDynamicTool: (tool) => { set((s) => ({ dynamicToolDefs: [...s.dynamicToolDefs, tool] })); get().persist(); },
    removeDynamicTool: (id) => { set((s) => ({ dynamicToolDefs: s.dynamicToolDefs.filter((t) => t.id !== id) })); get().persist(); },
    addUserPrompt: (prompt) => { set((s) => ({ userSystemPrompts: [...s.userSystemPrompts, prompt] })); get().persist(); },
    updateUserPrompt: (id, patch) => {
      set((s) => ({ userSystemPrompts: s.userSystemPrompts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
      get().persist();
    },
    removeUserPrompt: (id) => { set((s) => ({ userSystemPrompts: s.userSystemPrompts.filter((p) => p.id !== id) })); get().persist(); },
    toggleTheme: () => {
      set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' }));
      get().persist();
    },
    setLanguage: (lang) => {
      set({ language: lang });
      get().persist();
      // Notify main process so native dialogs (e.g. exit confirmation) can use the same language
      if (isElectron()) {
        (window as any).electronAPI?.appSetLanguage?.(lang);
      }
    },
    setPaletteId: (id) => { set({ paletteId: id }); get().persist(); },
    addCustomPalette: (palette) => {
      const updated = [...get().customPalettes, { ...palette, isCustom: true }];
      set({ customPalettes: updated });
      if (isElectron()) dbAPI.setConfig('customPalettes', JSON.stringify(updated)).catch(console.error);
    },
    updateCustomPalette: (id, patch) => {
      const updated = get().customPalettes.map((p) => p.id === id ? { ...p, ...patch } : p);
      set({ customPalettes: updated });
      if (isElectron()) dbAPI.setConfig('customPalettes', JSON.stringify(updated)).catch(console.error);
    },
    removeCustomPalette: (id) => {
      const updated = get().customPalettes.filter((p) => p.id !== id);
      set({ customPalettes: updated });
      if (isElectron()) dbAPI.setConfig('customPalettes', JSON.stringify(updated)).catch(console.error);
    },
    loadCustomPalettes: async () => {
      try {
        const raw = isElectron() ? await dbAPI.getConfig('customPalettes') : localStorage.getItem('customPalettes');
        if (raw) { set({ customPalettes: JSON.parse(raw) as PalettePreset[] }); }
      } catch { /* ignore */ }
    },
    setReportLayoutId: (id) => { set({ reportLayoutId: id }); get().persist(); },
    setReportPreviewWidth: (width) => { set({ reportPreviewWidth: Math.max(300, Math.min(1400, width)) }); get().persist(); },
    setActivePresetId: (id) => { set({ activePresetId: id }); get().persist(); },
    setSettingsOpen: (open) => { set({ settingsOpen: open }); },
    setPreferredChartEngine: (engine) => { set({ preferredChartEngine: engine }); get().persist(); },
    setMemoryShortTermRounds: (rounds) => { set({ memoryShortTermRounds: Math.max(1, Math.min(20, rounds)) }); get().persist(); },
    setBuiltInToolDisabled: (toolName, disabled) => {
      set((s) => {
        const current = new Set(s.disabledBuiltInTools);
        if (disabled) current.add(toolName);
        else current.delete(toolName);
        return { disabledBuiltInTools: Array.from(current) };
      });
      get().persist();
    },

    setExternalSkills: (skills) => { set({ externalSkills: skills }); },
  setRegistrySkills: (skills) => { set({ registrySkills: skills }); },
    addIllustration: (ill) => { set((s) => ({ illustrations: [...s.illustrations, ill] })); get().persist(); },
    removeIllustration: (id) => { set((s) => ({ illustrations: s.illustrations.filter((i) => i.id !== id || i.builtIn) })); get().persist(); },
    updateIllustration: (id, patch) => { set((s) => ({ illustrations: s.illustrations.map((i) => i.id === id ? { ...i, ...patch } : i) })); get().persist(); },
    addImageAsset: (asset) => { set((s) => ({ imageAssets: [...s.imageAssets, asset] })); get().persist(); },
    removeImageAsset: (id) => { set((s) => ({ imageAssets: s.imageAssets.filter((a) => a.id !== id) })); get().persist(); },
    persist: () => {
      const { models, activeModelId, mcpServers, installedSkills, theme, language, dynamicToolDefs, userSystemPrompts, paletteId, reportLayoutId, reportPreviewWidth, activePresetId, preferredChartEngine, memoryShortTermRounds, disabledBuiltInTools, illustrations, imageAssets, sidebarCollapsed, reactMaxSteps, toolExecutionTimeoutMs, streamTimeoutMs, dataParsingLimits, customLayouts } = get();
      // Filter out locked models — they must not be persisted as regular models
      const modelsToSave = models.filter((m) => !m.locked);
      // Save overrides for each locked model separately
      const proModel = models.find((m) => m.id === LOCKED_PRO_ID);
      const basicModel = models.find((m) => m.id === LOCKED_BASIC_ID);
      const lockedProBaseUrl = proModel?.baseUrl !== LOCKED_PRO_MODEL.baseUrl ? proModel?.baseUrl : undefined;
      const lockedProModelId = proModel?.modelId !== LOCKED_PRO_DEFAULT_MODELID ? proModel?.modelId : undefined;
      const lockedBasicBaseUrl = basicModel?.baseUrl !== LOCKED_BASIC_MODEL.baseUrl ? basicModel?.baseUrl : undefined;
      const lockedBasicModelId = basicModel?.modelId !== LOCKED_BASIC_DEFAULT_MODELID ? basicModel?.modelId : undefined;
      const data = { configVersion: CONFIG_VERSION, models: modelsToSave, activeModelId, mcpServers, installedSkills, theme, language, paletteId, reportLayoutId, reportPreviewWidth, activePresetId, dynamicToolDefs, userSystemPrompts, lockedProBaseUrl, lockedProModelId, lockedBasicBaseUrl, lockedBasicModelId, preferredChartEngine, memoryShortTermRounds, disabledBuiltInTools, illustrations: illustrations.filter((i) => !i.builtIn), imageAssets, sidebarCollapsed, reactMaxSteps, toolExecutionTimeoutMs, streamTimeoutMs, dataParsingLimits, customLayouts };
      const json = JSON.stringify(data);
      // Save to both localStorage (fallback) and DB
      try { localStorage.setItem(STORAGE_KEY, json); } catch { /* ignore */ }
      if (isElectron()) {
        dbAPI.setConfig('app-config', json).catch(console.error);
      }
    },
    hydrate: () => {
      const saved = loadFromStorage();
      if (saved.models) {
        const savedModels = saved.models as ModelConfig[];
        const userModels = savedModels.filter((m) => !LOCKED_IDS.has(m.id));
        // Restore overrides for Pro locked model
        const savedProUrl = (saved as any).lockedProBaseUrl as string | undefined;
        const savedProMid = (saved as any).lockedProModelId as string | undefined;
        const proInstance = {
          ...LOCKED_PRO_MODEL,
          ...(savedProUrl ? { baseUrl: savedProUrl } : {}),
          ...(savedProMid ? { modelId: savedProMid } : {}),
        };
        // Restore overrides for Basic locked model
        const savedBasicUrl = (saved as any).lockedBasicBaseUrl as string | undefined;
        const savedBasicMid = (saved as any).lockedBasicModelId as string | undefined;
        const basicInstance = {
          ...LOCKED_BASIC_MODEL,
          ...(savedBasicUrl ? { baseUrl: savedBasicUrl } : {}),
          ...(savedBasicMid ? { modelId: savedBasicMid } : {}),
        };
        const models = [proInstance, basicInstance, ...userModels];
        const activeModelId = (saved.activeModelId && models.some((m) => m.id === saved.activeModelId))
          ? (saved.activeModelId as string)
          : (models.find((m) => !LOCKED_IDS.has(m.id))?.id || models[0]?.id || '');

        set((state) => ({
          ...state,
          models,
          activeModelId,
          mcpServers: ((saved.mcpServers as McpServerConfig[]) || []).map((s) => ({
            ...s,
            // Migrate legacy 'http' type to 'streamableHttp'
            type: (s.type as string) === 'http' ? 'streamableHttp' : s.type,
          })) as McpServerConfig[],
          installedSkills: (saved.installedSkills as InstalledSkill[]) || [],
          dynamicToolDefs: (saved.dynamicToolDefs as DynamicToolDef[]) || [],
          userSystemPrompts: (saved.userSystemPrompts as UserSystemPrompt[])?.length
            ? (saved.userSystemPrompts as UserSystemPrompt[])
            : DEFAULT_USER_PROMPTS,
          paletteId: ((saved as any).paletteId as string) || 'palette-classic',
          customPalettes: [],
          theme: (saved.theme as 'light' | 'dark') || 'light',
          preferredChartEngine: ((saved as any).preferredChartEngine as 'auto' | 'echarts' | 'apexcharts') || 'auto',
          memoryShortTermRounds: typeof (saved as any).memoryShortTermRounds === 'number' ? (saved as any).memoryShortTermRounds : 5,
          disabledBuiltInTools: (saved as any).disabledBuiltInTools as string[] || [],
          illustrations: mergeWithBuiltInIllustrations((saved as any).illustrations as IllustrationAsset[] || []),
          imageAssets: (saved as any).imageAssets as ImageAsset[] || [],
          sidebarCollapsed: ((saved as any).sidebarCollapsed as boolean) || false,
          reactMaxSteps: typeof (saved as any).reactMaxSteps === 'number' ? (saved as any).reactMaxSteps : 30,
          toolExecutionTimeoutMs: typeof (saved as any).toolExecutionTimeoutMs === 'number' ? (saved as any).toolExecutionTimeoutMs : 120000,
          streamTimeoutMs: typeof (saved as any).streamTimeoutMs === 'number' ? (saved as any).streamTimeoutMs : 30000,
          dataParsingLimits: {
            excelMaxRows: typeof (saved as any).dataParsingLimits?.excelMaxRows === 'number' ? (saved as any).dataParsingLimits.excelMaxRows : 200,
            csvMaxRows: typeof (saved as any).dataParsingLimits?.csvMaxRows === 'number' ? (saved as any).dataParsingLimits.csvMaxRows : 200,
            pdfMaxChars: typeof (saved as any).dataParsingLimits?.pdfMaxChars === 'number' ? (saved as any).dataParsingLimits.pdfMaxChars : 50000,
            textMaxChars: typeof (saved as any).dataParsingLimits?.textMaxChars === 'number' ? (saved as any).dataParsingLimits.textMaxChars : 10000,
            dbQueryMaxRows: typeof (saved as any).dataParsingLimits?.dbQueryMaxRows === 'number' ? (saved as any).dataParsingLimits.dbQueryMaxRows : 500,
          },
          customLayouts: Array.isArray((saved as any).customLayouts) ? (saved as any).customLayouts : [],
        }));
      }
    },
  };
});
