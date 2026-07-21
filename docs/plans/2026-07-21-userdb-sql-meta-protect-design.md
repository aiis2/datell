# UserDB SQL Console Meta Drop/Rename Protection Design

## Mainline

This design starts from authoritative `origin/master@5bbe42f` and addresses Issue #80 (or the number assigned at open time).

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Managed `dropTable` / `renameTable` now refuse the reserved meta table `__col_comments` (#77 / #79). The SQL console entry `executeUserDBSQL` still prepares and runs arbitrary single statements, including:

1. `DROP TABLE __col_comments` / `DROP TABLE IF EXISTS __col_comments` — permanently destroys all column comments.
2. `ALTER TABLE __col_comments RENAME TO <other>` — detaches the comment store; helpers look up the exact name `__col_comments` and stop working; the orphaned table is no longer filtered as meta.

Chat/read-only mode already blocks DDL via `isReadOnlyUserDBSql`, but the interactive SQL console uses the RW path.

## Invariant

`executeUserDBSQL` must never drop the reserved meta table or rename it away from `__col_comments`. Ordinary user-table DDL/DML and read queries through the same entry remain allowed.

## Chosen Design

### Guard at the SQL entry (fail closed)

In `executeUserDBSQL` (or a small helper it calls **before** `db.prepare` / `run`), detect statements that target `__col_comments` for:

1. **Drop:** `DROP TABLE` / `DROP TABLE IF EXISTS` with object name `__col_comments` (optional schema prefix; quoted/unquoted; case-insensitive name).
2. **Rename-from:** `ALTER TABLE … RENAME TO …` where the source table is `__col_comments` (same name matching).

On match: throw a clear error (e.g. `Cannot drop or rename reserved table __col_comments` or reuse `Unknown table` / `Invalid reserved table name` style) and do not execute.

Reuse comment-stripping / string-literal-neutralization patterns from `sqlReadOnlyGuard.ts` when convenient so comments and string literals cannot hide the keywords; keep the matcher narrow so normal user-table `DROP`/`ALTER RENAME` still work.

### Scope boundaries

| In scope | Out of scope |
|----------|--------------|
| DROP TABLE targeting meta | Full SQL sandbox |
| ALTER TABLE meta RENAME TO | Blocking INSERT/UPDATE into meta via SQL |
| Single-statement console SQL | Multi-statement scripts (already not a product focus) |
| Shipped `executeUserDBSQL` IPC path | Renderer UI changes |

### Name matching

Match the reserved identifier `__col_comments` case-insensitively after stripping SQL comments and neutralizing string literals. Accept common quoting (`"__col_comments"`, `` `__col_comments` ``, `[__col_comments]`) and optional `main.` schema prefix. Prefer false-positive-safe: only refuse when the **target object** of DROP/ALTER-RENAME is the meta table, not when the name appears only inside a string or comment.

## Alternatives Rejected

### Rely only on managed API guards

SQL console bypasses managed APIs; integrity hole remains for power users and future IPC callers.

### Block all DDL in executeUserDBSQL

Breaks legitimate console use (CREATE/DROP/ALTER user tables) which is a product feature.

### SQLite authorizer callback

More complete but heavier and harder to test/maintain for this narrow integrity hole; can be a follow-up if needed.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Regex false positive on user table named similarly | Exact reserved name only |
| Quoted / schema-qualified forms slip through | Cover common forms in tests; fail closed on resolved name when cheap |
| DROP IF EXISTS missing-table path | Still refuse when name is reserved even if IF EXISTS |
| Comment/string smuggling | Strip comments + neutralize literals before match |

## Verification Strategy

Product CJS tests driving `executeUserDBSQL`:

1. Seed comments so meta exists with rows.
2. `DROP TABLE __col_comments` (and IF EXISTS variant) throws; meta + rows remain.
3. `ALTER TABLE __col_comments RENAME TO …` throws; name + rows remain.
4. User-table create/drop/rename or INSERT/SELECT via SQL still succeeds.
5. Full suite + both tsc clean.
