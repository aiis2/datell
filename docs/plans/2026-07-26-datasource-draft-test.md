# Datasource Draft Connection Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Test connection validate the current datasource form draft without saving it or testing stale persisted values.

**Architecture:** Add a non-persistent draft-test service in the main process, share the existing driver probe, carry the typed draft through IPC/store, and make the settings handler call it directly.

**Tech Stack:** TypeScript, Electron IPC/context bridge, Zustand, mysql2/pg, Node.js built-in test runner.

**Issue:** #99

---

### Task 1: Add RED service and renderer contract tests

**Files:**

- Create: `tests/datasource-draft-test.test.cjs`

**Step 1: Write the main-service regression**

Load `src/main/datasource.ts` with a temporary data directory and mocked database driver. Save one original datasource, obtain its masked renderer form, and call the wished-for `testDatasourceConfig` with an edited host.

Assert:

- the driver receives the edited host and other draft fields;
- `__MASKED__` is replaced by the original stored password;
- stored config still contains the old host;
- a new draft with an explicit password is tested but not added;
- a failed draft test also leaves persisted config unchanged.

**Step 2: Write renderer/IPC contract assertions**

Assert that main, preload, renderer API types, and datasource store expose `datasource:testConfig` / `testDatasourceConfig(config)`. Narrow `SettingsModal` to `handleTest` and require `testDatasourceConfig(buf)` while forbidding save/reload/selection/mode calls in that handler.

**Step 3: Run RED**

```bash
node --test tests/datasource-draft-test.test.cjs
```

Expected on `origin/master`: missing `testDatasourceConfig` export/IPC and stale save-by-ID renderer path.

**Step 4: Commit RED**

```bash
git add tests/datasource-draft-test.test.cjs
git commit -m "test: reproduce datasource draft connection testing"
```

### Task 2: Add the non-persistent main-process draft test

**Files:**

- Modify: `src/main/datasource.ts`

**Step 1: Extract the shared probe**

Move type dispatch plus `SELECT 1` and result formatting into an internal function accepting a full `DatasourceConfig`. Keep `testDatasource(id)` behavior unchanged by loading the stored config then calling it.

**Step 2: Resolve masked credentials and test drafts**

Export `testDatasourceConfig(config)`. Copy the draft, replace `__MASKED__` only with the password stored under the same ID, and call the shared probe without writing config.

### Task 3: Wire draft test through Electron and the settings form

**Files:**

- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/types/index.ts`
- Modify: `src/renderer/stores/datasourceStore.ts`
- Modify: `src/renderer/components/SettingsModal.tsx`

**Step 1: Add typed IPC/store methods**

Register `datasource:testConfig`, expose it in preload and renderer declarations, and add `testDatasourceConfig(config)` to the Zustand store.

**Step 2: Make Test use the buffer**

Destructure the new store action and replace `handleTest`'s ID/save branch with `await testDatasourceConfig(buf)`. Do not change Save.

**Step 3: Run focused GREEN**

```bash
node --test tests/datasource-draft-test.test.cjs
```

Expected: all service and structure tests pass.

**Step 4: Commit implementation**

```bash
git add src/main/datasource.ts src/main/main.ts src/main/preload.ts src/renderer/types/index.ts src/renderer/stores/datasourceStore.ts src/renderer/components/SettingsModal.tsx
git commit -m "fix: test datasource drafts without saving"
```

### Task 4: Full verification

```bash
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
npx vite build
node scripts/smoke-report-preview-isolation.cjs --expect-isolated
node scripts/smoke-export-origin-isolation.cjs --expect-isolated
node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
npm audit --audit-level=high --registry=https://registry.npmjs.org
```

Record production and development audit results separately. Review `git diff origin/master...HEAD` and confirm the implementation PR contains only the RED test and scoped datasource test path.
