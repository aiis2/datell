# Tool Timeout Settlement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent timed-out tool executions from committing side effects after the ReAct Agent has reported failure or finished.

**Architecture:** Add a pure per-call execution helper that links a child `AbortSignal` to the conversation, requests cancellation at the configured deadline, and retains an execution-settlement barrier before returning an honest outcome. Integrate the helper at the single `runReactAgent.executeTool` boundary without changing tool registration or serial/parallel scheduling.

**Tech Stack:** TypeScript, React renderer services, Node CJS tests, mocked production-loop regression, Vite.

---

### Task 1: Specify execution-deadline outcomes with red tests

**Files:**
- Create: `src/renderer/services/toolExecutionDeadline.ts`
- Create: `tests/tool-execution-deadline.test.cjs`

**Step 1: Write the failing pure tests**

Cover these behaviors:

- a fast fulfillment is returned unchanged;
- a fast rejection retains its error;
- a cooperative tool observes an aborted child signal after the deadline and settles before the helper returns;
- a non-cooperative late fulfillment is awaited and classified as completed after the deadline;
- a non-cooperative late rejection is awaited and classified as stopped after the deadline;
- a parent abort reaches the child signal;
- timer and parent listener cleanup prevent callbacks after settlement.

**Step 2: Run the focused test to verify it fails**

Run: `node --test tests/tool-execution-deadline.test.cjs`

Expected: FAIL because `toolExecutionDeadline.ts` does not exist on `origin/master@abefaf4`.

**Step 3: Implement the minimal helper**

Add a typed outcome with `result`, `deadlineExceeded`, and `parentAborted` state. Link the parent signal, arm the deadline, invoke the supplied executor with the child signal, await settlement, and clean up in `finally`.

**Step 4: Run the focused test to verify it passes**

Run: `node --test tests/tool-execution-deadline.test.cjs`

Expected: all helper cases pass.

**Step 5: Commit**

```bash
git add src/renderer/services/toolExecutionDeadline.ts tests/tool-execution-deadline.test.cjs
git commit -m "test: define tool deadline settlement"
```

### Task 2: Reproduce the detached mutation in the production loop

**Files:**
- Create: `tests/react-agent-tool-timeout.test.cjs`

**Step 1: Build the production-loop harness**

Load the real `src/renderer/services/reactAgent.ts`, mock only its LLM/config/tool dependencies, and register a mutator whose guarded side effect occurs after the configured deadline.

Record ordered events for deadline observation, mutation settlement, tool result emission, and Agent return.

**Step 2: Run the regression against authoritative mainline**

Run: `node --test tests/react-agent-tool-timeout.test.cjs`

Expected on `origin/master@abefaf4`: FAIL because Agent return precedes mutation settlement and the result falsely says the execution was automatically cancelled.

**Step 3: Commit the red regression**

```bash
git add tests/react-agent-tool-timeout.test.cjs
git commit -m "test: reproduce detached timed-out tool"
```

### Task 3: Integrate the settlement helper

**Files:**
- Modify: `src/renderer/services/reactAgent.ts`
- Test: `tests/react-agent-tool-timeout.test.cjs`

**Step 1: Replace the detached race**

Call the helper with `toolTimeoutMs`, the parent conversation signal, and `tool.execute(tc.args, childSignal)`.

**Step 2: Format honest results**

- Keep an on-time result unchanged.
- Prefix a late fulfillment with an explicit deadline-exceeded/completed warning and retain the tool's real result.
- Convert a rejection after the deadline into a deadline/cancellation error only after execution has settled.
- Preserve ordinary rejection handling and `maxResultSizeChars` truncation.

**Step 3: Run focused tests**

Run: `node --test tests/tool-execution-deadline.test.cjs tests/react-agent-tool-timeout.test.cjs`

Expected: all tests pass; event order is mutation settlement, tool result, Agent return; no later side effect occurs.

**Step 4: Reverse-verify the regression**

Temporarily run the committed regression against `origin/master@abefaf4`.

Expected: FAIL for the original detached-mutation ordering. Restore the implementation and rerun for PASS.

**Step 5: Commit**

```bash
git add src/renderer/services/reactAgent.ts tests/react-agent-tool-timeout.test.cjs
git commit -m "fix: retain timed-out tool ownership"
```

### Task 4: Verify surrounding functionality and security

**Files:**
- Modify tests only if verification exposes a missing invariant

**Step 1: Run the complete automated suite**

Run: `node --test tests/*.test.cjs`

Expected: every test passes.

**Step 2: Run compilers and production bundling**

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Run: `npx vite build`

Expected: all commands exit 0. Existing bundle-size warnings may remain and are tracked as a later performance cycle.

**Step 3: Re-run Electron security boundaries**

Run: `node scripts/smoke-report-preview-isolation.cjs --expect-isolated`

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-isolated`

Run: `node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated`

Expected: preview/export capability probes remain blocked and packaged chart/table runtimes remain functional.

**Step 4: Run audits and repository checks**

Run: `npm audit --omit=dev --registry=https://registry.npmjs.org`

Run: `npm audit --registry=https://registry.npmjs.org`

Run: `git diff --check origin/master...HEAD`

Expected: zero vulnerabilities and no whitespace errors.

**Step 5: Request independent review**

Review the implementation against Issue #13 and the merged Spec PR, with special attention to detached work, timer/listener cleanup, parent abort behavior, and truthful late-fulfillment reporting.

**Step 6: Commit any test-only correction**

```bash
git add tests src/renderer/services
git commit -m "test: verify tool timeout settlement"
```
