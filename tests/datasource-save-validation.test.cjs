const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const datasourcePath = path.join(root, 'src', 'main', 'datasource.ts');

function loadDatasource(tempRoot) {
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

  const mocks = {
    './dataDir': { getDataDir: () => tempRoot },
    './userdb': {
      listUserDBs: () => [],
      getUserDBSchema: () => ({ tables: [] }),
      executeUserDBSQL: () => ({ columns: [], rows: [], rowCount: 0, executionMs: 0 }),
      getUserDBTableData: () => ({ columns: [], rows: [], rowCount: 0 }),
    },
    './sqlReadOnlyGuard': { isReadOnlyDatasourceSql: () => true },
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === datasourcePath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[datasourcePath];
  const datasource = require(datasourcePath);

  return {
    datasource,
    restore() {
      delete require.cache[datasourcePath];
      Module._load = originalLoad;
      if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
      else delete require.extensions['.ts'];
    },
  };
}

function baseConfig(overrides = {}) {
  return {
    id: 'ds-1',
    name: 'Orders',
    type: 'mysql',
    host: 'db.example.com',
    port: 3306,
    database: 'analytics',
    username: 'reader',
    password: 'secret',
    options: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

test('saveDatasource refuses blank identity fields and invalid ports', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-ds-save-'));
  const harness = loadDatasource(tempRoot);
  try {
    const { datasource } = harness;

    assert.throws(
      () => datasource.saveDatasource(baseConfig({ name: '   ' })),
      /name cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ host: '' })),
      /host cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ database: '\t' })),
      /database cannot be empty or blank/i,
    );

    for (const port of [-1, 0, 1.5, 65536, Number.NaN]) {
      assert.throws(
        () => datasource.saveDatasource(baseConfig({ port })),
        /port must be an integer between 1 and 65535/i,
      );
    }

    // Nothing invalid was persisted.
    assert.deepEqual(datasource.getAllDatasources(), []);
  } finally {
    harness.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('saveDatasource refuses blank id and unsupported type', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-ds-id-type-'));
  const harness = loadDatasource(tempRoot);
  try {
    const { datasource } = harness;

    assert.throws(
      () => datasource.saveDatasource(baseConfig({ id: '' })),
      /id cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ id: '   ' })),
      /id cannot be empty or blank/i,
    );
    // Empty ids must not collapse into a single overwritten row.
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ id: '', name: 'first' })),
      /id cannot be empty or blank/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ id: '', name: 'second' })),
      /id cannot be empty or blank/i,
    );

    assert.throws(
      () => datasource.saveDatasource(baseConfig({ type: '' })),
      /type must be one of/i,
    );
    assert.throws(
      () => datasource.saveDatasource(baseConfig({ type: 'sqlite' })),
      /type must be one of/i,
    );

    assert.deepEqual(datasource.getAllDatasources(), []);
  } finally {
    harness.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('saveDatasource trims identity fields and preserves masked passwords', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-ds-save-ok-'));
  const harness = loadDatasource(tempRoot);
  try {
    const { datasource } = harness;

    const saved = datasource.saveDatasource(baseConfig({
      id: '  ds-1  ',
      name: '  Orders  ',
      host: '  db.example.com ',
      database: ' analytics ',
      username: ' reader ',
      password: 'secret',
    }));

    assert.equal(saved.name, 'Orders');
    assert.equal(saved.id, 'ds-1');
    assert.equal(saved.password, datasource.MASKED_PW);

    const stored = datasource.getAllDatasources()[0];
    assert.equal(stored.id, 'ds-1');
    assert.equal(stored.name, 'Orders');
    assert.equal(stored.host, 'db.example.com');
    assert.equal(stored.database, 'analytics');
    assert.equal(stored.username, 'reader');
    assert.equal(stored.password, 'secret');
    assert.equal(stored.port, 3306);
    assert.equal(stored.type, 'mysql');

    for (const type of ['mysql', 'doris', 'postgresql', 'presto']) {
      const row = datasource.saveDatasource(baseConfig({
        id: `ds-${type}`,
        name: type,
        type,
      }));
      assert.equal(row.type, type);
      assert.equal(
        datasource.getAllDatasources().find((c) => c.id === `ds-${type}`)?.type,
        type,
      );
    }

    const updated = datasource.saveDatasource({
      ...stored,
      password: datasource.MASKED_PW,
      host: 'db2.example.com',
    });
    assert.equal(updated.host, 'db2.example.com');
    assert.equal(updated.password, datasource.MASKED_PW);
    assert.equal(datasource.getAllDatasources().find((c) => c.id === 'ds-1')?.password, 'secret');
    assert.equal(datasource.getAllDatasources().find((c) => c.id === 'ds-1')?.host, 'db2.example.com');
  } finally {
    harness.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
