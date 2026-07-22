const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const chatStorePath = path.join(__dirname, '..', 'src', 'renderer', 'stores', 'chatStore.ts');

test('settles and persists a missing cloud API key warning', async () => {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;
  const originalLocalStorage = global.localStorage;
  const persistedMessages = [];
  const ids = ['conv-missing-key', 'user-message', 'assistant-warning'];
  let agentCalls = 0;
  let memoryCalls = 0;

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
    id: 'cloud-model',
    name: 'Cloud model',
    provider: 'openai',
    modelId: 'gpt-test',
    apiKey: '',
    baseUrl: 'https://example.invalid',
  };
  const configState = {
    models: [model],
    activeModelId: model.id,
    language: 'zh-CN',
    memoryShortTermRounds: 5,
    setActiveModel: () => {},
  };

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
    '../services/reactAgent': {
      runReactAgent: async function* runReactAgent() {
        agentCalls += 1;
      },
    },
    '../services/memoryService': {
      consolidateSessionMemory: async () => {
        memoryCalls += 1;
      },
    },
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

    await useChatStore.getState().sendMessage('hello', []);

    const state = useChatStore.getState();
    const assistant = state.conversations[0]?.messages[1];
    assert.equal(state.isStreaming, false);
    assert.match(assistant?.content ?? '', /API Key/);
    assert.equal(agentCalls, 0);
    assert.equal(memoryCalls, 0);
    assert.deepEqual(
      {
        streamingConversationIds: state.streamingConversationIds,
        persistedMessageIds: persistedMessages.map((message) => message.id),
      },
      {
        streamingConversationIds: [],
        persistedMessageIds: ['user-message', 'assistant-warning'],
      },
    );
    assert.match(persistedMessages[1]?.content ?? '', /API Key/);
  } finally {
    delete require.cache[chatStorePath];
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    global.localStorage = originalLocalStorage;
  }
});
