# In-App Export Origin Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Execute AI-generated PDF, PNG, and Excel reports without granting the report document `file://` local-file authority.

**Architecture:** Stage each transformed report in an in-memory job store and serve it from a random-host `export://` URL in a fresh non-persistent Electron session. Enforce a restrictive CSP, a request allowlist, explicit sandbox/window policies, and deterministic cleanup while retaining the existing export extraction and rendering operations.

**Tech Stack:** Electron protocol/session/webRequest, TypeScript, Node CJS tests, Electron smoke fixtures, Vite, TypeScript.

---

### Task 1: Add the failing export document store contract

**Files:**
- Create: `src/main/exportDocumentStore.ts`
- Test: `tests/export-document-store.test.cjs`

**Step 1: Write the failing test**

Cover a job URL with a random host, exact document response, unknown host/path rejection, disposal, and idempotent disposal. Assert that the response includes the export CSP and that the source HTML is never written to a filesystem path by the store.

**Step 2: Run the focused test to verify it fails**

Run: `node --test tests/export-document-store.test.cjs`

Expected: FAIL because the store module and contract do not exist on `origin/master`.

**Step 3: Implement the minimal store**

Add a typed `createExportDocumentJob` API that returns the random URL, request handler, approved asset URLs, and idempotent `dispose`. Match request hostname/path exactly and return `404` for everything else.

**Step 4: Run the focused test to verify it passes**

Run: `node --test tests/export-document-store.test.cjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/exportDocumentStore.ts tests/export-document-store.test.cjs
git commit -m "test: define isolated export document lifecycle"
```

### Task 2: Add red integration structure and browser probes

**Files:**
- Create: `tests/security-export-origin-isolation.test.cjs`
- Create: `scripts/smoke-export-origin-isolation.cjs`

**Step 1: Write structural assertions**

Assert that the main process registers/handles the `export` scheme, creates a job for `fs:exportExcel`, `save-pdf`, and `capture-report`, sets explicit sandbox/window policies, and does not call `loadFile` for transient report HTML.

**Step 2: Write the Electron smoke fixture**

Provide `--expect-file-readable` and `--expect-isolated` modes. The fixture attempts local-file fetch/XHR, popup, navigation, worker, and WebSocket access while also running inline script, ECharts, ApexCharts, and table creation. Emit one JSON marker with all observations.

**Step 3: Run red evidence on the mainline**

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-file-readable`

Expected: the mainline fixture records a `file://` document and reads the sentinel, establishing the vulnerability. Run the structural test and record its missing requirements.

**Step 4: Commit the red tests**

```bash
git add tests/security-export-origin-isolation.test.cjs scripts/smoke-export-origin-isolation.cjs
git commit -m "test: reproduce export renderer file access"
```

### Task 3: Implement session-scoped export protocol and policies

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/exportDocumentStore.ts`

**Step 1: Register the privileged scheme before ready**

Add `export` with only the standard/secure privileges and import Electron `session`.

**Step 2: Implement job/session setup**

Create a fresh non-persistent session per job, register its protocol handler, set CSP/request/permission/download handlers, and return an idempotent cleanup function.

**Step 3: Implement window hardening**

Set sandbox, web security, context isolation, no Node/preload, deny child windows, and cancel main/frame navigation outside the active URL. Add a bounded renderer timeout.

**Step 4: Run focused unit and smoke tests**

Run: `node --test tests/export-document-store.test.cjs tests/security-export-origin-isolation.test.cjs`

Expected: PASS for all structural/store assertions; smoke is still red until the three handlers use the job helper.

**Step 5: Commit**

```bash
git add src/main/main.ts src/main/exportDocumentStore.ts
git commit -m "feat: create isolated export renderer sessions"
```

### Task 4: Migrate PDF, PNG, and Excel handlers

**Files:**
- Modify: `src/main/main.ts`

**Step 1: Replace temporary files**

Use the job helper's URL and `loadURL` in `fs:exportExcel`, `save-pdf`, and `capture-report`. Remove transient HTML `writeFileSync`, `loadFile`, and unlink calls. Keep final user-selected output writes unchanged.

**Step 2: Preserve existing rendering operations**

Retain chart readiness, `PREPARE_EXPORT_SCRIPT`, table extraction, `printToPDF`, `capturePage`, save dialogs, and existing title/theme/layout behavior.

**Step 3: Verify the focused red-green cycle**

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-isolated`

Expected: non-file origin, local-file/XHR/WebSocket/worker/popup/navigation probes blocked, inline scripts and chart/table signals true.

**Step 4: Commit**

```bash
git add src/main/main.ts
git commit -m "fix: render exports outside file origin"
```

### Task 5: Verify compatibility and cleanup

**Files:**
- Modify: `tests/security-export-origin-isolation.test.cjs` if an uncovered regression is found
- Modify: `scripts/smoke-export-origin-isolation.cjs` if probe output needs tightening

**Step 1: Run all focused checks**

Run: `node --test tests/export-document-store.test.cjs tests/security-export-origin-isolation.test.cjs`

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-isolated`

Expected: all focused tests pass and the marker reports cleanup, blocked file access, and intact chart/table signals.

**Step 2: Run the complete verification matrix**

Run: `node --test tests/*.test.cjs`

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Run: `npx vite build`

Run: `npm audit --omit=dev --registry=https://registry.npmjs.org`

Run: `npm audit --registry=https://registry.npmjs.org`

Expected: 0 test failures, both compilers exit 0, production build exits 0, and both audits report 0 vulnerabilities.

**Step 3: Check the diff**

Run: `git diff --check origin/master...HEAD`

Expected: no whitespace errors and only the planned implementation/test files changed.

**Step 4: Commit any test-only correction**

```bash
git add tests scripts
git commit -m "test: verify export renderer compatibility and cleanup"
```
