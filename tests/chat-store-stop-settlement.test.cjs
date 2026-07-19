const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const chatStorePath = path.join(__dirname, '..', 'src', 'renderer', 'stores', 'chatStore.ts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, message) {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(5);
  }
  assert.fail(message);
}

test('persists terminal tool results emitted after Stop', async () => {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;
  const originalLocalStorage = global.localStorage;
  const persistedMessages = [];
  const ids = ['conv-1', 'user-1', 'assistant-1'];

  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };

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

  const model = {
    id: 'model-1',
    name: 'Local model',
    provider: 'ollama',
    modelId: 'model',
    apiKey: '',
    baseUrl: 'http://localhost',
  };
  const configState = {
    models: [model],
    activeModelId: model.id,
    language: 'zh-CN',
    memoryShortTermRounds: 5,
    setActiveModel: () => {},
  };

  async function* runReactAgent(_messages, _model, signal) {
    yield { type: 'tool-call', id: 'tc-active', name: 'slow_mutator', args: {} };
    yield { type: 'tool-call', id: 'tc-skipped', name: 'later_mutator', args: {} };

    if (!signal.aborted) {
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    }
    await sleep(5);

    yield {
      type: 'tool-result',
      callId: 'tc-active',
      result: '⚠️ 用户停止当前响应后，工具仍实际完成。请勿重复执行。\n\ncommitted',
    };
    yield {
      type: 'tool-result',
      callId: 'tc-skipped',
      result: '工具执行错误: 工具未执行，因为用户已停止当前响应',
    };
  }

  const dbAPI = {
    getConversations: async () => [],
    getMessages: async () => [],
    getConfig: async () => null,
    setConfig: async () => {},
    upsertConversation: async () => {},
    upsertMessage: async (message) => {
      persistedMessages.push({ ...message });
    },
    updateConversationTitle: async () => {},
    deleteConversation: async () => {},
    deleteMessage: async () => {},
  };

  const mocks = {
    uuid: { v4: () => ids.shift() },
    './configStore': { useConfigStore: { getState: () => configState } },
    './subagentStore': { useSubagentStore: { getState: () => ({ clearTodos: () => {} }) } },
    '../services/reactAgent': { runReactAgent },
    '../services/memoryService': { consolidateSessionMemory: async () => {} },
    '../services/dbAPI': { dbAPI, isElectron: () => true },
    './suggestionsStore': {
      useSuggestionsStore: { getState: () => ({ setSuggestions: () => {} }) },
      parseSuggestionsFromMessage: () => [],
    },
    '../i18n': { getLocale: () => ({ sidebar: { newConversationTitle: 'New conversation' } }) },
  };

  Module._load = function loadWithMocks(request, parent, isMain) {
    if (parent?.filename === chatStorePath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[chatStorePath];
    const { useChatStore } = require(chatStorePath);
    const sendPromise = useChatStore.getState().sendMessage('go', []);

    await waitFor(() => {
      const conversation = useChatStore.getState().conversations[0];
      return conversation?.messages[1]?.toolCalls?.length === 2;
    }, 'tool calls were not added to the assistant message');

    useChatStore.getState().stopStreaming();
    await sendPromise;

    const state = useChatStore.getState();
    const assistant = state.conversations[0].messages[1];
    assert.deepEqual(
      assistant.toolCalls.map((call) => ({ id: call.id, status: call.status, result: call.result })),
      [
        {
          id: 'tc-active',
          status: 'done',
          result: '⚠️ 用户停止当前响应后，工具仍实际完成。请勿重复执行。\n\ncommitted',
        },
        {
          id: 'tc-skipped',
          status: 'done',
          result: '工具执行错误: 工具未执行，因为用户已停止当前响应',
        },
      ],
    );
    assert.equal(state.isStreaming, false);
    assert.deepEqual(state.streamingConversationIds, []);

    const persistedAssistant = persistedMessages.find((message) => message.id === 'assistant-1');
    assert.ok(persistedAssistant, 'the settled assistant message must be persisted');
    assert.deepEqual(
      JSON.parse(persistedAssistant.tool_calls).map((call) => call.status),
      ['done', 'done'],
    );
  } finally {
    delete require.cache[chatStorePath];
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    global.localStorage = originalLocalStorage;
  }
});

