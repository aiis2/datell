# UserDB SQL Console Trigger-Body Meta Mutation Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse CREATE TRIGGER whose BEGIN…END body mutates reserved `__col_comments`.

**Architecture:** Extract trigger body and apply existing meta-mutation matchers to each body statement inside `assertUserDBSqlDoesNotMutateMeta`.

**Issue:** #120

---

### Task 1: Red tests

Modify `tests/userdb-sql-meta-protect.test.cjs`:

1. seedComments.
2. `CREATE TRIGGER t_wipe AFTER INSERT ON users BEGIN DELETE FROM __col_comments; END` throws reserved.
3. Meta comments still present; no trigger named `t_wipe`.
4. Control: `CREATE TRIGGER t_ok AFTER INSERT ON users BEGIN SELECT 1; END` succeeds.

Commit: `test: reproduce CREATE TRIGGER body mutating __col_comments`

### Task 2: Implement

Modify `src/main/sqlReadOnlyGuard.ts`:

1. Detect CREATE TRIGGER with BEGIN…END.
2. Split body statements; run meta mutation checks on each.
3. Keep ON-target matcher.

Commit: `fix: refuse CREATE TRIGGER bodies that mutate __col_comments`

### Task 3: Verify

```bash
node --test tests/userdb-sql-meta-protect.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
