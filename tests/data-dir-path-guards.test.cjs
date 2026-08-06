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

const UNAUTHORIZED = /目录未通过选择器授权/;

test('createDirectorySelectGuard authorizes only remembered directories', () => {
  const modulePath = path.join(__dirname, '..', 'src', 'main', 'directorySelectGuard.ts');
  assert.equal(fs.existsSync(modulePath), true, 'directorySelectGuard module must exist');
  const {
    createDirectorySelectGuard,
    assertAuthorizedDirectory,
  } = loadTsModule(modulePath);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-dir-guard-'));
  const picked = path.join(root, 'picked');
  const sibling = path.join(root, 'sibling');
  fs.mkdirSync(picked, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });

  const guard = createDirectorySelectGuard();

  assert.equal(guard.canUseDirectory(picked), false);
  assert.throws(() => assertAuthorizedDirectory(guard, picked), UNAUTHORIZED);
  assert.throws(() => assertAuthorizedDirectory(guard, ''), UNAUTHORIZED);
  assert.throws(() => assertAuthorizedDirectory(guard, null), UNAUTHORIZED);

  guard.rememberSelectedDirectory(picked);
  const authorized = assertAuthorizedDirectory(guard, picked);
  assert.equal(path.resolve(authorized), fs.realpathSync.native(path.resolve(picked)));

  assert.equal(guard.canUseDirectory(sibling), false, 'selecting one dir must not authorize siblings');
  assert.throws(() => assertAuthorizedDirectory(guard, sibling), UNAUTHORIZED);

  // Non-directory file must not authorize
  const filePath = path.join(root, 'not-a-dir.txt');
  fs.writeFileSync(filePath, 'x', 'utf8');
  guard.rememberSelectedDirectory(filePath);
  assert.equal(guard.canUseDirectory(filePath), false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('main process data-dir IPC remembers select and authorizes set/migrate', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'main.ts'),
    'utf8',
  );

  assert.match(mainSource, /from ['"]\.\/directorySelectGuard['"]/);
  assert.match(mainSource, /createDirectorySelectGuard|assertAuthorizedDirectory/);

  assert.match(
    mainSource,
    /fs:selectDirectory[\s\S]*rememberSelectedDirectory/,
    'selectDirectory must remember the picked directory',
  );
  assert.match(
    mainSource,
    /fs:migrateDataDir[\s\S]*assertAuthorizedDirectory/,
    'migrate must authorize destination before copy',
  );
  assert.match(
    mainSource,
    /fs:setDataDir[\s\S]*assertAuthorizedDirectory/,
    'setDataDir must authorize path before persisting',
  );
});
