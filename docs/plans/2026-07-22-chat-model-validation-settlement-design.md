# Chat Model Validation Settlement Design

## Mainline

This design starts from authoritative `origin/master@6b063cc` and addresses Issue #87.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`sendMessage` adds the conversation ID to `streamingConversationIds` before calling `runAgentWithModel`. The missing-model / missing-cloud-API-key check currently returns before the function enters its `try/finally` lifecycle.

A direct store probe on mainline produces:

```json
{
  "isStreaming": false,
  "streamingConversationIds": ["conv-missing-key"],
  "warningInMemory": "⚠️ 请先在设置中配置模型 API Key。",
  "persistedMessageIds": ["user-message"]
}
```

The warning is visible only until restart, and the stale streaming ID makes the conversation appear to resume streaming when the user switches back to it. There is no live controller at that point, so Stop cannot settle the phantom run.

## Invariant

Every call to `runAgentWithModel` must settle through one lifecycle, including preflight validation failures. Settlement must persist the final assistant state and remove the conversation from streaming state. A preflight failure must not invoke the agent or memory consolidation.

## Chosen Design

### Put validation inside the owned lifecycle

Create and register the per-conversation abort controller, enter the existing `try/finally`, then perform the model/API-key validation. On failure, write the existing warning into the assistant message and return. JavaScript `finally` semantics then run the same persistence and cleanup used by successful, failed, and stopped runs.

Track whether a configured agent run actually started. Gate session-memory consolidation on that flag as well as the existing abort check so a validation-only run never sends a second model request.

This keeps one settlement owner and preserves the existing model-selection fallback, warning text, error handling, terminal tool-result draining, and configured-model behavior.

### Persistence and state outcome

The existing finalizer will:

1. Persist the warning assistant message.
2. Persist the final conversation timestamp/state.
3. Remove the abort controller and any ask-user resolver.
4. Remove the conversation ID from `streamingConversationIds`.
5. Recompute `isStreaming` for the active conversation.
6. Skip memory consolidation because no agent run started.

## Alternatives Rejected

### Duplicate cleanup in the validation branch

Manually persisting and clearing state before the early return is small initially, but it creates a second settlement path that can drift when the normal finalizer changes.

### Validate before `sendMessage` marks streaming

This spreads model-policy knowledge into each caller (`sendMessage`, regenerate, resend) and still needs a persistence path for the warning assistant message.

### Remove only the stale streaming ID

That fixes the visible spinner but still loses the assistant warning on restart and leaves lifecycle behavior inconsistent.

## Scope

- Modify `src/renderer/stores/chatStore.ts` only for production behavior.
- Add one product-level CJS regression test that drives the real Zustand store through `sendMessage` with a cloud model missing its API key.
- Keep warning copy and model/provider rules unchanged.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Validation return accidentally starts memory consolidation | Explicit `agentRunStarted` gate and test assertion |
| Configured runs change behavior | Keep validation predicate unchanged and run existing Stop settlement test plus full suite |
| Warning is still not durable | Assert the real DB adapter mock receives the assistant row with warning content |
| Cleanup reports idle while another conversation streams | Assert finalizer continues deriving `isStreaming` from the remaining ID set |

## Verification Strategy

1. RED on `origin/master`: missing API key leaves the ID in `streamingConversationIds` and persists only the user message.
2. GREEN: warning assistant is persisted; both streaming flags settle; agent and memory functions are not called.
3. Existing configured-model Stop settlement test stays green.
4. Full CJS suite, renderer/main TypeScript compilers, Vite build, Electron isolation/runtime smoke tests, and dependency audits.
