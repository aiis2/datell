# UserDB Export Integrity Design

## Mainline

This design starts from authoritative `origin/master@48bd43a` and addresses Issue #40.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`exportTableData` runs `SELECT * FROM "table" LIMIT 100000`. Larger tables download as if complete while omitting rows. Empty tables return `''` for CSV, so re-import has no headers. Missing tables currently yield empty success content instead of a clear failure.

## Invariant

Managed export must either return the full table contents (all columns, all rows) or fail with an explicit error. It must never silently return a partial dataset as success. Empty tables still produce a schema-faithful empty payload (CSV headers / JSON `[]`).

## Chosen Design

1. **Resolve the table** (case-insensitive via `sqlite_master`, type `table` or allow views if currently selectable — prefer tables only to match management export UI).
2. **Read columns from `PRAGMA table_info`** so empty tables still have headers.
3. **Select all rows without `LIMIT`** for desktop local SQLite exports.
4. **CSV**: header line from column names, then one line per row with existing escape rules.
5. **JSON**: array of row objects (empty table → `[]`).
6. **Unknown table**: throw `Unknown table: ...`.

No IPC signature change. Optional later: streaming / file-path export for multi-GB tables — out of scope.

## Alternatives Rejected

### Keep LIMIT and add a truncated flag

Still risks users missing the flag in UI; hard incomplete success remains possible if UI ignores it. Prefer full export for local-first desktop sizes.

### Fail when rowCount > 100000

Safer than silent truncate but worse UX for legitimate large demos; full export is acceptable for better-sqlite3 in-process use.

### Export only via SQL console

Does not fix the management Export button path.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Very large tables exhaust memory | Acceptable for current product; document future streaming export |
| Views / virtual tables | Resolve real objects; reject unknown names |

## Verification Strategy

1. Product tests: empty CSV headers, full row count without artificial cap, unknown table throws.
2. Red on current master (LIMIT 100000 path), green after fix.
3. Full CJS suite + both `tsc` checks.
