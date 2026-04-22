import type { ExternalSkill, RegistrySkillManifest, RuntimeSkillTool } from '../../shared/skills';
import type { DynamicToolDef } from '../types';

function cloneRuntimeSkillTool(tool: RuntimeSkillTool): RuntimeSkillTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: Array.isArray(tool.parameters)
      ? tool.parameters.map((item) => ({ ...(item as Record<string, unknown>) }))
      : tool.parameters && typeof tool.parameters === 'object'
        ? { ...(tool.parameters as Record<string, unknown>) }
        : tool.parameters,
    code: tool.code,
  };
}

export function slugifySkillId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'custom-skill';
}

export function makeUniqueSkillId(seed: string, existingIds: string[]): string {
  const baseId = slugifySkillId(seed);
  const existing = new Set(existingIds);
  if (!existing.has(baseId)) {
    return baseId;
  }

  let index = 2;
  while (existing.has(`${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

export function createEmptyRegistrySkillManifest(): RegistrySkillManifest {
  return {
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    tools: [
      {
        name: '',
        description: '',
        parameters: [],
        code: 'return "";',
      },
    ],
  };
}

export function createRegistrySkillFromExternalSkill(
  skill: ExternalSkill,
  existingIds: string[] = [],
): RegistrySkillManifest {
  return {
    id: makeUniqueSkillId(skill.name || skill.source, existingIds),
    name: skill.name,
    description: skill.description,
    version: skill.version || '1.0.0',
    tools: skill.tools.map(cloneRuntimeSkillTool),
  };
}

export function createRegistrySkillFromDynamicTool(
  tool: DynamicToolDef,
  existingIds: string[] = [],
): RegistrySkillManifest {
  return {
    id: makeUniqueSkillId(tool.name, existingIds),
    name: tool.name,
    description: tool.description,
    version: '1.0.0',
    tools: [
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map((parameter) => ({ ...parameter })),
        code: tool.code,
      },
    ],
  };
}

export function serializeRegistrySkillTools(tools: RuntimeSkillTool[]): string {
  return JSON.stringify(tools, null, 2);
}

export function parseRegistrySkillTools(toolsJson: string): RuntimeSkillTool[] {
  const parsed = JSON.parse(toolsJson);
  if (!Array.isArray(parsed)) {
    throw new Error('tools 必须是数组');
  }

  const tools = parsed as RuntimeSkillTool[];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') {
      throw new Error('tools 中包含无效对象');
    }
    if (!String(tool.name || '').trim()) {
      throw new Error('tool.name 不能为空');
    }
    if (!String(tool.code || '').trim()) {
      throw new Error(`tool.code 不能为空: ${String(tool.name || '')}`);
    }
    if (typeof tool.description !== 'string') {
      throw new Error(`tool.description 必须为字符串: ${String(tool.name || '')}`);
    }
  }

  return tools.map(cloneRuntimeSkillTool);
}

export function validateRegistrySkillManifest(manifest: RegistrySkillManifest): string | null {
  if (!manifest.id.trim()) {
    return '技能 ID 不能为空';
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id.trim())) {
    return '技能 ID 只能使用小写字母、数字和连字符';
  }
  if (!manifest.name.trim()) {
    return '技能名称不能为空';
  }
  if (!manifest.version.trim()) {
    return '版本号不能为空';
  }
  if (!manifest.tools.length) {
    return '至少需要一个工具';
  }

  const seen = new Set<string>();
  for (const tool of manifest.tools) {
    if (!tool.name.trim()) {
      return '工具名称不能为空';
    }
    if (seen.has(tool.name)) {
      return `工具名称重复: ${tool.name}`;
    }
    seen.add(tool.name);
    if (!tool.code.trim()) {
      return `工具代码不能为空: ${tool.name}`;
    }
  }

  return null;
}
