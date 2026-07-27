# UserDB SQL Console Meta CREATE TRIGGER OF Column-List Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse CREATE TRIGGER ON reserved `__col_comments` when an optional `OF column-list` is present.

**Architecture:** Extend the CREATE TRIGGER matcher in `assertUserDBSqlDoesNotMutateMeta` only.

**Issue:** #114

---

### Task 1: Red tests

Modify `tests/userdb-sql-meta-protect.test.cjs`:

1. After seedComments, `CREATE TRIGGER t_of_ins AFTER INSERT OF table_name ON __col_comments BEGIN SELECT 1; END` throws reserved.
2. `CREATE TRIGGER t_of_upd AFTER UPDATE OF table_name, col_name ON "__col_comments" BEGIN SELECT 1; END` throws reserved.
3. Control: `CREATE TRIGGER t_of_user AFTER UPDATE OF name ON users BEGIN SELECT 1; END` succeeds.

Commit: `test: reproduce SQL CREATE TRIGGER OF columns ON __col_comments`

### Task 2: Implement

Modify `src/main/sqlReadOnlyGuard.ts` CREATE TRIGGER regex to accept optional `OF <ident>(, <ident>)*` after INSERT/UPDATE.

Commit: `fix: refuse SQL CREATE TRIGGER OF columns ON __col_comments`

### Task 3: Verify

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
