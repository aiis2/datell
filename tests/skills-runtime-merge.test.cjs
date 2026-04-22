require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');
const path = require('node:path');

const { mergeRuntimeToolSources } = require('../src/renderer/tools/runtimeMerge.ts');

function makeTool(name, description) {
  return {
    name,
    description,
    parameters: [],
    execute: async () => description,
  };
}

const merged = mergeRuntimeToolSources({
  builtIns: [
    makeTool('built_only_tool', 'built only'),
    makeTool('shared_tool', 'built shared'),
    makeTool('disabled_tool', 'built disabled'),
  ],
  registrySkills: [
    {
      id: 'registry-skill',
      name: 'Registry Skill',
      description: 'registry source',
      version: '1.0.0',
      source: 'registry/user/registry-skill.skill.json',
      tools: [
        { name: 'shared_tool', description: 'registry shared', parameters: [], code: 'return "registry-shared";' },
        { name: 'registry_only_tool', description: 'registry only', parameters: [], code: 'return "registry-only";' },
        { name: 'disabled_tool', description: 'registry disabled duplicate', parameters: [], code: 'return "disabled";' },
      ],
    },
  ],
  legacyDirectorySkills: [
    {
      id: 'legacy-skill',
      name: 'Legacy Skill',
      description: 'legacy source',
      version: '1.0.0',
      source: 'legacy-skill.json',
      tools: [
        { name: 'shared_tool', description: 'legacy shared', parameters: {}, code: 'return "legacy-shared";' },
        { name: 'legacy_only_tool', description: 'legacy only', parameters: {}, code: 'return "legacy-only";' },
      ],
    },
  ],
  dynamicToolDefs: [
    {
      id: 'dynamic-shared',
      name: 'shared_tool',
      description: 'dynamic shared',
      parameters: [],
      code: 'return "dynamic-shared";',
      createdAt: Date.now(),
    },
    {
      id: 'dynamic-only',
      name: 'dynamic_only_tool',
      description: 'dynamic only',
      parameters: [],
      code: 'return "dynamic-only";',
      createdAt: Date.now(),
    },
  ],
  mcpServers: [
    {
      id: 'mcp-server-1',
      name: 'Test MCP',
      enabled: true,
      type: 'streamableHttp',
      url: 'https://example.invalid/mcp',
      timeout: 1000,
      discoveredTools: [
        { name: 'shared_tool', description: 'mcp shared', inputSchema: { properties: {}, required: [] } },
        { name: 'mcp_only_tool', description: 'mcp only', inputSchema: { properties: {}, required: [] } },
      ],
    },
  ],
  disabledBuiltInTools: ['disabled_tool'],
});

assert.deepEqual(
  merged.map((tool) => tool.name),
  [
    'built_only_tool',
    'shared_tool',
    'registry_only_tool',
    'legacy_only_tool',
    'dynamic_only_tool',
    'mcp_only_tool',
  ],
  'mergeRuntimeToolSources should keep deterministic source priority and de-duplicate shared tool names',
);

assert.equal(
  merged.some((tool) => tool.name === 'disabled_tool'),
  false,
  'disabled built-in names should remain blocked even if later sources provide the same tool name',
);

assert.equal(
  merged.find((tool) => tool.name === 'shared_tool')?.description,
  'built shared',
  'earlier sources should stay authoritative when duplicate tool names exist',
);

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

const originalWindow = global.window;
const originalNavigator = global.navigator;
const originalLocalStorage = global.localStorage;
const originalEnterpriseBuild = global.__ENTERPRISE_BUILD__;

const registrySaveCalls = [];

global.localStorage = createMemoryStorage();
global.navigator = { language: 'en-US' };
global.__ENTERPRISE_BUILD__ = false;
global.window = {
  electronAPI: {
    dbSetConfig: async () => undefined,
    dbGetConfig: async () => null,
    skillsRegistrySave: async (...args) => {
      registrySaveCalls.push(args);
      return { ok: true, id: 'unexpected-registry-write' };
    },
  },
};

const configStoreModulePath = require.resolve(path.join(__dirname, '..', 'src', 'renderer', 'stores', 'configStore.ts'));
const skillCreatorModulePath = require.resolve(path.join(__dirname, '..', 'src', 'renderer', 'tools', 'skillCreator.ts'));
const toolsIndexModulePath = require.resolve(path.join(__dirname, '..', 'src', 'renderer', 'tools', 'index.ts'));

delete require.cache[configStoreModulePath];
delete require.cache[skillCreatorModulePath];
delete require.cache[toolsIndexModulePath];

const { useConfigStore } = require('../src/renderer/stores/configStore.ts');
const { skillCreatorTool } = require('../src/renderer/tools/skillCreator.ts');

(async () => {
  const installMessage = await skillCreatorTool.execute({
    skill_name: 'phase_one_dynamic_tool',
    skill_description: 'created during Phase 1',
    parameters_json: '[]',
    implementation_code: 'return "phase-one";',
  });

  assert.match(
    installMessage,
    /dynamicToolDefs/,
    'skill_creator should explicitly report that Phase 1 persistence targets dynamicToolDefs',
  );
  assert.match(
    installMessage,
    /不会自动写入技能注册表/,
    'skill_creator should explicitly report that Phase 1 does not write through to the skills registry',
  );
  assert.equal(
    registrySaveCalls.length,
    0,
    'skill_creator should not call registry write APIs during Phase 1 Option B',
  );
  assert.equal(
    useConfigStore.getState().dynamicToolDefs.some((tool) => tool.name === 'phase_one_dynamic_tool'),
    true,
    'skill_creator should add the new tool to dynamicToolDefs immediately',
  );

  delete require.cache[configStoreModulePath];
  delete require.cache[toolsIndexModulePath];

  const restartedStore = require('../src/renderer/stores/configStore.ts').useConfigStore;
  const restartedTools = require('../src/renderer/tools/index.ts').getAllTools();

  assert.equal(
    restartedStore.getState().dynamicToolDefs.some((tool) => tool.name === 'phase_one_dynamic_tool'),
    true,
    'skill_creator-created tools should survive restart via persisted dynamicToolDefs state',
  );
  assert.equal(
    restartedTools.some((tool) => tool.name === 'phase_one_dynamic_tool'),
    true,
    'skill_creator-created tools should remain available through getAllTools after restart',
  );

  global.window = originalWindow;
  global.navigator = originalNavigator;
  global.localStorage = originalLocalStorage;
  global.__ENTERPRISE_BUILD__ = originalEnterpriseBuild;

  console.log('skills runtime merge ok');
})().catch((error) => {
  global.window = originalWindow;
  global.navigator = originalNavigator;
  global.localStorage = originalLocalStorage;
  global.__ENTERPRISE_BUILD__ = originalEnterpriseBuild;
  console.error(error);
  process.exit(1);
});