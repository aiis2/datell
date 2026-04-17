import type { AgentToolDefinition } from '../types';
import { generateExcelTool } from './generateExcel';
import { generatePdfTool } from './generatePdf';
import { dataAnalysisTool } from './dataAnalysis';
import { generateChartTool } from './generateChart';
import { generateChartApexTool } from './generateChartApex';
import { generateTableVtableTool } from './generateTableVtable';
import { generateSlideTool } from './generateSlide';
import { generateDocumentTool } from './generateDocument';
import { skillCreatorTool } from './skillCreator';
import { askUserTool } from './askUser';
import { runSubagentTool } from './runSubagent';
import { runSubagentsParallelTool } from './runSubagentsParallel';
import { runSubagentsSerialTool } from './runSubagentsSerial';
import { runNodeSubagentTool } from './runNodeSubagent';
import { webFetchTool } from './webFetch';
import { planTasksTool } from './planTasks';
import { completeTaskTool } from './completeTask';
import { showMiniChartTool } from './showMiniChart';
import { showWidgetTool } from './showWidget';
import { queryDatabaseTool } from './queryDatabase';
import { getDatabaseSchemaTool } from './getDatabaseSchema';
import { searchAssetsTool } from './searchAssets';
import { suggestCardCombinationsTool } from './suggestCardCombinations';
import { validateReportTool } from './validateReport';
import { checkDataQualityTool } from './checkDataQuality';
import { runJsSandboxTool } from './runJsSandbox';

/**
 * Get all registered agent tools, including built-in tools and dynamically created skills.
 * Built-in tools that the user has disabled are filtered out.
 * External skills loaded from the skills directory are included as dynamic tools.
 */
export function getAllTools(): AgentToolDefinition[] {
  let dynamicTools: AgentToolDefinition[] = [];
  let disabledBuiltIns: Set<string> = new Set();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useConfigStore } = require('../stores/configStore') as typeof import('../stores/configStore');
    const state = useConfigStore.getState();
    const defs = state.dynamicToolDefs;
    disabledBuiltIns = new Set(state.disabledBuiltInTools ?? []);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;

    // Security check: patterns forbidden in dynamic tool code
    const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\brequire\s*\(/, label: 'require()' },
      { pattern: /\bimport\s*\(/, label: 'import()' },
      { pattern: /process\.env\b/, label: 'process.env' },
      { pattern: /child_process/, label: 'child_process' },
      { pattern: /window\.electronAPI\b/, label: 'window.electronAPI' },
      { pattern: /eval\s*\(/, label: 'eval()' },
      { pattern: /new\s+Function\s*\(/, label: 'new Function()' },
    ];

    function hasForbiddenPattern(code: string): string | null {
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        if (pattern.test(code)) return label;
      }
      return null;
    }

    // AI-created dynamic tools
    dynamicTools = defs.map((dt) => ({
      name: dt.name,
      description: dt.description,
      parameters: dt.parameters,
      execute: async (args: Record<string, unknown>): Promise<string> => {
        const forbidden = hasForbiddenPattern(dt.code);
        if (forbidden) {
          return `安全拒绝: 工具 "${dt.name}" 的代码包含禁止模式 "${forbidden}"，已预防性拦截。`;
        }
        try {
          const fn = new AsyncFunction('args', dt.code);
          const result: unknown = await fn(args);
          return String(result ?? '');
        } catch (err) {
          return `工具 ${dt.name} 执行错误: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }));

    // External skills loaded from datellData/skills directory
    const externalSkills = state.externalSkills ?? [];
    for (const skill of externalSkills) {
      for (const tool of skill.tools) {
        dynamicTools.push({
          name: tool.name,
          description: `[${skill.name}] ${tool.description}`,
          parameters: tool.parameters as unknown as import('../types').ToolParameter[],
          execute: async (args: Record<string, unknown>): Promise<string> => {
            const forbidden = hasForbiddenPattern(tool.code);
            if (forbidden) {
              return `安全拒绝: 技能 "${tool.name}" 的代码包含禁止模式 "${forbidden}"，已预防性拦截。`;
            }
            try {
              const fn = new AsyncFunction('args', tool.code);
              const result: unknown = await fn(args);
              return String(result ?? '');
            } catch (err) {
              return `技能 ${tool.name} 执行错误: ${err instanceof Error ? err.message : String(err)}`;
            }
          },
        });
      }
    }

    // HTTP MCP server tools — add any server with discovered tools
    const mcpServers = state.mcpServers ?? [];
    for (const server of mcpServers) {
      if (!server.enabled || server.type === 'stdio' || !server.url) continue;
      const discovered = server.discoveredTools ?? [];
      for (const tool of discovered) {
        const serverUrl = server.url;
        const serverName = server.name;
        dynamicTools.push({
          name: tool.name,
          description: `[MCP: ${serverName}] ${tool.description ?? tool.name}`,
          parameters: Object.entries((tool.inputSchema?.properties ?? {}) as Record<string, { type?: string; description?: string }>).map(([k, v]) => ({
            name: k,
            type: (v.type as string) ?? 'string',
            description: v.description ?? k,
            required: Array.isArray(tool.inputSchema?.required) && (tool.inputSchema.required as string[]).includes(k),
          })),
          execute: async (args: Record<string, unknown>): Promise<string> => {
            if (!window.electronAPI?.mcpHttpCall) return `错误: MCP HTTP 调用未初始化`;
            const res = await window.electronAPI.mcpHttpCall(serverUrl, tool.name, args, server.timeout);
            if (!res.ok) return `MCP 工具 ${tool.name} 调用失败: ${res.error}`;
            return res.result ?? '(无返回内容)';
          },
          isConcurrencySafe: () => true,
        });
      }
    }
  } catch {
    // configStore not yet initialised — skip dynamic tools
  }

  const builtIns: AgentToolDefinition[] = [
    generateChartTool,
    generateChartApexTool,
    generateTableVtableTool,
    generateExcelTool,
    generatePdfTool,
    generateSlideTool,
    generateDocumentTool,
    dataAnalysisTool,
    skillCreatorTool,
    askUserTool,
    runSubagentTool,
    runSubagentsParallelTool,
    runSubagentsSerialTool,
    runNodeSubagentTool,
    webFetchTool,
    planTasksTool,
    completeTaskTool,
    showMiniChartTool,
    showWidgetTool,
    queryDatabaseTool,
    getDatabaseSchemaTool,
    searchAssetsTool,
    suggestCardCombinationsTool,
    validateReportTool,
    checkDataQualityTool,
    runJsSandboxTool,
  ].filter((t) => !disabledBuiltIns.has(t.name));

  return [...builtIns, ...dynamicTools];
}

