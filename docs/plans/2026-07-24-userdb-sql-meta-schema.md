# UserDB SQL Console Meta Schema Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console `ALTER TABLE` (any clause) and `CREATE [UNIQUE] INDEX … ON` targeting reserved `__col_comments`, without blocking user-table schema SQL or meta SELECT.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` only; single call site in `executeUserDBSQL` unchanged.

**Issue:** #96

---

### Task 1: Red tests

Extend `tests/userdb-sql-meta-protect.test.cjs`:

- After seed: `ALTER TABLE __col_comments RENAME COLUMN comment TO comment2` throws; columns unchanged.
- `ALTER TABLE __col_comments ADD COLUMN x TEXT` throws; columns unchanged.
- `CREATE INDEX idx_meta ON __col_comments(table_name)` throws; no such index.
- Control: `ALTER TABLE users RENAME COLUMN name TO name2` (or ADD on user table) still works; restore or use scratch table; meta SELECT still works.
- Existing DROP/DML cases remain green.

Commit: `test: reproduce SQL schema mutation of __col_comments`

### Task 2: Implement

In `src/main/sqlReadOnlyGuard.ts`:

- Broaden ALTER TABLE matcher to any clause on reserved target.
- Add CREATE [UNIQUE] INDEX … ON reserved table matcher.
- Keep DROP + DML matchers.

Commit: `fix: refuse SQL schema mutation of __col_comments`

### Task 3: Full verification

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
