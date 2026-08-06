# Skills Registry Import/Export Path Guards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close unconstrained FS read/write on `skills:registry:import|export` IPC so import requires `textFileReadGuard` authorization and export no longer accepts a renderer-supplied destination path.

**Architecture:** Import authorization helper + `main.ts` wiring; export IPC uses main-process save dialog (no `targetPath` from renderer). Manager path-based export remains for tests only.

**Issue:** #132

---

### Task 1: Red tests

Create `tests/skills-registry-path-guards.test.cjs` (and adjust related expectations if needed):

1. **Import unauthorized:** With a fresh `createTextFileReadGuard(dataDir)`, an outside skill JSON path must fail the authorization helper / product check used by import IPC (do not call `rememberSelectedFile`). Assert the stable error and that the outside file contents are never treated as imported through the guarded path.
2. **Import authorized via select:** After `rememberSelectedFile(outsidePath)`, the same path is allowed and `importRegistrySkill` can load a valid manifest.
3. **Import under DATA_DIR:** A valid manifest file under the app data directory remains readable without an extra pick.
4. **Export surface:** Document/assert the product invariant that IPC export must not copy to a caller-supplied absolute path outside a dialog. Prefer testing a pure “export destination must come from dialog / no raw targetPath” contract once the API changes (e.g. handler signature or helper that refuses empty/untrusted destinations). Until dialog is available in unit tests, assert the shipped preload/handler contract no longer takes `targetPath`, or test a pure guard that rejects export-without-dialog if that shape is chosen.

Prove current mainline fails the unauthorized-import case before the fix (import currently has no guard).

Commit: `test: reproduce skills registry path escape`

### Task 2: Implement

1. Add/export authorization helper used by import (stable error: `文件未通过选择器授权，无法读取`).
2. Wire `skills:registry:import` in `src/main/main.ts` through the helper + `textFileReadGuard`.
3. Change `skills:registry:export` to open `dialog.showSaveDialog` in main; remove renderer `targetPath` from IPC/preload/types.
4. Keep `exportRegistrySkill(id, path)` on the manager for internal/test use.

Commit: `fix: guard skills registry import/export paths`

### Task 3: Verify

```bash
node --test tests/skills-registry-path-guards.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
