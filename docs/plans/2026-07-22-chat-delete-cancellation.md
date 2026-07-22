# Chat Delete Cancellation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cancel and fully settle a conversation's live agent run when that conversation is deleted, without disturbing any other stream.

**Architecture:** Add an ID-scoped cancellation helper for ask-user resolution plus controller abort, then make `deleteConversation` atomically remove the target from chat and streaming state while the existing agent finalizer owns asynchronous cleanup.

**Tech Stack:** TypeScript, Zustand, AbortController, Node.js built-in test runner, CommonJS TypeScript test harness.

**Issue:** #90

---

### Task 1: Add RED deletion lifecycle tests

**Files:**

- Create: `tests/chat-store-delete-cancellation.test.cjs`

**Step 1: Reproduce two-stream deletion**

Drive the real store with two configured local-model runs. Delete background conversation A while conversation B is active and streaming. Assert the desired behavior:

- A's signal is aborted.
- B's signal is not aborted.
- A is absent from conversations and streaming IDs.
- B stays active, present in streaming IDs, and `isStreaming` remains true.
- after stopping B, both send promises settle and A never reappears.
- memory consolidation is not called for the deleted/aborted run.

**Step 2: Reproduce deletion during `ask_user`**

Make the agent await the real `onAskUser` callback, delete that conversation, and assert:

- the callback receives `__ABORT__`;
- the controller is aborted;
- `pendingQuestion` clears;
- the send promise settles within a bounded timeout;
- streaming state clears.

**Step 3: Run focused tests to verify RED**

```bash
node --test tests/chat-store-delete-cancellation.test.cjs
```

Expected on `origin/master`: failures showing un-aborted signals, stale streaming IDs, and an unresolved ask-user run.

**Step 4: Commit the RED tests**

```bash
git add tests/chat-store-delete-cancellation.test.cjs
git commit -m "test: reproduce chat deletion without cancellation"
```

### Task 2: Implement ID-scoped cancellation and state settlement

**Files:**

- Modify: `src/renderer/stores/chatStore.ts`

**Step 1: Extract cancellation helper**

Add a module-local `cancelConversationRun(convId)` that resolves/removes the target ask-user resolver with `__ABORT__` and aborts only the target controller. Reuse it from `stopStreaming()` without changing Stop behavior.

**Step 2: Harden `deleteConversation`**

Call the helper, then return an atomic state patch containing filtered conversations, next active ID, filtered streaming IDs, derived `isStreaming`, and target-scoped pending-question/turn-info cleanup. Keep the existing async DB deletion.

**Step 3: Run focused tests to verify GREEN**

```bash
node --test tests/chat-store-delete-cancellation.test.cjs tests/chat-store-stop-settlement.test.cjs tests/chat-store-model-validation-settlement.test.cjs
```

Expected: all tests pass.

**Step 4: Commit the implementation**

```bash
git add src/renderer/stores/chatStore.ts
git commit -m "fix: cancel active chat runs on deletion"
```

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
npx vite build
node scripts/smoke-report-preview-isolation.cjs --expect-isolated
node scripts/smoke-export-origin-isolation.cjs --expect-isolated
node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
npm audit --audit-level=high --registry=https://registry.npmjs.org
```

Review `git diff origin/master...HEAD` and confirm the implementation PR contains only the RED tests and scoped store lifecycle change.
