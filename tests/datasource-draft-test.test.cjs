const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const datasourcePath = path.join(root, 'src', 'main', 'datasource.ts');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('tests current datasource drafts without mutating persisted config', async () => {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-datasource-draft-test-'));
  const connectionAttempts = [];
  let failNextConnection = false;

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

  const mysql2 = {
    createConnection: async (options) => {
      connectionAttempts.push({ ...options });
      if (failNextConnection) {
        failNextConnection = false;
        throw new Error('draft connection failed');
      }
      return {
        query: async () => [[], []],
        end: async () => {},
      };
    },
  };

  const mocks = {
    './dataDir': { getDataDir: () => tempDir },
    './userdb': {
      listUserDBs: () => [],
      getUserDBSchema: () => ({ tables: [] }),
      executeUserDBSQL: () => ({ columns: [], rows: [], rowCount: 0, executionMs: 0 }),
      getUserDBTableData: () => ({ columns: [], rows: [], rowCount: 0 }),
    },
    './sqlReadOnlyGuard': { isReadOnlyDatasourceSql: () => true },
    'mysql2/promise': mysql2,
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === datasourcePath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[datasourcePath];
    const datasource = require(datasourcePath);
    assert.equal(typeof datasource.testDatasourceConfig, 'function');

    datasource.saveDatasource({
      id: 'stored-ds',
      name: 'Stored',
      type: 'mysql',
      host: 'stored-host',
      port: 3306,
      database: 'stored_db',
      username: 'stored_user',
      password: 'stored-secret',
      options: {},
      createdAt: '',
      updatedAt: '',
    });

    const masked = datasource.getMaskedDatasources()[0];
    assert.equal(masked.password, datasource.MASKED_PW);
    const editedDraft = {
      ...masked,
      host: 'draft-host',
      port: 4406,
      database: 'draft_db',
      username: 'draft_user',
    };

    assert.deepEqual(await datasource.testDatasourceConfig(editedDraft), {
      ok: true,
      message: '连接成功',
    });
    assert.deepEqual(
      {
        host: connectionAttempts[0].host,
        port: connectionAttempts[0].port,
        database: connectionAttempts[0].database,
        user: connectionAttempts[0].user,
        password: connectionAttempts[0].password,
      },
      {
        host: 'draft-host',
        port: 4406,
        database: 'draft_db',
        user: 'draft_user',
        password: 'stored-secret',
      },
    );

    const newDraft = {
      ...editedDraft,
      id: 'new-ds',
      name: 'Unsaved',
      host: 'new-host',
      password: 'new-secret',
    };
    assert.equal((await datasource.testDatasourceConfig(newDraft)).ok, true);
    assert.equal(connectionAttempts[1].host, 'new-host');
    assert.equal(connectionAttempts[1].password, 'new-secret');

    failNextConnection = true;
    const failed = await datasource.testDatasourceConfig({ ...editedDraft, host: 'bad-host' });
    assert.equal(failed.ok, false);
    assert.match(failed.message, /draft connection failed/);

    const persisted = datasource.getAllDatasources();
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].host, 'stored-host');
    assert.equal(persisted[0].password, 'stored-secret');
  } finally {
    delete require.cache[datasourcePath];
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('wires the current form buffer through non-persistent datasource test IPC', () => {
  const main = read('src/main/main.ts');
  const preload = read('src/main/preload.ts');
  const rendererTypes = read('src/renderer/types/index.ts');
  const store = read('src/renderer/stores/datasourceStore.ts');
  const settings = read('src/renderer/components/SettingsModal.tsx');

  assert.match(main, /testDatasourceConfig/);
  assert.match(main, /ipcMain\.handle\(['"]datasource:testConfig['"]/);
  assert.match(preload, /datasourceTestConfig/);
  assert.match(preload, /ipcRenderer\.invoke\(['"]datasource:testConfig['"],\s*config\)/);
  assert.match(rendererTypes, /datasourceTestConfig/);
  assert.match(store, /testDatasourceConfig:\s*\(config\)/);
  assert.match(store, /api\(\)\.datasourceTestConfig\(config\)/);

  const handlerStart = settings.indexOf('const handleTest = async () =>');
  const handlerEnd = settings.indexOf('const onTypeChange', handlerStart);
  assert.notEqual(handlerStart, -1, 'handleTest was not found');
  assert.notEqual(handlerEnd, -1, 'handleTest end marker was not found');
  const handleTest = settings.slice(handlerStart, handlerEnd);

  assert.match(handleTest, /testDatasourceConfig\(buf\)/);
  assert.doesNotMatch(handleTest, /\bsaveDatasource\s*\(/);
  assert.doesNotMatch(handleTest, /\bloadDatasources\s*\(/);
  assert.doesNotMatch(handleTest, /\bsetIsNew\s*\(/);
  assert.doesNotMatch(handleTest, /\bsetSelected\s*\(/);
  assert.doesNotMatch(handleTest, /\bsetViewMode\s*\(/);
  assert.doesNotMatch(handleTest, /\btestDatasource\s*\(/);
});
