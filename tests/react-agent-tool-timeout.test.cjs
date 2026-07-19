const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const reactAgentPath = path.join(__dirname, '..', 'src', 'renderer', 'services', 'reactAgent.ts');

test('does not let a timed-out mutator outlive its tool result or the agent', async () => {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;
  const events = [];
  let streamCall = 0;
  let sideEffects = 0;

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

  const mocks = {
    './llmService': { streamChat, toolsToJsonSchema: (value) => value },
    '../prompts/systemPrompt': { buildSystemPrompt: () => 'system' },
    '../tools': {
      getAllTools: () => [{
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
    },
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

  try {
    delete require.cache[reactAgentPath];
    const { runReactAgent } = require(reactAgentPath);
    const emitted = [];

    for await (const event of runReactAgent(
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
    delete require.cache[reactAgentPath];
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
  }
});

