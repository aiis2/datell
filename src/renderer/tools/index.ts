import type { AgentToolDefinition, DynamicToolDef, McpServerConfig } from '../types';
import type { ExternalSkill, RegistrySkillManifest } from '../../shared/skills';
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
import { mergeRuntimeToolSources } from './runtimeMerge';

/**
 * Get all registered agent tools, including built-in tools and dynamically created skills.
 * Built-in tools that the user has disabled are filtered out.
 * External skills loaded from the skills directory are included as dynamic tools.
 */
export function getAllTools(): AgentToolDefinition[] {
  let dynamicToolDefs: DynamicToolDef[] = [];
  let registrySkills: RegistrySkillManifest[] = [];
  let legacyDirectorySkills: ExternalSkill[] = [];
  let mcpServers: McpServerConfig[] = [];
  let disabledBuiltIns: string[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useConfigStore } = require('../stores/configStore') as typeof import('../stores/configStore');
    const state = useConfigStore.getState();
    dynamicToolDefs = state.dynamicToolDefs ?? [];
    registrySkills = state.registrySkills ?? [];
    legacyDirectorySkills = state.externalSkills ?? [];
    mcpServers = state.mcpServers ?? [];
    disabledBuiltIns = state.disabledBuiltInTools ?? [];
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
  ].filter((t) => !disabledBuiltIns.includes(t.name));

  return mergeRuntimeToolSources({
    builtIns,
    registrySkills,
    legacyDirectorySkills,
    dynamicToolDefs,
    mcpServers,
    disabledBuiltInTools: disabledBuiltIns,
  });
}

