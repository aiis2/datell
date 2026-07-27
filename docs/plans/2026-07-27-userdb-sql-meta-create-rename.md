# UserDB SQL Console Meta Create / Rename-Into Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console `CREATE TABLE` of reserved `__col_comments` and `ALTER TABLE … RENAME TO __col_comments`, without blocking ordinary user-table CREATE/RENAME.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` only; single call site in `executeUserDBSQL` unchanged.

**Issue:** #102

---

### Task 1: Red tests

**Files:**

- Modify: `tests/userdb-sql-meta-protect.test.cjs`

**Step 1: Add CREATE / RENAME-into regressions**

After existing seed helpers, add cases:

1. `CREATE TABLE __col_comments (id INTEGER)` throws; `sqlite_master` has no user-created meta-shaped table beyond product seed, and seeded comments remain when meta was product-created first.
2. `CREATE TABLE IF NOT EXISTS "__col_comments" (x TEXT)` throws.
3. Seed users + comments, then `ALTER TABLE users RENAME TO __col_comments` throws; `users` still exists; meta rows still reference `users`.
4. Control: `CREATE TABLE ok_tbl (id INTEGER)` succeeds; `ALTER TABLE ok_tbl RENAME TO ok_tbl2` succeeds.

Commit: `test: reproduce SQL create/rename-into __col_comments`

**Step 2: Run RED**

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
```

Expected on `origin/master`: create/rename-into cases fail (statements currently allowed).

### Task 2: Implement guard extensions

**Files:**

- Modify: `src/main/sqlReadOnlyGuard.ts`

**Step 1: Match CREATE TABLE reserved name**

Add a matcher for:

`CREATE TABLE [IF NOT EXISTS] [schema.]ident …`

Refuse when the captured table name is reserved.

**Step 2: Match RENAME TO reserved destination**

Add a matcher for:

`ALTER TABLE [schema.]ident RENAME TO [schema.]ident`

Refuse when the **destination** identifier is reserved. Do not treat `RENAME COLUMN` as rename-to-table.

**Step 3: Keep prior matchers**

DROP / ALTER-source / CREATE INDEX / DML remain.

### Task 3: Green verification

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```

Commit: `fix: refuse SQL create/rename-into __col_comments`

### Task 4: PR hygiene

Review `git diff origin/master...HEAD` and ensure the implementation PR contains only the RED tests and scoped guard change (spec docs land in the separate spec PR).
