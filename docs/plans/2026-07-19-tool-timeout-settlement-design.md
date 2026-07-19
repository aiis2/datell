# Tool Timeout Settlement Design

## Mainline

This design starts from authoritative `origin/master@abefaf48d0be91ea214be6494c5e3ff30b797be8` and addresses Issue #13.

The repository does not publish `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`runReactAgent` currently implements the configured tool timeout with `Promise.race`. When the timer wins, the Agent receives an error saying the tool was automatically cancelled, but the original `tool.execute()` promise remains alive.

A real production-loop harness proves the mismatch. With a 10 ms deadline and a mutator that commits after 50 ms, the Agent returns a timeout result and finishes before the mutation occurs. The mutation then commits after Agent completion.

This is not merely inaccurate wording. A retry can duplicate a write, Stop cannot bound the operation lifetime, and persisted conversation history can disagree with the system state.

## Root Cause

An execution deadline, a cancellation request, and execution settlement are distinct events:

- a timer can observe that a deadline elapsed;
- an `AbortSignal` can request cooperative cancellation;
- only fulfillment or rejection proves the underlying JavaScript execution has settled.

The existing code observes only the first event and then treats it as all three. JavaScript cannot forcibly terminate an arbitrary in-process Promise, so an honest implementation must propagate cancellation and retain ownership until settlement.

## Invariant

`runReactAgent` must not emit the final result for a tool call, start a later serial tool, request another model turn, or finish the Agent while that tool's execution promise is unresolved.

This invariant applies even when a tool ignores its `AbortSignal`.

## Chosen Design

### Per-call cancellation scope

Each execution receives a child `AbortController`. The helper links the parent conversation signal to the child and aborts the child when the configured deadline elapses.

The child controller prevents one timed-out parallel call from cancelling sibling calls or the entire conversation.

### Settlement barrier

The deadline callback records that the deadline elapsed and aborts the child signal, but it does not race the execution promise out of the Agent loop. The helper continues awaiting the original promise until it fulfills or rejects.

This turns the timeout into a cooperative cancellation deadline rather than a false force-kill boundary.

### Honest outcomes

- Fulfillment before the deadline returns the original result unchanged.
- Rejection before the deadline preserves the original error.
- Rejection after the deadline reports that the execution exceeded its deadline and stopped after cancellation was requested.
- Fulfillment after the deadline returns the actual result with an explicit warning that the operation exceeded its deadline but ultimately completed. It must not be reported as cancelled, because the model could otherwise retry a completed write.
- Parent cancellation aborts the same child signal. The helper still waits for settlement so Stop cannot detach a non-cooperative operation.

### Cleanup

The timer and parent abort listener are removed in `finally` for fulfillment, rejection, deadline, and parent-cancellation paths. A timer callback that fires after settlement must be impossible.

### Integration boundary

The helper lives in a pure renderer service module and is used by `runReactAgent.executeTool`. Existing validation, serial/parallel partitioning, result truncation, and result ordering remain in `reactAgent.ts`.

No individual tool adapter is rewritten in this cycle. Existing subagent tools already consume the supplied signal; other tools gain the child signal without an API change because `AgentToolDefinition.execute` already accepts `signal?: AbortSignal`.

## Alternatives Rejected

### Keep `Promise.race` and change the message

Calling the outcome a timeout rather than cancellation would improve wording but would leave detached mutations and duplicate-write risk intact.

### Abort without awaiting settlement

This works only for cooperative tools. A tool that ignores the signal would still outlive the Agent, so it does not establish the required invariant.

### Return immediately for read-only tools

Tool metadata is optional and not a security proof. MCP calls and incorrectly classified tools can still have remote side effects. A single lifetime rule is safer and easier to reason about.

### Force termination in the renderer

Arbitrary Promises cannot be killed safely in-process. Worker/process/IPC isolation would require tool-specific protocols and is appropriate as later hardening, not as a fictional guarantee in this cycle.

## Risks And Mitigations

- A permanently hung non-cooperative tool can now keep the Agent waiting. This is the unavoidable honest behavior without process isolation; the UI remains in a running state instead of falsely declaring completion.
- Slow tools that ignore cancellation may take longer than the configured deadline. Their actual completion is surfaced so the model does not retry a committed operation.
- Parallel tools may settle at different times. `Promise.allSettled` already waits for every call, so the helper preserves existing result ordering.
- Parent Stop may wait for a non-cooperative tool. The alternative is detached work, which violates the safety invariant. Later adapter-specific IPC cancellation can improve responsiveness.

## Verification Strategy

1. Pure tests cover normal fulfillment, normal rejection, cooperative deadline cancellation, non-cooperative late fulfillment, non-cooperative late rejection, parent abort propagation, and cleanup.
2. A production-loop regression uses the real `runReactAgent` with mocked LLM/tool registration only. It proves the Agent has not returned while a delayed mutation remains unresolved.
3. Reverse verification runs the regression against `origin/master@abefaf4` and records the expected failure.
4. The complete CJS suite, both TypeScript compilers, Vite build, Electron origin-isolation smokes, npm audits, and diff checks guard surrounding behavior.

## Scope Boundary

This cycle establishes an honest in-process lifetime invariant. It does not claim to preempt arbitrary synchronous JavaScript, terminate third-party IPC work, or add cancellation protocols to every main-process adapter. Those are separate focused hardening cycles after the control-flow contract is correct.
