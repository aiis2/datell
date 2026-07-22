# Chat Delete Cancellation Design

## Mainline

This design starts from authoritative `origin/master@fb7b295` and addresses Issue #90.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

The sidebar exposes Delete for streaming conversations. `deleteConversation(id)` currently removes the conversation from the Zustand list and DB, but it does not interact with the per-conversation runtime maps.

Two direct mainline probes show the broken lifecycle:

```json
{
  "signalAborted": false,
  "isStreaming": true,
  "streamingConversationIds": ["conv-delete"],
  "continuedAfterDelete": true
}
```

```json
{
  "signalAborted": false,
  "sendSettled": false,
  "pendingQuestion": {
    "convId": "conv-question"
  }
}
```

The first deleted run continues. The second is permanently blocked inside `ask_user`. In both cases the UI can report streaming without any visible conversation or usable Stop target.

## Invariant

Deleting a conversation also cancels that conversation's live run. Cancellation is scoped by conversation ID: it must never abort another foreground/background run. Store state must immediately stop advertising the deleted run, while `runAgentWithModel` keeps ownership of asynchronous final settlement and controller-map cleanup.

## Chosen Design

### Shared per-conversation cancellation helper

Extract a small module-local helper used by both Delete and the existing Stop action:

1. Look up the ask-user resolver for the target conversation.
2. Resolve it with the established `__ABORT__` sentinel and remove the resolver entry.
3. Abort the target conversation's controller if present.

Do **not** remove the controller entry in Delete. The agent finalizer reads its aborted state to skip memory consolidation and then deletes the entry itself.

### Atomic deletion state update

After requesting cancellation, update the Zustand state in one callback:

1. Remove the conversation.
2. Select the next active conversation using the existing ordering rule.
3. Remove only the deleted ID from `streamingConversationIds`.
4. Derive `isStreaming` from the next active ID and the remaining streaming set.
5. Clear `pendingQuestion` and `agentTurnInfo` only when they belong to the deleted conversation.

Then issue the existing async DB deletion. Late stream events are harmless because every assistant update maps by the deleted conversation ID and cannot recreate it. The normal `finally` block remains idempotent when it removes the already-removed streaming ID.

### Multiple concurrent runs

Deleting background conversation A while active conversation B streams must:

- abort A only;
- leave B's signal untouched;
- keep B active;
- keep `streamingConversationIds` containing B;
- keep `isStreaming: true`.

## Alternatives Rejected

### Disable Delete while streaming

This avoids the bug but removes a reasonable user action and still leaves programmatic deletion unsafe.

### Call the global `stopStreaming()` action

`stopStreaming()` targets the active conversation, so deleting a background stream could abort the wrong run. Cancellation must accept an explicit conversation ID.

### Delete controller/resolver map entries immediately

Removing the controller before finalization loses the `wasAborted` evidence and can incorrectly trigger memory consolidation.

### Await full agent settlement before hiding the conversation

Non-cooperative tools can settle late. Blocking Delete would make the UI hang and still cannot undo a side effect already committed.

## Scope

- Modify `src/renderer/stores/chatStore.ts`.
- Add product-level CJS tests for deletion during a running agent, deletion during `ask_user`, and isolation from another active stream.
- No visual/UI changes.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Delete aborts the newly active conversation | Address controller/resolver strictly by deleted ID; two-stream regression |
| `ask_user` remains unresolved | Resolve with existing `__ABORT__` before abort; bounded settlement assertion |
| Finalizer starts memory work after Delete | Preserve controller entry until finalizer; assert no consolidation |
| Deleted conversation reappears from late events | Updates map existing conversations only; assert absence after promises settle |
| Active UI reports idle while another run remains | Derive `isStreaming` from filtered IDs and next active conversation |

## Verification Strategy

1. RED on `origin/master`: deletion leaves the signal live, keeps stale streaming state, and fails to settle `ask_user`.
2. GREEN: deletion aborts/settles the target synchronously and the send promise unwinds.
3. Two concurrent runs prove target isolation and correct active streaming state.
4. Existing Stop settlement regression remains green.
5. Full CJS suite, both TypeScript compilers, Vite build, Electron isolation/runtime smoke tests, and dependency audits.
