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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-userdb-export-int-'));
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

const UNSAFE_POS = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
const UNSAFE_NEG = '-9007199254740993';
const SAFE = '42';

withUserDB('JSON export preserves integers beyond JS safe range as digit strings', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE big (id INTEGER PRIMARY KEY, note TEXT)');
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_POS}, 'pos')`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_NEG}, 'neg')`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${SAFE}, 'safe')`);

  const parsed = JSON.parse(userdb.exportTableData(id, 'big', 'json'));
  assert.equal(parsed.length, 3);

  const byNote = Object.fromEntries(parsed.map((row) => [row.note, row.id]));
  // Must not be the rounded IEEE double (9007199254740992).
  assert.equal(String(byNote.pos), UNSAFE_POS);
  assert.equal(String(byNote.neg), UNSAFE_NEG);
  assert.equal(byNote.safe, 42);
  assert.equal(typeof byNote.safe, 'number');
  // Unsafe values must not appear as rounded JS numbers in the raw JSON text either.
  const raw = userdb.exportTableData(id, 'big', 'json');
  assert.ok(raw.includes(UNSAFE_POS), 'raw JSON must contain full positive digits');
  assert.ok(raw.includes(UNSAFE_NEG), 'raw JSON must contain full negative digits');
  assert.ok(!raw.includes('9007199254740992'), 'raw JSON must not contain rounded double');
});

withUserDB('CSV export preserves integers beyond JS safe range as digit strings', (userdb, id) => {
  userdb.createTable(id, 'CREATE TABLE big (id INTEGER PRIMARY KEY)');
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_POS})`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${UNSAFE_NEG})`);
  userdb.executeUserDBSQL(id, `INSERT INTO big VALUES (${SAFE})`);

  const csv = userdb.exportTableData(id, 'big', 'csv');
  const lines = csv.split('\n');
  assert.equal(lines[0], 'id');
  assert.ok(lines.includes(UNSAFE_POS));
  assert.ok(lines.includes(UNSAFE_NEG));
  assert.ok(lines.includes(SAFE));
  assert.ok(!csv.includes('9007199254740992'));
});
