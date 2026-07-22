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

async function settlesWithin(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withChatStore({ ids, runReactAgent, upsertMessage = async () => {} }, run) {
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = Module._load;
  const originalLocalStorage = global.localStorage;
  const deletedConversationIds = [];
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
    id: 'local-model',
    name: 'Local model',
    provider: 'ollama',
    modelId: 'test-model',
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

  const dbAPI = {
    getConversations: async () => [],
    getMessages: async () => [],
    getConfig: async () => null,
    setConfig: async () => {},
    upsertConversation: async () => {},
    upsertMessage,
    updateConversationTitle: async () => {},
    deleteConversation: async (id) => {
      deletedConversationIds.push(id);
    },
    deleteMessage: async () => {},
  };

  const mocks = {
    uuid: { v4: () => ids.shift() },
    './configStore': { useConfigStore: { getState: () => configState } },
    './subagentStore': { useSubagentStore: { getState: () => ({ clearTodos: () => {} }) } },
    '../services/reactAgent': { runReactAgent },
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
    await run({
      useChatStore,
      deletedConversationIds,
      getMemoryCalls: () => memoryCalls,
    });
  } finally {
    delete require.cache[chatStorePath];
    Module._load = originalLoad;
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    global.localStorage = originalLocalStorage;
  }
}

test('deleting a background run cancels only that conversation', async () => {
  const signals = new Map();
  const settledRuns = [];

  async function* runReactAgent(messages, _model, signal) {
    const label = messages.at(-1)?.content;
    signals.set(label, signal);
    if (!signal.aborted) {
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    }
    settledRuns.push(label);
  }

  await withChatStore(
    {
      ids: ['conv-a', 'user-a', 'assistant-a', 'conv-b', 'user-b', 'assistant-b'],
      runReactAgent,
    },
    async ({ useChatStore, deletedConversationIds, getMemoryCalls }) => {
      const runA = useChatStore.getState().sendMessage('A', []);
      await waitFor(() => signals.has('A'), 'conversation A did not start');

      assert.equal(useChatStore.getState().createConversation(), 'conv-b');
      const runB = useChatStore.getState().sendMessage('B', []);
      await waitFor(() => signals.has('B'), 'conversation B did not start');

      useChatStore.getState().deleteConversation('conv-a');
      const afterDelete = useChatStore.getState();
      const deletionSnapshot = {
        aAborted: signals.get('A').aborted,
        bAborted: signals.get('B').aborted,
        conversations: afterDelete.conversations.map((conversation) => conversation.id),
        activeConversationId: afterDelete.activeConversationId,
        isStreaming: afterDelete.isStreaming,
        streamingConversationIds: afterDelete.streamingConversationIds,
      };

      useChatStore.getState().stopStreaming();
      useChatStore.getState().setActiveConversation('conv-a');
      useChatStore.getState().stopStreaming();
      useChatStore.getState().setActiveConversation('conv-b');
      await Promise.all([runA, runB]);

      assert.deepEqual(deletionSnapshot, {
        aAborted: true,
        bAborted: false,
        conversations: ['conv-b'],
        activeConversationId: 'conv-b',
        isStreaming: true,
        streamingConversationIds: ['conv-b'],
      });
      assert.deepEqual(deletedConversationIds, ['conv-a']);
      assert.deepEqual(new Set(settledRuns), new Set(['A', 'B']));
      assert.equal(getMemoryCalls(), 0);

      const finalState = useChatStore.getState();
      assert.deepEqual(finalState.conversations.map((conversation) => conversation.id), ['conv-b']);
      assert.deepEqual(finalState.streamingConversationIds, []);
      assert.equal(finalState.isStreaming, false);
    },
  );
});

test('deleting an ask_user run resolves it with the abort sentinel', async () => {
  let signalSeen;
  let answerSeen;

  async function* runReactAgent(_messages, _model, signal, onAskUser) {
    signalSeen = signal;
    answerSeen = await onAskUser('ask-1', 'Choose one');
  }

  await withChatStore(
    {
      ids: ['conv-question', 'user-question', 'assistant-question'],
      runReactAgent,
    },
    async ({ useChatStore, getMemoryCalls }) => {
      const sendPromise = useChatStore.getState().sendMessage('question', []);
      await waitFor(() => useChatStore.getState().pendingQuestion != null, 'ask_user did not become pending');

      useChatStore.getState().deleteConversation('conv-question');
      const settledAfterDelete = await settlesWithin(sendPromise, 500);
      const afterDelete = useChatStore.getState();
      const deletionSnapshot = {
        signalAborted: signalSeen.aborted,
        settledAfterDelete,
        answerSeen,
        pendingQuestion: afterDelete.pendingQuestion,
        isStreaming: afterDelete.isStreaming,
        streamingConversationIds: afterDelete.streamingConversationIds,
      };

      if (!settledAfterDelete) {
        useChatStore.getState().answerQuestion('__TEST_CLEANUP__');
        useChatStore.getState().setActiveConversation('conv-question');
        useChatStore.getState().stopStreaming();
        await sendPromise;
      }

      assert.deepEqual(deletionSnapshot, {
        signalAborted: true,
        settledAfterDelete: true,
        answerSeen: '__ABORT__',
        pendingQuestion: null,
        isStreaming: false,
        streamingConversationIds: [],
      });
      assert.equal(getMemoryCalls(), 0);
    },
  );
});

test('deleting before agent startup prevents a late run', async () => {
  let releaseUserPersistence;
  let userPersistenceStarted = false;
  let agentCalls = 0;
  const userPersistenceGate = new Promise((resolve) => {
    releaseUserPersistence = resolve;
  });

  const runReactAgent = () => {
    agentCalls += 1;
    return (async function* emptyAgentRun() {})();
  };

  await withChatStore(
    {
      ids: ['conv-before-start', 'user-before-start', 'assistant-before-start'],
      runReactAgent,
      upsertMessage: async (message) => {
        if (message.id === 'user-before-start') {
          userPersistenceStarted = true;
          await userPersistenceGate;
        }
      },
    },
    async ({ useChatStore, deletedConversationIds, getMemoryCalls }) => {
      const sendPromise = useChatStore.getState().sendMessage('go', []);
      await waitFor(() => userPersistenceStarted, 'user persistence did not start');

      useChatStore.getState().deleteConversation('conv-before-start');
      releaseUserPersistence();
      await sendPromise;

      const state = useChatStore.getState();
      assert.equal(agentCalls, 0);
      assert.equal(getMemoryCalls(), 0);
      assert.deepEqual(deletedConversationIds, ['conv-before-start']);
      assert.deepEqual(state.conversations, []);
      assert.deepEqual(state.streamingConversationIds, []);
      assert.equal(state.isStreaming, false);
    },
  );
});
