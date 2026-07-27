# Datasource Save Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make main-process `saveDatasource` refuse blank identity fields and invalid ports, and trim persisted strings.

**Architecture:** Validate/normalize inside `src/main/datasource.ts`; cover with a temp-data-dir CJS product test.

**Issue:** #123

---

### Task 1: Red tests

Create `tests/datasource-save-validation.test.cjs`:

1. Load `src/main/datasource.ts` with mocked `getDataDir` temp root.
2. Assert throws for empty/blank `name`, `host`, `database`.
3. Assert throws for ports: `-1`, `0`, `1.5`, `65536`, `NaN`.
4. Assert valid save trims fields and persists.
5. Assert update with `__MASKED__` preserves stored password.

Commit: `test: reproduce datasource save validation`

### Task 2: Implement

Modify `src/main/datasource.ts` `saveDatasource` to validate and trim.

Commit: `fix: validate datasource fields on save`

### Task 3: Verify

```bash
node --test tests/datasource-save-validation.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
