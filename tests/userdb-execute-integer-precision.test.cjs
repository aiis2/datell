const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('path');
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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-exec-int-'));
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

const UNSAFE_POS = '9007199254740993';
const UNSAFE_NEG = '-9007199254740993';

withUserDB('execute SELECT preserves integers beyond JS safe range', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE big (id INTEGER PRIMARY KEY, note TEXT)');
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_POS}, 'pos')`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_NEG}, 'neg')`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (42, 'safe')`);

  const result = userdb.executeUserDBSQL(id, 'SELECT id, note FROM big ORDER BY note');
  assert.deepEqual(result.columns, ['id', 'note']);
  const byNote = Object.fromEntries(result.rows.map((row) => [row[1], row[0]]));
  assert.equal(String(byNote.pos), UNSAFE_POS);
  assert.equal(String(byNote.neg), UNSAFE_NEG);
  assert.equal(byNote.safe, 42);
  assert.equal(typeof byNote.safe, 'number');
  assert.notEqual(String(byNote.pos), '9007199254740992');
});

withUserDB('readOnly query preserves large integers', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE big (id INTEGER PRIMARY KEY)');
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_POS})`);
  const result = userdb.executeUserDBSQL(id, 'SELECT id FROM big', { readOnly: true });
  assert.equal(String(result.rows[0][0]), UNSAFE_POS);
});

withUserDB('WITH SELECT still returns rows with safe integers as numbers', (userdb, id) => {
  const result = userdb.executeUserDBSQL(id, 'WITH x AS (SELECT 7 AS n) SELECT * FROM x');
  assert.deepEqual(result.columns, ['n']);
  assert.equal(result.rows[0][0], 7);
  assert.equal(typeof result.rows[0][0], 'number');
});
