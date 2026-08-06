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
  // Also clear dependent modules that may have been cached under .ts paths.
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

const UNAUTHORIZED = /文件未通过选择器授权，无法读取/;

const validManifest = {
  id: 'guarded-skill',
  name: 'Guarded Skill',
  description: 'import path guard fixture',
  version: '1.0.0',
  tools: [
    {
      name: 'guarded_tool',
      description: 'fixture tool',
      parameters: [],
      code: 'return "ok";',
    },
  ],
};

test('assertAuthorizedTextFileRead refuses unselected outside paths', () => {
  const guardPath = path.join(__dirname, '..', 'src', 'main', 'fileReadGuard.ts');
  const { createTextFileReadGuard, assertAuthorizedTextFileRead } = loadTsModule(guardPath);
  assert.equal(typeof assertAuthorizedTextFileRead, 'function', 'shipped fileReadGuard must export assertAuthorizedTextFileRead');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-registry-path-guards-'));
  const dataDir = path.join(root, 'data');
  const outsideDir = path.join(root, 'outside');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  const outsideFile = path.join(outsideDir, 'secret.skill.json');
  const dataFile = path.join(dataDir, 'inside.skill.json');
  fs.writeFileSync(outsideFile, JSON.stringify(validManifest, null, 2), 'utf8');
  fs.writeFileSync(dataFile, JSON.stringify({ ...validManifest, id: 'inside-skill' }, null, 2), 'utf8');

  const guard = createTextFileReadGuard(dataDir);

  assert.throws(
    () => assertAuthorizedTextFileRead(guard, outsideFile),
    UNAUTHORIZED,
    'outside file must not be readable before explicit selection',
  );
  assert.throws(
    () => assertAuthorizedTextFileRead(guard, ''),
    UNAUTHORIZED,
  );
  assert.throws(
    () => assertAuthorizedTextFileRead(guard, null),
    UNAUTHORIZED,
  );

  const authorizedInside = assertAuthorizedTextFileRead(guard, dataFile);
  assert.equal(path.resolve(authorizedInside), path.resolve(dataFile));

  guard.rememberSelectedFile(outsideFile);
  const authorizedOutside = assertAuthorizedTextFileRead(guard, outsideFile);
  assert.equal(path.resolve(authorizedOutside), fs.realpathSync.native(path.resolve(outsideFile)));

  fs.rmSync(root, { recursive: true, force: true });
});

test('skills registry import product path requires text file authorization', () => {
  const guardPath = path.join(__dirname, '..', 'src', 'main', 'fileReadGuard.ts');
  const managerPath = path.join(__dirname, '..', 'src', 'main', 'skillsManager.ts');
  const { createTextFileReadGuard, assertAuthorizedTextFileRead } = loadTsModule(guardPath);
  const { createSkillsManager } = loadTsModule(managerPath);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-registry-import-guard-'));
  const dataDir = path.join(root, 'data');
  const outsideDir = path.join(root, 'outside');
  fs.mkdirSync(path.join(dataDir, 'skills', 'registry', 'user'), { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  const outsideFile = path.join(outsideDir, 'leaked.skill.json');
  fs.writeFileSync(outsideFile, JSON.stringify(validManifest, null, 2), 'utf8');

  const guard = createTextFileReadGuard(dataDir);
  const manager = createSkillsManager(dataDir);

  // Product import path: authorize first, then manager import (mirrors main IPC).
  assert.throws(
    () => {
      const authorized = assertAuthorizedTextFileRead(guard, outsideFile);
      manager.importRegistrySkill(authorized);
    },
    UNAUTHORIZED,
    'import must refuse outside paths without fs:selectFile authorization',
  );
  assert.equal(
    manager.listRegistrySkills().some((s) => s.id === 'guarded-skill'),
    false,
    'unauthorized import must not pollute the registry',
  );

  guard.rememberSelectedFile(outsideFile);
  const authorized = assertAuthorizedTextFileRead(guard, outsideFile);
  const imported = manager.importRegistrySkill(authorized);
  assert.equal(imported.id, 'guarded-skill');
  assert.equal(
    manager.listRegistrySkills().some((s) => s.id === 'guarded-skill'),
    true,
    'selected file import must succeed',
  );

  fs.rmSync(root, { recursive: true, force: true });
});

test('main process skills registry IPC enforces import guard and dialog export', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'main.ts'),
    'utf8',
  );
  const preloadSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'preload.ts'),
    'utf8',
  );

  assert.match(mainSource, /assertAuthorizedTextFileRead/);
  assert.match(
    mainSource,
    /skills:registry:import[\s\S]*assertAuthorizedTextFileRead/,
    'import IPC must authorize path before importRegistrySkill',
  );

  // Export must open a save dialog in main and must not take targetPath from the renderer.
  assert.match(mainSource, /skills:registry:export[\s\S]*showSaveDialog/);
  assert.doesNotMatch(
    mainSource,
    /ipcMain\.handle\('skills:registry:export',\s*\([^)]*targetPath/,
    'export IPC must not accept renderer-supplied targetPath',
  );

  assert.doesNotMatch(
    preloadSource,
    /skillsRegistryExport:\s*\(id:\s*string,\s*targetPath/,
    'preload must not expose path-parameter export',
  );
  assert.match(
    preloadSource,
    /skillsRegistryExport:\s*\(id:\s*string\)/,
  );
});
