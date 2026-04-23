import type { ExternalSkill, RegistrySkillManifest, RuntimeSkillTool } from '../../shared/skills';
import type { AgentToolDefinition, DynamicToolDef, McpServerConfig, ToolParameter } from '../types';

interface MergeRuntimeToolSourcesArgs {
  builtIns: AgentToolDefinition[];
  registrySkills?: RegistrySkillManifest[];
  legacyDirectorySkills?: ExternalSkill[];
  dynamicToolDefs?: DynamicToolDef[];
  mcpServers?: McpServerConfig[];
  disabledBuiltInTools?: string[];
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;

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
    if (pattern.test(code)) {
      return label;
    }
  }
  return null;
}

function normalizeToolParameters(parameters: unknown): ToolParameter[] {
  if (Array.isArray(parameters)) {
    return parameters as ToolParameter[];
  }

  if (parameters && typeof parameters === 'object') {
    const schema = parameters as {
      type?: string;
      properties?: Record<string, { type?: string; description?: string }>;
      required?: string[];
    };

    if (schema.type === 'object' && schema.properties) {
      const required = new Set(schema.required || []);
      return Object.entries(schema.properties).map(([name, definition]) => ({
        name,
        type: definition.type || 'string',
        description: definition.description || name,
        required: required.has(name),
      }));
    }
  }

  return [];
}

function buildScriptBackedTool(
  toolName: string,
  description: string,
  parameters: unknown,
  code: string,
  label: string,
  callableBuiltIns: Map<string, AgentToolDefinition>,
): AgentToolDefinition {
  return {
    name: toolName,
    description,
    parameters: normalizeToolParameters(parameters),
    execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
      const forbidden = hasForbiddenPattern(code);
      if (forbidden) {
        return `安全拒绝: ${label} "${toolName}" 的代码包含禁止模式 "${forbidden}"，已预防性拦截。`;
      }
      try {
        const callTool = async (nestedToolName: string, nestedArgs: Record<string, unknown> = {}): Promise<string> => {
          if (!nestedToolName || typeof nestedToolName !== 'string') {
            throw new Error('callTool 需要提供目标工具名');
          }

          const nestedTool = callableBuiltIns.get(nestedToolName);
          if (!nestedTool) {
            throw new Error(`技能内不允许调用非内置工具 "${nestedToolName}"；当前仅支持复用 built-in tools`);
          }

          if (nestedTool.validateInput) {
            const validation = nestedTool.validateInput(nestedArgs);
            if (!validation.valid) {
              throw new Error(`内置工具 ${nestedToolName} 参数验证失败: ${validation.error ?? '参数无效'}`);
            }
          }

          return nestedTool.execute(nestedArgs, signal);
        };

        const fn = new AsyncFunction('args', 'callTool', code);
        const result: unknown = await fn(args, callTool);
        return String(result ?? '');
      } catch (err) {
        return `${label} ${toolName} 执行错误: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

function appendSkillTools(
  target: AgentToolDefinition[],
  seen: Set<string>,
  blocked: Set<string>,
  skills: Array<ExternalSkill | RegistrySkillManifest>,
  prefixBuilder: (skillName: string, tool: RuntimeSkillTool) => string,
  label: string,
  callableBuiltIns: Map<string, AgentToolDefinition>,
): void {
  for (const skill of skills) {
    for (const tool of skill.tools) {
      if (seen.has(tool.name) || blocked.has(tool.name)) {
        continue;
      }
      seen.add(tool.name);
      target.push(
        buildScriptBackedTool(
          tool.name,
          prefixBuilder(skill.name, tool),
          tool.parameters,
          tool.code,
          label,
          callableBuiltIns,
        ),
      );
    }
  }
}

function appendDynamicTools(
  target: AgentToolDefinition[],
  seen: Set<string>,
  blocked: Set<string>,
  defs: DynamicToolDef[],
  callableBuiltIns: Map<string, AgentToolDefinition>,
): void {
  for (const tool of defs) {
    if (seen.has(tool.name) || blocked.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    target.push(buildScriptBackedTool(tool.name, tool.description, tool.parameters, tool.code, '工具', callableBuiltIns));
  }
}

function appendMcpTools(target: AgentToolDefinition[], seen: Set<string>, blocked: Set<string>, servers: McpServerConfig[]): void {
  for (const server of servers) {
    if (!server.enabled || server.type === 'stdio' || !server.url) {
      continue;
    }
    for (const tool of server.discoveredTools ?? []) {
      if (seen.has(tool.name) || blocked.has(tool.name)) {
        continue;
      }
      seen.add(tool.name);
      target.push({
        name: tool.name,
        description: `[MCP: ${server.name}] ${tool.description ?? tool.name}`,
        parameters: normalizeToolParameters(tool.inputSchema),
        execute: async (args: Record<string, unknown>): Promise<string> => {
          if (!window.electronAPI?.mcpHttpCall) {
            return '错误: MCP HTTP 调用未初始化';
          }
          const result = await window.electronAPI.mcpHttpCall(server.url!, tool.name, args, server.timeout);
          if (!result.ok) {
            return `MCP 工具 ${tool.name} 调用失败: ${result.error}`;
          }
          return result.result ?? '(无返回内容)';
        },
        isConcurrencySafe: () => true,
      });
    }
  }
}

export function mergeRuntimeToolSources({
  builtIns,
  registrySkills = [],
  legacyDirectorySkills = [],
  dynamicToolDefs = [],
  mcpServers = [],
  disabledBuiltInTools = [],
}: MergeRuntimeToolSourcesArgs): AgentToolDefinition[] {
  const blocked = new Set(disabledBuiltInTools);
  const seen = new Set<string>();
  const merged: AgentToolDefinition[] = [];
  const callableBuiltIns = new Map<string, AgentToolDefinition>();

  for (const tool of builtIns) {
    if (blocked.has(tool.name) || seen.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    merged.push(tool);
    callableBuiltIns.set(tool.name, tool);
  }

  appendSkillTools(merged, seen, blocked, registrySkills, (skillName, tool) => `[Registry: ${skillName}] ${tool.description}`, '技能', callableBuiltIns);
  appendSkillTools(merged, seen, blocked, legacyDirectorySkills, (skillName, tool) => `[${skillName}] ${tool.description}`, '技能', callableBuiltIns);
  appendDynamicTools(merged, seen, blocked, dynamicToolDefs, callableBuiltIns);
  appendMcpTools(merged, seen, blocked, mcpServers);

  return merged;
}