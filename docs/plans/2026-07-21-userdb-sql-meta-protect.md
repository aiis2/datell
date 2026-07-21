# UserDB SQL Console Meta Drop/Rename Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console statements that drop or rename-from the reserved `__col_comments` meta table via `executeUserDBSQL`, without blocking ordinary user-table SQL.

**Architecture:** Narrow pre-prepare guard at the shipped SQL entry; reuse comment/literal stripping style from `sqlReadOnlyGuard` when natural.

**Issue:** #80 (replace with assigned number if different)

---

### Task 1: Red tests

Create `tests/userdb-sql-meta-protect.test.cjs`:

- Seed column comments so `__col_comments` exists with rows.
- `executeUserDBSQL(id, 'DROP TABLE __col_comments')` must throw; meta + rows remain.
- `executeUserDBSQL(id, 'DROP TABLE IF EXISTS __col_comments')` must throw; meta + rows remain.
- `executeUserDBSQL(id, 'ALTER TABLE __col_comments RENAME TO renamed_meta')` must throw; still named `__col_comments`; rows remain.
- Ordinary user-table SQL still works (e.g. `CREATE TABLE` / `DROP TABLE users` or rename a user table; SELECT/INSERT).

Commit: `test: reproduce SQL drop/rename of __col_comments`

### Task 2: Implement

Modify `src/main/userdb.ts` (and optionally `sqlReadOnlyGuard.ts` if sharing strip helpers is cleaner):

- Before prepare/run in `executeUserDBSQL`, refuse DROP/ALTER-RENAME targeting `__col_comments`.

Commit: `fix: protect __col_comments from SQL drop/rename`

### Task 3: Full verification

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
