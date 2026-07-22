# UserDB Meta Table Row/Schema Ops Protection Design

## Mainline

This design starts from authoritative `origin/master@ea72ca0` and addresses Issue #84 (or the number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Reserved meta table `__col_comments` stores column comments. Prior work refuses managed drop/rename of the table (#77/#79) and SQL-console DROP/ALTER RENAME (#80/#82). Schema listing hides meta. `exportTableData` and `addColumn` already refuse meta.

Probe on tip still shows:

| API | Behavior today |
|-----|----------------|
| `getUserDBTableData` | Returns meta rows (exposes internal store) |
| `batchInsert` | Inserts into meta (corrupts comments) |
| `updateRow` | Updates meta cells (corrupts comments) |
| `renameColumn` on meta | Renames `comment` → e.g. `comment2` (breaks helpers) |

Root cause: `inspectTableIdentity` and `renameColumn` do not apply the reserved-table guard used by sibling managed APIs.

## Invariant

Managed row preview/edit/insert and column rename must never target `__col_comments`. The meta table is only maintained by internal comment helpers (`ensureColumnCommentsMeta`, rewrite/delete helpers, `alterColumn` comment path). Normal user tables remain fully operable.

## Chosen Design

### Shared reserved check

Reuse the same rule as `dropTable` / `exportTableData` / `addColumn`:

- Reject when `tableName` is empty, matches `sqlite_*`, or equals `__col_comments` (exact string match consistent with existing managed APIs).

Apply at the start of:

1. `getUserDBTableData`
2. `updateRow` (before openDB / identity — or via hardening `inspectTableIdentity` used by both update and batchInsert)
3. `batchInsert` (same)
4. `renameColumn` (table target)

Prefer hardening **`inspectTableIdentity`** so every caller that uses it for user-facing table ops refuses meta automatically (`getUserDBTableData`, `updateRow`, `batchInsert`, and any future consumer). Still add an explicit guard on `renameColumn` because it does not use `inspectTableIdentity`.

Throw style: `Unknown table: __col_comments` (match siblings).

### Out of scope this cycle

- SQL console INSERT/UPDATE/DELETE on meta (security-last).
- Changing how comments are stored or listed.

## Alternatives Rejected

### UI-only hide

IPC can still call updateRow/batchInsert; fail closed in main process.

### Allow read-only getTableData on meta

Still exposes internal store; product already hides meta in schema—keep consistent refuse.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Break tests that read meta via getTableData | Unlikely; suite uses raw better-sqlite3 for meta asserts |
| Case variants of name | Match sibling exact-equality style |

## Verification Strategy

Product CJS tests:

1. Seed comments so meta exists.
2. `getUserDBTableData` / `batchInsert` / `updateRow` / `renameColumn` on meta throw; meta schema columns and rows unchanged (no hijack).
3. Same APIs on normal user table still succeed.
4. Full suite + both tsc clean.
