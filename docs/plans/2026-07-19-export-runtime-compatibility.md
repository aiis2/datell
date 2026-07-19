# Isolated Export Runtime Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore built-in chart and table runtime compatibility in locked-down in-app exports without reopening arbitrary network or file access.

**Architecture:** Extract a pure runtime inliner, feed it packaged ECharts/ApexCharts/VTable source from the main process, and route Excel through the existing export injector used by PDF/PNG. The export origin/session policy remains unchanged.

**Tech Stack:** TypeScript, Electron main process, Node CJS tests, Electron smoke, Vite.

---

### Task 1: Define the pure runtime transformer with red tests

**Files:**
- Create: `src/main/exportRuntime.ts`
- Create: `tests/export-runtime.test.cjs`

**Step 1: Write the failing tests**

Cover known CDN tag replacement, unconditional ECharts/Apex insertion, conditional VTable insertion, escaped `</script>` literals, head/body/prepend fallbacks, missing source behavior, and rejection of arbitrary URLs.

**Step 2: Run the focused test to verify it fails**

Run: `node --test tests/export-runtime.test.cjs`

Expected: FAIL because the module does not exist on `origin/master@9853553`.

**Step 3: Implement the minimal pure transformer**

Add the typed source interface, known-CDN marker replacement, VTable detection, safe inline script escaping, and deterministic insertion helper.

**Step 4: Run the focused test to verify it passes**

Run: `node --test tests/export-runtime.test.cjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/exportRuntime.ts tests/export-runtime.test.cjs
git commit -m "test: define built-in export runtime injection"
```

### Task 2: Add red integration assertions and compatibility smoke

**Files:**
- Create: `tests/security-export-runtime-compatibility.test.cjs`
- Create: `scripts/smoke-export-runtime-compatibility.cjs`

**Step 1: Write structural assertions**

Assert that `main.ts` reads `vtable.min.js`, delegates to the pure transformer, and passes Excel HTML through the trusted injector. Assert that no new external network exception is added.

**Step 2: Add the Electron fixture**

Load the packaged ECharts, ApexCharts, and VTable source inline under the existing CSP, run minimal chart/table initialization, and emit runtime/table signals plus request logs.

**Step 3: Run red evidence on mainline**

Run the local external-runtime probe and record `file: cdn=true/table=true` versus `export: cdn=false/table=false`. Run structural tests and record the missing Excel injection/VTable requirements.

**Step 4: Commit red tests**

```bash
git add tests/security-export-runtime-compatibility.test.cjs scripts/smoke-export-runtime-compatibility.cjs
git commit -m "test: reproduce blocked built-in export runtime"
```

### Task 3: Integrate the pure transformer

**Files:**
- Modify: `src/main/main.ts`

**Step 1: Read VTable only when needed**

Use `readVendorJs('vtable.min.js')` when the source HTML references VTable; keep ECharts/Apex behavior unchanged.

**Step 2: Delegate JavaScript assembly**

Replace direct runtime string assembly in `injectVendorLibs` with the pure transformer and retain trusted CSS injection.

**Step 3: Route Excel through the injector**

Call `injectVendorLibs(html)` before `createExportRenderer` in `fs:exportExcel`. Keep DOM extraction and final XLSX write logic unchanged.

**Step 4: Run focused tests**

Run: `node --test tests/export-runtime.test.cjs tests/security-export-runtime-compatibility.test.cjs`

Run: `node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated`

Expected: all runtime signals are true and no external request is required.

**Step 5: Commit**

```bash
git add src/main/main.ts
git commit -m "fix: inline built-in runtimes for isolated exports"
```

### Task 4: Verify no security regression

**Files:**
- Modify: `tests/security-export-runtime-compatibility.test.cjs` only if a missing invariant is found

**Step 1: Re-run Issue #7 smoke**

Run: `node scripts/smoke-export-origin-isolation.cjs --expect-isolated`

Expected: file/network/worker/popup probes remain blocked.

**Step 2: Run complete verification**

Run: `node --test tests/*.test.cjs`

Run: `npx tsc --noEmit`

Run: `npx tsc -p src/main/tsconfig.json`

Run: `npx vite build`

Run: `npm audit --omit=dev --registry=https://registry.npmjs.org`

Run: `npm audit --registry=https://registry.npmjs.org`

Run: `git diff --check origin/master...HEAD`

Expected: all tests/compiler/build/audit commands exit 0 with no whitespace errors.

**Step 3: Commit any test-only correction**

```bash
git add tests scripts
git commit -m "test: verify export runtime compatibility"
```
