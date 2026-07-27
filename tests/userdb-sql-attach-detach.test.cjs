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

function withUserDB(name, fn) {
  return test(name, async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-attach-'));
    const harness = loadUserDB(tempRoot);
    let id;
    try {
      id = harness.userdb.createUserDB(name).id;
      await fn(harness.userdb, id, tempRoot);
    } finally {
      if (id) harness.userdb.deleteUserDB(id);
      harness.restore();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
}

const REFUSE_RE = /attach|detach|not permitted/i;

withUserDB('executeUserDBSQL refuses ATTACH and DETACH', (userdb, id) => {
  assert.throws(
    () => userdb.executeUserDBSQL(id, "ATTACH DATABASE 'x.db' AS evil"),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, "ATTACH 'x.db' AS evil"),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DETACH DATABASE evil'),
    REFUSE_RE,
  );
  assert.throws(
    () => userdb.executeUserDBSQL(id, 'DETACH evil'),
    REFUSE_RE,
  );

  // Refusal must happen before SQLite opens a path — no need for a real file.
  assert.throws(
    () => userdb.executeUserDBSQL(id, "ATTACH DATABASE 'C:/definitely-missing-attach.db' AS evil"),
    (err) => REFUSE_RE.test(String(err)) && !/no such file|unable to open/i.test(String(err)),
  );
});

withUserDB('executeUserDBSQL still allows ordinary main-db statements', (userdb, id) => {
  const result = userdb.executeUserDBSQL(id, 'SELECT 1 AS n');
  assert.equal(result.rows[0][0], 1);

  userdb.executeUserDBSQL(id, 'CREATE TABLE t (x INTEGER)');
  userdb.executeUserDBSQL(id, 'INSERT INTO t (x) VALUES (2)');
  const rows = userdb.executeUserDBSQL(id, 'SELECT x FROM t');
  assert.equal(rows.rows[0][0], 2);
});
