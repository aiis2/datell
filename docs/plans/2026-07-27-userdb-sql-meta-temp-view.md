# UserDB SQL Console Meta TEMP / VIEW / WITH-CREATE Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console TEMP/TEMPORARY CREATE TABLE, CREATE VIEW, and WITH-prefixed CREATE TABLE of reserved `__col_comments`.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` only; single call site in `executeUserDBSQL` unchanged.

**Issue:** #105

---

### Task 1: Red tests

**Files:**

- Modify: `tests/userdb-sql-meta-protect.test.cjs`

Add cases:

1. `CREATE TEMP TABLE __col_comments (x INTEGER)` throws with reserved message (before product meta exists).
2. `CREATE TEMPORARY TABLE "__col_comments" (x INTEGER)` throws.
3. `CREATE VIEW __col_comments AS SELECT 1 AS n` throws.
4. `WITH x AS (SELECT 1 AS n) CREATE TABLE __col_comments AS SELECT * FROM x` (or column-list form if preferred) throws.
5. Controls: `CREATE TEMP TABLE ok_tmp (x INTEGER)` succeeds; `CREATE VIEW ok_view AS SELECT 1 AS n` succeeds.

Commit: `test: reproduce SQL TEMP/VIEW/WITH create of __col_comments`

### Task 2: Implement

**Files:**

- Modify: `src/main/sqlReadOnlyGuard.ts`

1. Update CREATE TABLE regex: optional `WITH_PREFIX`, optional `TEMP(ORARY)?`, optional `IF NOT EXISTS`, optional schema, capture table name.
2. Add CREATE VIEW regex with optional `IF NOT EXISTS` / schema; refuse reserved name.
3. Keep prior matchers.

Commit: `fix: refuse SQL TEMP/VIEW/WITH create of __col_comments`

### Task 3: Verify

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
