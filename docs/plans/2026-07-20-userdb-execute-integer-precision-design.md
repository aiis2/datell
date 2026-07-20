# UserDB executeUserDBSQL Integer Precision Design

## Mainline

This design starts from authoritative `origin/master@af4636b` and addresses Issue #65.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

After #62, managed export preserves integers beyond `Number.MAX_SAFE_INTEGER`. Table preview (`getUserDBTableData`) already did. **`executeUserDBSQL` still does not**: SELECT (and other row-returning) paths call `stmt.all()` without `safeIntegers(true)`, so values such as `9007199254740993` become `9007199254740992` in SQL console and chat `userdb:query` results.

## Invariant

Row-returning results from `executeUserDBSQL` preserve integer magnitude using the same normalization rules as table preview and export: safe-range integers as JS numbers; out-of-range integers as full decimal strings.

## Chosen Design

In the `stmt.reader` branch of `executeUserDBSQL`:

1. Call `.safeIntegers(true)` before `.all()`.
2. When mapping each cell, apply `normalizeVisibleInteger` (already used by preview/export).
3. Leave the non-reader (`run`) path unchanged: `changes` + `String(lastInsertRowid)`.

No IPC signature change. `readOnly` guard unchanged.

## Alternatives Rejected

### Only fix renderer display

IPC already lost precision; chat tools and any consumer of query results would still see wrong numbers.

### Always stringify all integers

Breaks normal numeric tooling for small ids; prefer safe-number + unsafe-string like #62.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Downstream code assumes pure numbers | Only unsafe ints become strings; same contract as export #62 |
| Empty result column names | Keep existing `stmt.columns` fallback |

## Verification Strategy

Product tests: SELECT unsafe ± ints → full digit strings; safe int remains number; WITH-SELECT still works. Full suite + tsc.
