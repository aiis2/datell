# Filtered KPI Validation Design

## Goal

Prevent future reports from exporting with partial filter linkage where charts or tables respond to filters but summary KPI cards stay static.

## Decision Summary

- Keep both runtime paths valid:
  - `data-sql` + `__report_data_context__`
  - Manual `filterChange` / `cardUpdate` listeners
- In pages that contain filter UI, KPI-style summary cards are treated as dynamic by default.
- Allow a narrow opt-out for fixed explanatory cards through `data-kpi-static="true"`.
- Upgrade "filter exists but KPI has no update path" from an implicit gap to an explicit validation error.

## Problem

The current prompt and validator only enforce that a filtered report has some update path somewhere on the page. That still allows half-linked HTML where charts and tables redraw while top KPI summaries remain initial static values.

This creates a bad exported report even though the export bundle and runtime are healthy.

## Scope

### In Scope

- Prompt rules for filtered reports in [src/renderer/prompts/systemPrompt.ts](src/renderer/prompts/systemPrompt.ts)
- Interactivity validation in [src/renderer/utils/reportInteractivityValidation.ts](src/renderer/utils/reportInteractivityValidation.ts)
- Regression tests for the new validator behavior
- Documentation of the new contract in the filter linkage plan doc

### Out of Scope

- Forcing all filtered reports onto DuckDB / `data-sql`
- Reworking existing runtime event semantics in `interactivity-engine.js`
- Retrofitting already exported files on disk

## Contract

### 1. Filtered pages default KPI summaries to dynamic

If a report contains filter controls, any KPI-style summary card is assumed to reflect filterable data unless it is explicitly marked static.

### 2. Static KPI summaries require an explicit opt-out

Use `data-kpi-static="true"` only for fixed benchmark, target, explanation, or annotation cards that should not change with the current filter state.

### 3. Dynamic KPI summaries must expose an update path

Accepted paths:

1. SQL-driven refresh
   - KPI card has `data-card-id`
   - KPI card also has `data-sql`
   - Page provides `__report_data_context__`

2. Manual client-side refresh
   - KPI card has `data-card-id`
   - Page script listens to `filterChange` or `cardUpdate`
   - The script references that KPI card's `data-card-id` and updates the DOM for that KPI

### 4. Invalid state

If filter UI exists and a non-static KPI card has neither `data-sql` nor a detectable manual refresh path, the HTML is invalid and must be blocked during report generation.

## Validation Strategy

Add a dedicated error in [src/renderer/utils/reportInteractivityValidation.ts](src/renderer/utils/reportInteractivityValidation.ts):

- Code: `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC`
- Severity: `error`
- Message: call out that filtered KPI summaries are missing a refresh path

### Detection rules

1. Detect filter UI using the existing filter markers.
2. Detect KPI-style cards by class and `data-card-id` patterns.
3. Exclude cards with `data-kpi-static="true"`.
4. Treat a KPI card as valid when either:
   - the card element itself carries `data-sql`, or
   - HTML contains a `filterChange` / `cardUpdate` listener that references the KPI card id.

The validator only needs to be strong enough to reject missing update paths like the current regression sample. It does not need full JS semantic analysis.

## Prompt Changes

Update [src/renderer/prompts/systemPrompt.ts](src/renderer/prompts/systemPrompt.ts) so filtered reports must satisfy all of the following:

- charts, tables, and affected KPI summaries must all have refresh paths
- static KPI cards are only allowed with `data-kpi-static="true"`
- exporting a page where only charts or tables update is invalid

## Test Strategy

### Validator regression tests

Extend [tests/report-interactivity-validation.test.cjs](tests/report-interactivity-validation.test.cjs) with three cases:

1. Filtered page where charts update but KPI remains static -> must fail with `FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC`
2. Filtered page with `data-kpi-static="true"` KPI -> must pass
3. Filtered page with manual KPI `filterChange` or `cardUpdate` update logic -> must pass

### Prompt regression test

Add a focused prompt test to ensure the generated system prompt explicitly requires filtered KPI summaries to refresh and documents the `data-kpi-static` opt-out.

## Risks

- Overly broad KPI detection could flag decorative metric blocks that are not summaries.
- Overly weak manual-update detection could let some bad pages slip through.
- The manual-update heuristic only looks for same-script `filterChange` / `cardUpdate` listeners plus explicit `data-card-id` references and DOM update calls.

The chosen mitigation is "default strict, explicit static opt-out" plus narrow heuristics tied to `data-card-id` and the `kpi-*` class family.

## Acceptance Criteria

1. Generated prompt explicitly states that filtered KPI summaries must update.
2. Validator rejects filtered reports with non-static KPI cards that lack refresh paths.
3. Static KPI cards can be declared intentionally and pass validation.
4. Existing valid filtered reports that already refresh KPI cards continue to pass.