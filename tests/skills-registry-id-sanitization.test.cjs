'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTsModule(modulePath) {
  const originalTsLoader = require.extensions['.ts'];
  require.extensions['.ts'] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    mod._compile(output, filename);
  };
  delete require.cache[modulePath];
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}main${path.sep}`) && key.endsWith('.ts')) {
      delete require.cache[key];
    }
  }
  const exported = require(modulePath);
  require.extensions['.ts'] = originalTsLoader;
  if (!originalTsLoader) delete require.extensions['.ts'];
  return exported;
}

const INVALID_ID = /registry skill id is invalid/i;

const baseTools = [
  {
    name: 'safe_tool',
    description: 'fixture',
    parameters: [],
    code: 'return "ok";',
  },
];

function makeManifest(id) {
  return {
    id,
    name: 'Safe Skill',
    description: 'id sanitization fixture',
    version: '1.0.0',
    tools: baseTools,
  };
}

test('assertSafeRegistrySkillId allows only safe basenames', () => {
  const modulePath = path.join(__dirname, '..', 'src', 'main', 'skillsManager.ts');
  const mod = loadTsModule(modulePath);
  assert.equal(typeof mod.assertSafeRegistrySkillId, 'function', 'must export assertSafeRegistrySkillId');

  assert.equal(mod.assertSafeRegistrySkillId('phase-one-skill'), 'phase-one-skill');
  assert.equal(mod.assertSafeRegistrySkillId('  ok_id.v2  '), 'ok_id.v2');

  for (const bad of [
    '../escape-skill',
    '..\\escape-skill',
    'a/b',
    'a\\b',
    '',
    '   ',
    '.',
    '..',
    'C:evil',
    'has space',
    'id;rm',
    null,
    1,
    undefined,
  ]) {
    assert.throws(
      () => mod.assertSafeRegistrySkillId(bad),
      INVALID_ID,
      `expected rejection for ${JSON.stringify(bad)}`,
    );
  }
});

test('saveRegistrySkill refuses path-escaping ids and keeps files under registry/user', () => {
  const { createSkillsManager } = loadTsModule(
    path.join(__dirname, '..', 'src', 'main', 'skillsManager.ts'),
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-registry-id-'));
  const dataDir = path.join(root, 'data');
  const registryUserDir = path.join(dataDir, 'skills', 'registry', 'user');
  fs.mkdirSync(registryUserDir, { recursive: true });

  const manager = createSkillsManager(dataDir);
  const outsidePath = path.join(dataDir, 'skills', 'registry', 'escape-skill.skill.json');

  assert.throws(
    () => manager.saveRegistrySkill(makeManifest('../escape-skill')),
    INVALID_ID,
  );
  assert.equal(fs.existsSync(outsidePath), false, 'must not write outside registry/user');

  assert.throws(
    () => manager.saveRegistrySkill(makeManifest('nested/path')),
    INVALID_ID,
  );

  const saved = manager.saveRegistrySkill(makeManifest('phase-one-skill'));
  assert.equal(saved.id, 'phase-one-skill');
  assert.equal(
    fs.existsSync(path.join(registryUserDir, 'phase-one-skill.skill.json')),
    true,
    'valid id must persist under registry/user',
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('deleteRegistrySkill and exportRegistrySkill refuse unsafe ids', () => {
  const { createSkillsManager } = loadTsModule(
    path.join(__dirname, '..', 'src', 'main', 'skillsManager.ts'),
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-registry-id-ops-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(dataDir, 'skills', 'registry', 'user'), { recursive: true });
  const manager = createSkillsManager(dataDir);

  manager.saveRegistrySkill(makeManifest('keep-me'));

  assert.throws(() => manager.deleteRegistrySkill('../keep-me'), INVALID_ID);
  assert.throws(() => manager.exportRegistrySkill('../keep-me', path.join(root, 'out.json')), INVALID_ID);
  assert.throws(() => manager.deleteRegistrySkill('a/b'), INVALID_ID);

  // Legitimate delete still works.
  manager.deleteRegistrySkill('keep-me');
  assert.equal(
    fs.existsSync(path.join(dataDir, 'skills', 'registry', 'user', 'keep-me.skill.json')),
    false,
  );

  fs.rmSync(root, { recursive: true, force: true });
});
