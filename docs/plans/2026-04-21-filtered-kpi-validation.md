# Filtered KPI Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Block generation of filtered reports whose KPI summary cards do not refresh with the active filter state unless those KPI cards are explicitly marked static.

**Architecture:** Strengthen the prompt contract and the interactivity validator together. The validator remains heuristic-based, but it moves from page-level "some update path exists" checks to KPI-aware checks keyed by `data-card-id`, while preserving both SQL-driven and manual `filterChange` / `cardUpdate` implementations.

**Tech Stack:** TypeScript, ts-node-based CJS tests, Electron renderer prompt tooling

---

### Task 1: Add validator regression tests first

**Files:**
- Modify: `tests/report-interactivity-validation.test.cjs`

**Step 1: Write the failing test**

Add three assertions:

- filtered chart page + static KPI summary without update path -> expect `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC`
- filtered page + `data-kpi-static="true"` KPI -> expect pass
- filtered page + manual KPI `filterChange` or `cardUpdate` update logic -> expect pass

**Step 2: Run test to verify it fails**

Run: `node tests/report-interactivity-validation.test.cjs`
Expected: FAIL because the validator does not yet emit `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC`

**Step 3: Write minimal implementation**

Do not touch the prompt yet. Only add the failing regression coverage.

**Step 4: Run test to verify it fails for the right reason**

Run: `node tests/report-interactivity-validation.test.cjs`
Expected: FAIL with the new assertion, not with syntax or import errors

### Task 2: Implement KPI-aware validation

**Files:**
- Modify: `src/renderer/utils/reportInteractivityValidation.ts`
- Test: `tests/report-interactivity-validation.test.cjs`

**Step 1: Write the failing test**

Reuse Task 1 red tests. Do not add new production code before observing the failure.

**Step 2: Run test to verify it fails**

Run: `node tests/report-interactivity-validation.test.cjs`
Expected: FAIL on missing `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC`

**Step 3: Write minimal implementation**

Implement only what the tests require:

- detect KPI-style cards carrying `data-card-id`
- ignore cards with `data-kpi-static="true"`
- treat `data-sql` KPI cards as valid
- treat card-id-referenced `filterChange` / `cardUpdate` paths as valid
- emit `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC` when needed

**Step 4: Run test to verify it passes**

Run: `node tests/report-interactivity-validation.test.cjs`
Expected: PASS

### Task 3: Add a prompt regression test

**Files:**
- Create: `tests/system-prompt-filtered-kpi.test.cjs`
- Modify: `src/renderer/prompts/systemPrompt.ts`

**Step 1: Write the failing test**

Create a focused test that builds the system prompt and asserts it contains:

- filtered KPI summaries must refresh with filters
- `data-kpi-static="true"` is the only explicit static opt-out

**Step 2: Run test to verify it fails**

Run: `node tests/system-prompt-filtered-kpi.test.cjs`
Expected: FAIL because the prompt does not yet mention the new KPI rule

**Step 3: Write minimal implementation**

Update [src/renderer/prompts/systemPrompt.ts](src/renderer/prompts/systemPrompt.ts) only in the filter-contract sections. Do not refactor unrelated prompt text.

**Step 4: Run test to verify it passes**

Run: `node tests/system-prompt-filtered-kpi.test.cjs`
Expected: PASS

### Task 4: Document the rule in the linkage plan

**Files:**
- Modify: `docs/plan/tech-13-filter-linkage-issues-and-plan.md`

**Step 1: Write the documentation change**

Add a short note that filtered reports must update affected KPI summaries, and static KPI cards require `data-kpi-static="true"`.

**Step 2: Verify the wording matches the validator contract**

Check that the doc language matches the error condition and opt-out marker exactly.

### Task 5: Run final verification

**Files:**
- Test: `tests/report-interactivity-validation.test.cjs`
- Test: `tests/system-prompt-filtered-kpi.test.cjs`

**Step 1: Run targeted tests**

Run: `node tests/report-interactivity-validation.test.cjs`
Expected: PASS

Run: `node tests/system-prompt-filtered-kpi.test.cjs`
Expected: PASS

**Step 2: Run TypeScript error check on touched files if needed**

Run: `npm run build:win`
Expected: existing build still succeeds if a broader verification pass is needed

**Step 3: Summarize the behavioral outcome**

Confirm that future filtered reports will be blocked unless dynamic KPI cards either refresh or explicitly opt out.