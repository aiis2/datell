# UserDB SQL Console ATTACH/DETACH Refusal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse ATTACH/DETACH in the UserDB management SQL console.

**Architecture:** Add `assertUserDBSqlConsolePolicy` and call it from `executeUserDBSQL` before prepare/run.

**Issue:** #117

---

### Task 1: Red tests

Create `tests/userdb-sql-attach-detach.test.cjs` (or extend meta suite):

1. `ATTACH DATABASE 'x.db' AS evil` throws `/attach|detach|not permitted/i`.
2. `ATTACH 'x.db' AS evil` throws.
3. `DETACH DATABASE evil` throws.
4. `DETACH evil` throws.
5. Control: `SELECT 1` returns a row.

Commit: `test: reproduce UserDB SQL console ATTACH/DETACH`

### Task 2: Implement

1. In `sqlReadOnlyGuard.ts`, export `assertUserDBSqlConsolePolicy(sql)`.
2. In `userdb.ts` `executeUserDBSQL`, call it before prepare (alongside meta assert).

Commit: `fix: refuse ATTACH/DETACH in UserDB SQL console`

### Task 3: Verify

```bash
node --test tests/userdb-sql-attach-detach.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
