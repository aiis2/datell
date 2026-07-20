# UserDB Export Integer Precision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve integers beyond JS safe range in `exportTableData` JSON and CSV.

**Architecture:** `safeIntegers(true)` on export select + `normalizeVisibleInteger` (or equivalent) before serialize.

**Issue:** #62

---

### Task 1: Red tests

Create `tests/userdb-export-integer-precision.test.cjs` (or extend export integrity tests):

- Unsafe positive INTEGER in JSON is full digit string, not rounded number.
- Unsafe negative INTEGER preserved in JSON and CSV.
- Safe INTEGER remains JSON number / plain CSV digits.

Commit: `test: reproduce userdb export integer precision loss`

### Task 2: Implement safe integer export

Modify `src/main/userdb.ts` `exportTableData`.

Commit: `fix: preserve large integers in userdb export`

### Task 3: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
```
