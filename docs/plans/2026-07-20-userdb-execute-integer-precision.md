# UserDB executeUserDBSQL Integer Precision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve integers beyond JS safe range in `executeUserDBSQL` row results.

**Architecture:** `safeIntegers(true)` + `normalizeVisibleInteger` on the reader path (same as export/preview).

**Issue:** #65

---

### Task 1: Red tests

Create `tests/userdb-execute-integer-precision.test.cjs`:

- SELECT unsafe positive/negative integers → full digit strings in `rows`.
- Safe integer remains a number.
- WITH-SELECT still returns rows.

Commit: `test: reproduce userdb execute integer precision loss`

### Task 2: Implement

Modify `src/main/userdb.ts` `executeUserDBSQL` reader branch.

Commit: `fix: preserve large integers in userdb execute results`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
