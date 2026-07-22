# Chat Model Validation Settlement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make missing-model and missing-cloud-API-key chat runs persist their warning and fully leave streaming state without starting agent or memory work.

**Architecture:** Move the unchanged preflight validation into `runAgentWithModel`'s existing `try/finally` lifecycle and gate memory consolidation on whether a configured agent run started.

**Tech Stack:** TypeScript, Zustand, Node.js built-in test runner, CommonJS test harness with TypeScript transpilation.

**Issue:** #87

---

### Task 1: Add the failing lifecycle regression

**Files:**

- Create: `tests/chat-store-model-validation-settlement.test.cjs`

**Step 1: Write the failing test**

Drive the real `useChatStore.getState().sendMessage('hello', [])` with mocked persistence and a cloud model whose API key is blank. Assert:

- `runReactAgent` is never called.
- `consolidateSessionMemory` is never called.
- the in-memory assistant contains the existing configuration warning.
- `isStreaming` is `false`.
- `streamingConversationIds` is empty.
- the persisted rows contain both the user message and warning assistant message.

**Step 2: Run the focused test to verify RED**

```bash
node --test tests/chat-store-model-validation-settlement.test.cjs
```

Expected on `origin/master`: failure because `streamingConversationIds` still contains the conversation and the assistant warning was not persisted.

**Step 3: Commit the RED test**

```bash
git add tests/chat-store-model-validation-settlement.test.cjs
git commit -m "test: reproduce chat model validation settlement"
```

### Task 2: Settle validation through the shared lifecycle

**Files:**

- Modify: `src/renderer/stores/chatStore.ts`

**Step 1: Enter the lifecycle before validation**

Register the abort controller and enter `try/finally` before checking `!model || (requiresApiKey && !apiKey)`. Keep the predicate and warning copy unchanged.

**Step 2: Gate memory consolidation**

Track whether execution reached the configured agent invocation. Require that flag, in addition to `!wasAborted`, before consolidating session memory.

**Step 3: Run focused tests to verify GREEN**

```bash
node --test tests/chat-store-model-validation-settlement.test.cjs tests/chat-store-stop-settlement.test.cjs
```

Expected: all tests pass.

**Step 4: Commit the implementation**

```bash
git add src/renderer/stores/chatStore.ts
git commit -m "fix: settle chat model validation failures"
```

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
npx vite build
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
npm audit --audit-level=high --registry=https://registry.npmjs.org
```

Run the repository's Electron isolation/runtime smoke tests used by the current mainline cycles. Review `git diff origin/master...HEAD` and confirm the implementation PR contains only the RED test and scoped store fix.
