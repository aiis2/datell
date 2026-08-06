# Data Directory Set/Migrate Path Guards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Require dialog-selected directory authorization before `fs:setDataDir` / `fs:migrateDataDir` persist or copy into a new data root.

**Architecture:** Directory select guard (remember + canUse) next to or alongside `fileReadGuard`; wire selectDirectory, setDataDir, migrateDataDir.

**Issue:** #138

---

### Task 1: Red tests

Create `tests/data-dir-path-guards.test.cjs`:

1. Export/load `createDirectorySelectGuard` (or shared guard API).
2. Unselected absolute path: `canUseDirectory` false; `assertAuthorizedDirectory` throws stable error.
3. After `rememberSelectedDirectory`, same path allowed.
4. Sibling unselected directory remains denied.
5. Static/main contract: `fs:selectDirectory` remembers; `fs:migrateDataDir` and `fs:setDataDir` call authorization before `setDataDir` / copy.

Prove current mainline lacks the guard / migrate has no authorization call.

Commit: `test: reproduce data dir path escape`

### Task 2: Implement

1. Implement directory select guard module (prefer `src/main/directorySelectGuard.ts` or extend `fileReadGuard.ts` cleanly).
2. Wire main.ts handlers.
3. Stable error message for tests.

Commit: `fix: guard data dir set/migrate paths`

### Task 3: Verify

```bash
node --test tests/data-dir-path-guards.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
