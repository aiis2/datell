const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourceRoot = process.env.DATELL_SOURCE_ROOT
  ? path.resolve(process.env.DATELL_SOURCE_ROOT)
  : path.join(__dirname, '..');
const reactAgentPath = path.join(sourceRoot, 'src', 'renderer', 'services', 'reactAgent.ts');

function loadReactAgent({ streamChat, tools, configState }) {
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
    './llmService': { streamChat, toolsToJsonSchema: (value) => value },
    '../prompts/systemPrompt': { buildSystemPrompt: () => 'system' },
    '../tools': { getAllTools: () => tools },
    '../tools/suggestCardCombinations': { suggestCardCombinationsTool: {} },
    '../stores/configStore': { useConfigStore: { getState: () => configState } },
    '../stores/reportStore': { useReportStore: { getState: () => ({ selectedTemplateId: null, templates: [] }) } },
    '../stores/datasourceStore': { useDatasourceStore: { getState: () => ({ activeDatasourceId: null, allDatasources: () => [] }) } },
    './memoryService': { buildMemoryContext: async () => '' },
    './systemRagService': { retrieveSystemComponents: async () => ({ cards: [], layouts: [] }), formatSystemComponentsPrompt: () => '' },
    '../types/reportPresets': { BUILT_IN_PRESETS: [] },
    '../tools/planTasks': { activePlanTaskIds: new Set() },
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === reactAgentPath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[reactAgentPath];
  const { runReactAgent } = require(reactAgentPath);

  return {
    runReactAgent,
    restore() {
      delete require.cache[reactAgentPath];
      Module._load = originalLoad;
      if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
      else delete require.extensions['.ts'];
    },
  };
}

test('does not let a timed-out mutator outlive its tool result or the agent', async () => {
  const events = [];
  let streamCall = 0;
  let sideEffects = 0;

  async function* streamChat() {
    streamCall += 1;
    if (streamCall === 1) {
      yield { type: 'tool-call', id: 'tc-1', name: 'mutator', args: {} };
      return;
    }
    yield { type: 'text-delta', content: 'agent finished' };
  }

  const configState = {
    language: 'zh-CN',
    reactMaxSteps: 5,
    toolExecutionTimeoutMs: 10,
    userSystemPrompts: [],
    preferredChartEngine: 'echarts',
    reportLayoutId: undefined,
    activePresetId: undefined,
  };

  const harness = loadReactAgent({
    streamChat,
    configState,
    tools: [{
      name: 'mutator',
      description: '',
      parameters: [],
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        sideEffects += 1;
        events.push('mutation-settled');
        return 'mutation committed';
      },
    }],
  });

  try {
    const emitted = [];

    for await (const event of harness.runReactAgent(
      [{ id: 'u', role: 'user', content: 'go', timestamp: 0 }],
      { provider: 'openai', modelId: 'm' },
      undefined,
    )) {
      emitted.push(event);
      if (event.type === 'tool-result') events.push('tool-result');
    }
    events.push('agent-returned');

    const toolResult = emitted.find((event) => event.type === 'tool-result')?.result ?? '';

    assert.equal(sideEffects, 1);
    assert.deepEqual(events, ['mutation-settled', 'tool-result', 'agent-returned']);
    assert.match(toolResult, /mutation committed/);
    assert.match(toolResult, /超时|deadline/i);
    assert.doesNotMatch(toolResult, /已自动取消/);

    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(sideEffects, 1, 'no detached mutation may occur after agent completion');
  } finally {
    harness.restore();
  }
});

test('waits for the active tool but skips later calls after parent cancellation', async () => {
  const events = [];
  let laterToolExecutions = 0;
  let streamCall = 0;
  const parent = new AbortController();

  async function* streamChat() {
    streamCall += 1;
    if (streamCall === 1) {
      yield { type: 'tool-call', id: 'tc-1', name: 'slow_mutator', args: {} };
      yield { type: 'tool-call', id: 'tc-2', name: 'later_mutator', args: {} };
    }
  }

  const configState = {
    language: 'zh-CN',
    reactMaxSteps: 5,
    toolExecutionTimeoutMs: 1000,
    userSystemPrompts: [],
    preferredChartEngine: 'echarts',
    reportLayoutId: undefined,
    activePresetId: undefined,
  };

  const harness = loadReactAgent({
    streamChat,
    configState,
    tools: [
      {
        name: 'slow_mutator',
        description: '',
        parameters: [],
        execute: async () => {
          setTimeout(() => parent.abort(), 5);
          await new Promise((resolve) => setTimeout(resolve, 25));
          events.push('active-tool-settled');
          return 'settled';
        },
      },
      {
        name: 'later_mutator',
        description: '',
        parameters: [],
        execute: async () => {
          laterToolExecutions += 1;
          return 'unexpected';
        },
      },
    ],
  });

  try {
    for await (const event of harness.runReactAgent(
      [{ id: 'u', role: 'user', content: 'go', timestamp: 0 }],
      { provider: 'openai', modelId: 'm' },
      parent.signal,
    )) {
      if (event.type === 'tool-result') events.push(`result:${event.callId}`);
    }
    events.push('agent-returned');

    assert.equal(laterToolExecutions, 0);
    assert.deepEqual(events, ['active-tool-settled', 'agent-returned']);
  } finally {
    harness.restore();
  }
});
