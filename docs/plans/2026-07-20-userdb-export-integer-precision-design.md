# UserDB Export Integer Precision Design

## Mainline

This design starts from authoritative `origin/master@fa2eae2` and addresses Issue #62.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`exportTableData` runs `SELECT *` without `safeIntegers(true)`. better-sqlite3 coerces SQLite INTEGER into JS `number`, so values outside `Number.MAX_SAFE_INTEGER` silently round before CSV/JSON serialization.

| Path | Stored | Observed |
|------|--------|----------|
| `getUserDBTableData` (safeIntegers + normalize) | `9007199254740993` | `"9007199254740993"` |
| `exportTableData` JSON | same | `9007199254740992` |
| `exportTableData` CSV | same | rounded digit string |

Issue #40 already made export “full rows, no silent LIMIT.” Precision loss is another silent corruption on export/re-import.

## Invariant

Managed export preserves integer magnitude: every SQLite INTEGER value is written as its full decimal representation (or a lossless JSON number when inside the safe integer range). Export must not silently round integers.

## Chosen Design

In `exportTableData`:

1. Prepare `SELECT * FROM …` with `.safeIntegers(true)` so large integers arrive as `bigint`.
2. When building JSON objects and CSV cells, normalize values with the same rules already used for table preview:
   - `bigint` within `Number.isSafeInteger` → JS `number` (JSON number / unquoted CSV digits).
   - `bigint` outside safe range → decimal string (`value.toString()`).
   - other types unchanged (`null` → empty CSV cell / JSON null; text/blob as today).
3. Prefer reusing `normalizeVisibleInteger` (or a shared export normalizer that calls it) so preview and export stay aligned.
4. Keep #40 behavior: no LIMIT, empty CSV headers, unknown table throws, JSON empty `[]`.

No IPC signature change.

## Alternatives Rejected

### Always stringify every integer in JSON

Breaks consumers that expect JSON numbers for normal ids/counts. Prefer safe-range numbers + unsafe strings.

### Leave export as-is; document LIMIT of JS number

Contradicts “full fidelity export” after #40; re-import would corrupt keys.

### Custom JSON bigint replacer only

Still need CSV path; better to normalize once before both serializers.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| JSON type changes for large ints (number → string) | Only outside safe range; required for lossless fidelity |
| BLOB export still `String(blob)` | Pre-existing; out of scope |
| Negative unsafe ints | Cover in tests (`MIN_SAFE - 1` style) |

## Verification Strategy

Product tests with temporary UserDB:

1. Insert unsafe positive and negative integers; JSON contains full digit strings, not rounded numbers.
2. CSV contains the same full digit strings.
3. Safe small integers still appear as JSON numbers / plain digits.
4. Empty-table and unknown-table behavior still match #40.
5. Full `node --test tests/*.test.cjs` + main/renderer tsc clean.
