# UserDB SQL Console Meta DML Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console `INSERT` / `UPDATE` / `DELETE` / `REPLACE` (including `WITH` prefixes) that target the reserved `__col_comments` meta table via `executeUserDBSQL`, without blocking ordinary user-table SQL or read-only `SELECT` on meta.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` in `sqlReadOnlyGuard.ts`; keep the single pre-prepare call in `executeUserDBSQL`.

**Issue:** #93

---

### Task 1: Red tests

Extend `tests/userdb-sql-meta-protect.test.cjs` (or add a tightly related file) so that after seeding column comments:

- `executeUserDBSQL(id, 'DELETE FROM __col_comments')` throws; comment rows remain.
- `executeUserDBSQL(id, "UPDATE __col_comments SET comment = 'x'")` throws; rows unchanged.
- `executeUserDBSQL(id, "INSERT INTO __col_comments (table_name, col_name, comment) VALUES ('t','c','z')")` throws; no injected row.
- `executeUserDBSQL(id, "REPLACE INTO __col_comments (table_name, col_name, comment) VALUES ('t','c','z')")` throws.
- Quoted form `DELETE FROM "__col_comments"` throws.
- `WITH x AS (SELECT 1) DELETE FROM __col_comments` throws.
- Existing DROP / RENAME cases still refuse.
- Control: user-table `INSERT INTO users …` still works; `SELECT * FROM __col_comments` still returns rows (read allowed).

Commit: `test: reproduce SQL DML against __col_comments`

### Task 2: Implement

Modify `src/main/sqlReadOnlyGuard.ts` (`assertUserDBSqlDoesNotMutateMeta`):

- After comment strip / literal neutralization, match INSERT/REPLACE/UPDATE/DELETE whose target table resolves to `__col_comments`.
- Support optional `WITH` CTE prefix and common quoting / schema prefix, consistent with DROP/RENAME matching.
- Throw a clear reserved-table error without preparing the statement.

No change required to the `executeUserDBSQL` call site if it already invokes the guard.

Commit: `fix: refuse SQL DML against __col_comments`

### Task 3: Full verification

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
