# UserDB SQL Console Meta CREATE TRIGGER Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse SQL-console CREATE TRIGGER whose ON target is reserved `__col_comments`.

**Architecture:** Extend `assertUserDBSqlDoesNotMutateMeta` only.

**Issue:** #111

---

### Task 1: Red tests

Modify `tests/userdb-sql-meta-protect.test.cjs`:

1. After seedComments, `CREATE TRIGGER t_ins AFTER INSERT ON __col_comments BEGIN SELECT 1; END` throws reserved.
2. `CREATE TRIGGER t_upd BEFORE UPDATE ON "__col_comments" BEGIN SELECT 1; END` throws reserved.
3. `CREATE TEMP TRIGGER t_del AFTER DELETE ON __col_comments BEGIN SELECT 1; END` throws reserved.
4. Control: `CREATE TRIGGER t_user AFTER INSERT ON users BEGIN SELECT 1; END` succeeds (or does not throw reserved).

Commit: `test: reproduce SQL CREATE TRIGGER ON __col_comments`

### Task 2: Implement

Modify `src/main/sqlReadOnlyGuard.ts`:

Add CREATE [TEMP|TEMPORARY] TRIGGER … ON reserved matcher; keep prior matchers.

Commit: `fix: refuse SQL CREATE TRIGGER ON __col_comments`

### Task 3: Verify

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
