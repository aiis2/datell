const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const userdbPath = path.join(__dirname, '..', 'src', 'main', 'userdb.ts');
const dataDirPath = path.join(__dirname, '..', 'src', 'main', 'dataDir.ts');
const sqlGuardPath = path.join(__dirname, '..', 'src', 'main', 'sqlReadOnlyGuard.ts');

function loadUserDB(tempRoot) {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;

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

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === userdbPath && request === './dataDir') {
      return { getDataDir: () => tempRoot };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  for (const modulePath of [userdbPath, dataDirPath, sqlGuardPath]) {
    delete require.cache[modulePath];
  }
  const userdb = require(userdbPath);

  return {
    userdb,
    restore() {
      for (const modulePath of [userdbPath, dataDirPath, sqlGuardPath]) {
        delete require.cache[modulePath];
      }
      Module._load = originalLoad;
      if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
      else delete require.extensions['.ts'];
    },
  };
}

function withHarness(name, fn) {
  return test(name, async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-upd-'));
    const harness = loadUserDB(tempRoot);
    try {
      await fn(harness.userdb);
    } finally {
      for (const cfg of harness.userdb.listUserDBs()) {
        try { harness.userdb.deleteUserDB(cfg.id); } catch { /* ignore */ }
      }
      harness.restore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}

withHarness('rejects empty or blank updateUserDB names', (userdb) => {
  const id = userdb.createUserDB('KeepMe').id;
  assert.throws(() => userdb.updateUserDB(id, { name: '' }), /empty|blank/i);
  assert.throws(() => userdb.updateUserDB(id, { name: '   ' }), /empty|blank/i);
  assert.equal(userdb.listUserDBs().find((c) => c.id === id)?.name, 'KeepMe');
});

withHarness('rejects case-insensitive rename conflicts with another UserDB', (userdb) => {
  const alpha = userdb.createUserDB('Alpha').id;
  const beta = userdb.createUserDB('Beta').id;
  assert.throws(
    () => userdb.updateUserDB(beta, { name: 'alpha' }),
    /duplicate_name/i,
  );
  assert.equal(userdb.listUserDBs().find((c) => c.id === beta)?.name, 'Beta');
  // Self case change is allowed.
  const renamed = userdb.updateUserDB(alpha, { name: 'ALPHA' });
  assert.equal(renamed.name, 'ALPHA');
});

withHarness('stores trimmed free names and allows description-only patches', (userdb) => {
  const id = userdb.createUserDB('Old').id;
  const renamed = userdb.updateUserDB(id, { name: '  New Name  ' });
  assert.equal(renamed.name, 'New Name');

  const described = userdb.updateUserDB(id, { description: 'notes only' });
  assert.equal(described.name, 'New Name');
  assert.equal(described.description, 'notes only');
});
