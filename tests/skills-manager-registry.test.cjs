require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createSkillsManager,
  listLegacyDirectorySkills,
} = require('../src/main/skillsManager.ts');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-registry-'));
const dataDir = path.join(tmpRoot, 'datellData');
const skillsDir = path.join(dataDir, 'skills');
const registryUserDir = path.join(skillsDir, 'registry', 'user');

fs.mkdirSync(registryUserDir, { recursive: true });

fs.writeFileSync(
  path.join(skillsDir, 'legacy-sales.json'),
  JSON.stringify(
    {
      name: 'Legacy Sales Skill',
      description: 'legacy directory skill',
      version: '1.2.0',
      tools: [
        {
          name: 'shared_tool',
          description: 'legacy shared tool',
          parameters: {},
          code: 'return "legacy";',
        },
      ],
    },
    null,
    2,
  ),
  'utf8',
);

fs.writeFileSync(path.join(skillsDir, 'broken.json'), '{bad json', 'utf8');

fs.writeFileSync(
  path.join(registryUserDir, 'registry-runtime-audit.skill.json'),
  JSON.stringify(
    {
      id: 'registry-runtime-audit',
      name: 'Registry Runtime Audit',
      description: 'registry skill manifest',
      version: '0.1.0',
      tools: [
        {
          name: 'registry_only_tool',
          description: 'registry tool',
          parameters: [],
          code: 'return "registry";',
        },
      ],
    },
    null,
    2,
  ),
  'utf8',
);

const legacySkills = listLegacyDirectorySkills(dataDir);

assert.equal(legacySkills.length, 1, 'legacy loader should only keep valid root-level directory skills');
assert.equal(legacySkills[0].name, 'Legacy Sales Skill');
assert.equal(legacySkills[0].source, 'legacy-sales.json');

const manager = createSkillsManager(dataDir);
const registrySkills = manager.listRegistrySkills();

assert.equal(registrySkills.length, 1, 'registry loader should discover only registry manifests');
assert.equal(registrySkills[0].id, 'registry-runtime-audit');
assert.equal(registrySkills[0].tools[0].name, 'registry_only_tool');

manager.saveRegistrySkill({
  id: 'phase-one-skill',
  name: 'Phase One Skill',
  description: 'saved by registry manager',
  version: '1.0.0',
  tools: [
    {
      name: 'phase_one_tool',
      description: 'phase one registry tool',
      parameters: [],
      code: 'return "phase-one";',
    },
  ],
});

const savedPath = path.join(registryUserDir, 'phase-one-skill.skill.json');
assert.equal(fs.existsSync(savedPath), true, 'saveRegistrySkill should persist manifests under registry/user');

const exportPath = path.join(tmpRoot, 'phase-one-skill.export.json');
manager.exportRegistrySkill('phase-one-skill', exportPath);
assert.equal(fs.existsSync(exportPath), true, 'exportRegistrySkill should write the manifest to the requested path');

manager.deleteRegistrySkill('phase-one-skill');
assert.equal(fs.existsSync(savedPath), false, 'deleteRegistrySkill should remove persisted manifests');

manager.importRegistrySkill(exportPath);

const importedSkills = manager.listRegistrySkills();
assert.equal(
  importedSkills.some((skill) => skill.id === 'phase-one-skill'),
  true,
  'importRegistrySkill should restore exported manifests into registry storage',
);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log('skills manager registry ok');