# UserDB SQL Console Meta VIRTUAL TABLE / TEMP VIEW Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console CREATE VIRTUAL TABLE and TEMP/WITH CREATE VIEW of reserved `__col_comments`.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` only.

**Issue:** #108

---

### Task 1: Red tests

Modify `tests/userdb-sql-meta-protect.test.cjs`:

1. `CREATE VIRTUAL TABLE __col_comments USING fts5(x)` throws reserved.
2. `CREATE TEMP VIEW __col_comments AS SELECT 1 AS n` throws reserved.
3. `CREATE TEMPORARY VIEW "__col_comments" AS SELECT 1 AS n` throws reserved.
4. `WITH x AS (SELECT 1 AS n) CREATE VIEW __col_comments AS SELECT * FROM x` throws reserved.
5. Controls: non-reserved virtual table / temp view CREATE do not throw.

Commit: `test: reproduce SQL VIRTUAL/TEMP VIEW create of __col_comments`

### Task 2: Implement

Modify `src/main/sqlReadOnlyGuard.ts`:

1. CREATE VIEW: add `WITH_PREFIX` + optional TEMP/TEMPORARY.
2. Add CREATE VIRTUAL TABLE reserved-name matcher.
3. Keep prior matchers.

Commit: `fix: refuse SQL VIRTUAL/TEMP VIEW create of __col_comments`

### Task 3: Verify

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
