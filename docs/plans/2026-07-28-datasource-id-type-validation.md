# Datasource ID and Type Save Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make main-process `saveDatasource` refuse blank `id` and unsupported `type`, and trim persisted ids.

**Architecture:** Extend validators in `src/main/datasource.ts`; product CJS tests with temp data dir.

**Issue:** #126

---

### Task 1: Red tests

Extend or add beside `tests/datasource-save-validation.test.cjs`:

1. Empty / blank `id` throws; nothing persisted.
2. Two sequential empty-id saves must not leave a collapsed row (both throw).
3. Unsupported `type` (`''`, `'sqlite'`) throws.
4. Valid save trims `id` and accepts each supported type.
5. Existing blank-name / port / masked-password cases still pass.

Commit: `test: reproduce datasource id and type validation`

### Task 2: Implement

In `saveDatasource`:

- Validate/trim `id`.
- Validate `type` against `DatasourceType` set.
- Persist trimmed `id`.

Commit: `fix: validate datasource id and type on save`

### Task 3: Verify

```bash
node --test tests/datasource-save-validation.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
