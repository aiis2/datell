import fs from 'fs';
import path from 'path';

export interface InstallSkillFromUrlResult {
  ok: boolean;
  name?: string;
  toolCount?: number;
  error?: string;
}

export interface InstallSkillFromUrlOptions {
  dataDir: string;
  fetchContent: (fetchUrl: string, accept?: string) => Promise<string | null>;
}

function saveInstalledSkill(
  dataDir: string,
  parsed: Record<string, unknown>,
): InstallSkillFromUrlResult {
  if (!parsed.name || typeof parsed.name !== 'string') {
    return { ok: false, error: '技能文件缺少 name 字段' };
  }
  if (!Array.isArray(parsed.tools) || parsed.tools.length === 0) {
    return { ok: false, error: '技能文件缺少 tools 数组或为空' };
  }

  const safeName = String(parsed.name)
    .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
    .slice(0, 80);
  const skillsDir = path.join(dataDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(skillsDir, `${safeName}.json`),
    JSON.stringify(parsed, null, 2),
    'utf-8',
  );

  return {
    ok: true,
    name: parsed.name as string,
    toolCount: (parsed.tools as unknown[]).length,
  };
}

export async function installSkillFromUrl(
  url: string,
  options: InstallSkillFromUrlOptions,
): Promise<InstallSkillFromUrlResult> {
  try {
    const { dataDir, fetchContent } = options;

    const ghRepoMatch = /^https?:\/\/github\.com\/([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+?)(?:\.git)?(?:#([A-Za-z0-9_.\-]+))?$/.exec(url.trim());
    if (ghRepoMatch) {
      const owner = ghRepoMatch[1];
      const repo = ghRepoMatch[2];
      const skillNameHint = ghRepoMatch[3] || null;
      const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/main`;

      const marketplaceRaw = await fetchContent(`${rawBase}/.claude-plugin/marketplace.json`, 'application/json, text/plain');
      if (marketplaceRaw) {
        let marketplace: Record<string, unknown>;
        try {
          marketplace = JSON.parse(marketplaceRaw);
        } catch {
          return { ok: false, error: '解析 marketplace.json 失败' };
        }

        type PluginEntry = { name: string; description?: string; skills?: string[] };
        const plugins = (marketplace.plugins as PluginEntry[]) || [];
        if (plugins.length === 0) {
          return { ok: false, error: '仓库中未找到技能定义 (plugins 数组为空)' };
        }

        const targetPlugin = skillNameHint
          ? plugins.find((plugin) => plugin.name === skillNameHint)
          : plugins[0];
        if (!targetPlugin) {
          return {
            ok: false,
            error: `未找到技能 "${skillNameHint}"，可用技能: ${plugins.map((plugin) => plugin.name).join(', ')}`,
          };
        }

        const rawSkillDir = (targetPlugin.skills?.[0] || `./skills/${targetPlugin.name}`).replace(/^\.\//, '');
        if (rawSkillDir.includes('..') || rawSkillDir.startsWith('/')) {
          return { ok: false, error: '无效的技能路径（检测到路径遍历）' };
        }

        const skillMdContent = await fetchContent(`${rawBase}/${rawSkillDir}/SKILL.md`, 'text/plain, */*');
        if (!skillMdContent) {
          return { ok: false, error: `无法获取 ${rawSkillDir}/SKILL.md 内容` };
        }

        const instructionsToolName = `${targetPlugin.name.replace(/[^a-zA-Z0-9_]/g, '_')}_instructions`;
        const instrCode = `// ${targetPlugin.name} instructions from ${owner}/${repo}\nreturn ${JSON.stringify(skillMdContent)};`;
        const skillJson: Record<string, unknown> = {
          name: targetPlugin.name,
          description: targetPlugin.description || `${targetPlugin.name} 技能 (来自 ${owner}/${repo})`,
          version: String((marketplace as Record<string, unknown>).version || '1.0.0'),
          source: url,
          tools: [
            {
              name: instructionsToolName,
              description: `获取 ${targetPlugin.name} 技能的操作指南和能力说明`,
              parameters: { type: 'object', properties: {} },
              code: instrCode,
            },
          ],
        };
        return saveInstalledSkill(dataDir, skillJson);
      }

      const directJson = await fetchContent(`${rawBase}/skill.json`, 'application/json');
      if (directJson) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(directJson);
        } catch {
          return { ok: false, error: 'skill.json 不是有效 JSON' };
        }
        return saveInstalledSkill(dataDir, parsed);
      }

      return {
        ok: false,
        error: `仓库 ${owner}/${repo} 中未找到兼容的技能配置。可在 URL 后加 #技能名 指定特定技能（如 ${url}#agent-browser）`,
      };
    }

    let fetchUrl = url.trim();
    if (/github\.com\/.+\/blob\//.test(fetchUrl)) {
      fetchUrl = fetchUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    const raw = await fetchContent(fetchUrl);
    if (!raw) {
      return { ok: false, error: 'URL 无法访问或返回空内容' };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'URL 内容不是有效 JSON。如需安装 GitHub 仓库中的技能，请直接提供仓库根目录 URL（如 https://github.com/owner/repo）' };
    }

    return saveInstalledSkill(dataDir, parsed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}