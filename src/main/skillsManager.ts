import fs from 'fs';
import path from 'path';
import type { ExternalSkill, RegistrySkillManifest, RuntimeSkillTool } from '../shared/skills';

function getLegacySkillsDir(dataDir: string): string {
  return path.join(dataDir, 'skills');
}

function getRegistryUserDir(dataDir: string): string {
  return path.join(getLegacySkillsDir(dataDir), 'registry', 'user');
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isRuntimeSkillTool(value: unknown): value is RuntimeSkillTool {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as RuntimeSkillTool).name === 'string' &&
    typeof (value as RuntimeSkillTool).code === 'string'
  );
}

function isRegistrySkillManifest(value: unknown): value is RegistrySkillManifest {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as RegistrySkillManifest).id === 'string' &&
    typeof (value as RegistrySkillManifest).name === 'string' &&
    Array.isArray((value as RegistrySkillManifest).tools) &&
    (value as RegistrySkillManifest).tools.every(isRuntimeSkillTool)
  );
}

function buildExternalSkillFromParsed(file: string, parsed: Record<string, unknown>): ExternalSkill | null {
  if (
    typeof parsed.name !== 'string' ||
    !Array.isArray(parsed.tools) ||
    !parsed.tools.every(isRuntimeSkillTool)
  ) {
    return null;
  }

  return {
    id: `ext-${file.replace('.json', '')}`,
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
    source: file,
    tools: parsed.tools,
  };
}

function registryFileName(id: string): string {
  return `${id}.skill.json`;
}

function sanitizeRegistryManifest(manifest: RegistrySkillManifest): RegistrySkillManifest {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || '',
    version: manifest.version || '1.0.0',
    tools: manifest.tools,
  };
}

export function listLegacyDirectorySkills(dataDir: string): ExternalSkill[] {
  const skillsDir = getLegacySkillsDir(dataDir);
  if (!fs.existsSync(skillsDir)) {
    ensureDirectory(skillsDir);
    return [];
  }

  const results: ExternalSkill[] = [];

  try {
    const files = fs.readdirSync(skillsDir).filter((entry) => entry.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const skill = buildExternalSkillFromParsed(file, parsed);
        if (skill) {
          results.push(skill);
        }
      } catch {
        // Keep legacy behavior: malformed files are ignored.
      }
    }
  } catch {
    return [];
  }

  return results;
}

export function createSkillsManager(dataDir: string) {
  const registryUserDir = getRegistryUserDir(dataDir);

  function listRegistrySkills(): RegistrySkillManifest[] {
    if (!fs.existsSync(registryUserDir)) {
      ensureDirectory(registryUserDir);
      return [];
    }

    const results: RegistrySkillManifest[] = [];
    for (const file of fs.readdirSync(registryUserDir).filter((entry) => entry.endsWith('.skill.json'))) {
      try {
        const raw = fs.readFileSync(path.join(registryUserDir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        if (isRegistrySkillManifest(parsed)) {
          results.push({
            ...sanitizeRegistryManifest(parsed),
            source: `registry/user/${file}`,
          });
        }
      } catch {
        // Ignore malformed manifests so one bad file does not block the registry.
      }
    }

    return results;
  }

  function saveRegistrySkill(manifest: RegistrySkillManifest): RegistrySkillManifest {
    if (!isRegistrySkillManifest(manifest)) {
      throw new Error('Invalid registry skill manifest');
    }

    ensureDirectory(registryUserDir);
    const normalized = sanitizeRegistryManifest(manifest);
    fs.writeFileSync(
      path.join(registryUserDir, registryFileName(normalized.id)),
      JSON.stringify(normalized, null, 2),
      'utf-8',
    );
    return normalized;
  }

  function deleteRegistrySkill(id: string): void {
    ensureDirectory(registryUserDir);
    fs.rmSync(path.join(registryUserDir, registryFileName(id)), { force: true });
  }

  function exportRegistrySkill(id: string, targetPath: string): string {
    const sourcePath = path.join(registryUserDir, registryFileName(id));
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Registry skill not found: ${id}`);
    }
    ensureDirectory(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
  }

  function importRegistrySkill(sourcePath: string): RegistrySkillManifest {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isRegistrySkillManifest(parsed)) {
      throw new Error('Invalid registry skill manifest');
    }
    return saveRegistrySkill(parsed);
  }

  return {
    listRegistrySkills,
    saveRegistrySkill,
    deleteRegistrySkill,
    exportRegistrySkill,
    importRegistrySkill,
  };
}