export interface RuntimeSkillTool {
  name: string;
  description: string;
  parameters: unknown;
  code: string;
}

export interface ExternalSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  tools: RuntimeSkillTool[];
}

export interface RegistrySkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  source?: string;
  tools: RuntimeSkillTool[];
}