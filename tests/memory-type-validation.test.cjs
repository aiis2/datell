'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const modulePath = path.join(__dirname, '..', 'src', 'main', 'memoryPaths.ts');

function loadMemoryPaths() {
  // Prefer the dedicated module once it exists; fall back to main.ts-local behavior for RED.
  if (fs.existsSync(modulePath)) {
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
    const exported = require(modulePath);
    require.extensions['.ts'] = originalTsLoader;
    if (!originalTsLoader) delete require.extensions['.ts'];
    return exported;
  }

  // Pre-fix baseline: current main.ts join without allowlist (RED must fail on escape).
  return {
    MEMORY_TYPES: ['long_term', 'short_term'],
    resolveMemoryFilePath(memoryDir, type) {
      return path.join(memoryDir, `${type}.md`);
    },
  };
}

test('resolveMemoryFilePath allows only long_term and short_term under memory dir', () => {
  const { resolveMemoryFilePath } = loadMemoryPaths();
  const memoryDir = path.join(path.sep === '\\' ? 'C:\\app' : '/app', 'data', 'memory');

  const longPath = resolveMemoryFilePath(memoryDir, 'long_term');
  const shortPath = resolveMemoryFilePath(memoryDir, 'short_term');
  assert.equal(longPath, path.join(memoryDir, 'long_term.md'));
  assert.equal(shortPath, path.join(memoryDir, 'short_term.md'));

  const relLong = path.relative(path.resolve(memoryDir), path.resolve(longPath));
  assert.ok(!relLong.startsWith('..') && !path.isAbsolute(relLong));

  for (const bad of ['../escape', '..\\escape', '../../outside', 'foo/bar', '', ' session ', 1, null]) {
    assert.throws(
      () => resolveMemoryFilePath(memoryDir, bad),
      /memory type must be long_term or short_term/i,
      `expected rejection for ${JSON.stringify(bad)}`,
    );
  }
});

test('main process memory handlers use resolveMemoryFilePath', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'main.ts'),
    'utf8',
  );
  assert.match(mainSource, /from ['"]\.\/memoryPaths['"]/);
  assert.match(mainSource, /resolveMemoryFilePath/);
  assert.doesNotMatch(
    mainSource,
    /function getMemoryFilePath\([\s\S]*?path\.join\(getMemoryDir\(\),\s*`\$\{type\}\.md`\)/,
  );
});
