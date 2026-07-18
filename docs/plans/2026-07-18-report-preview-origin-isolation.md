# Report Preview Origin Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run interactive generated reports on a browser-enforced origin that cannot access the privileged Electron renderer, while preserving charting, theming, resizing, errors, and layout editing.

**Architecture:** Register a dedicated `report://localhost` protocol with no preload and load the existing shell from that origin. Authenticate every cross-origin message by source and origin, and replace React's direct nested-document layout inspection with a request/response snapshot produced by the trusted report shell.

**Tech Stack:** Electron custom protocols, React, TypeScript, browser `postMessage`, sandboxed iframes, Node CJS regression tests, Electron smoke verification.

---

### Task 1: Prove the Existing Boundary Failure

**Files:**
- Create: `tests/security-report-preview-isolation.test.cjs`
- Create: `scripts/smoke-report-preview-isolation.cjs`

**Step 1: Add structural red assertions**

Read `ReportPreview.tsx`, `reportShellBridge.ts`, `report-shell.html`, `main.ts`, and `preload.ts`. Assert the baseline shell URL shares the renderer origin, inline report scripts remain executable, both iframe levels restore same-origin, and message listeners do not authenticate their sender.

**Step 2: Add an Electron capability probe**

Launch a minimal temporary Electron fixture using the repository's Electron binary. Expose a sentinel `electronAPI` method only in the privileged top renderer, load the real report shell, render inline report code that probes `top.electronAPI`, and return the observation through a test-only result channel.

**Step 3: Run the tests to verify red**

Run:

```powershell
node tests/security-report-preview-isolation.test.cjs
node scripts/smoke-report-preview-isolation.cjs --expect-exposed
```

Expected: the structural regression fails and the smoke probe confirms the baseline report can observe the privileged API.

**Step 4: Commit red evidence**

```bash
git add tests/security-report-preview-isolation.test.cjs scripts/smoke-report-preview-isolation.cjs
git commit -m "test: reproduce report preview capability exposure"
```

### Task 2: Register the Unprivileged Report Protocol

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/renderer/utils/reportShellBridge.ts`
- Modify: `tests/security-report-preview-isolation.test.cjs`

**Step 1: Register `report` as a privileged custom scheme**

Add a standard, secure, fetch-enabled, stream-enabled scheme without a preload or Node integration. Keep `app` for the privileged renderer.

**Step 2: Serve the correct root**

At `app.whenReady`, serve `report://` from `public/` in development and the resolved renderer `dist` root when packaged. Reuse the existing traversal-safe static response helper.

**Step 3: Resolve the shell URL**

Export `REPORT_SHELL_ORIGIN = 'report://localhost'`. Build the URL with an encoded `parentOrigin` query parameter derived from the current renderer origin.

**Step 4: Run the focused structural test**

Run: `node tests/security-report-preview-isolation.test.cjs`

Expected: protocol and distinct-origin assertions pass; message-authentication assertions remain red.

### Task 3: Authenticate React-to-Shell Messages

**Files:**
- Modify: `src/renderer/utils/reportShellBridge.ts`
- Modify: `src/renderer/components/ReportPreview.tsx`
- Modify: `src/renderer/components/report/LayoutEditor.tsx`
- Modify: `tests/security-report-preview-isolation.test.cjs`

**Step 1: Add reusable source/origin checks**

Export a small predicate that accepts a message only when both its source window and serialized origin match the expected shell.

**Step 2: Guard incoming messages**

Before handling `shell-ready`, `report-error`, or layout responses, require the active `shellRef.current.contentWindow` and `report://localhost` origin.

**Step 3: Use exact target origins**

Replace every React-to-shell `postMessage(..., '*')` call with `REPORT_SHELL_ORIGIN`, including render, theme, clear, resize, and custom CSS commands.

**Step 4: Verify focused tests**

Run: `node tests/security-report-preview-isolation.test.cjs`

Expected: forged renderer-side message cases pass.

### Task 4: Authenticate Shell and Inner-Frame Messages

**Files:**
- Modify: `public/report-shell.html`
- Modify: `tests/security-report-preview-isolation.test.cjs`

**Step 1: Parse and validate the parent origin**

Read `parentOrigin` from the shell URL, accept only `http:`, `https:`, or `app:` origins, and keep it in a closure.

**Step 2: Guard commands**

Require `event.source === window.parent` and the expected parent origin before handling render, theme, clear, resize, custom CSS, or layout-inspection commands.

**Step 3: Guard inner events**

Require `event.source === frame.contentWindow` before accepting inner errors. Reply to the exact validated parent origin rather than `*`.

**Step 4: Keep inner commands scoped**

Use the report-frame window as the exact target for resize and other inner messages. The inner frame stays in the unprivileged report origin.

**Step 5: Verify focused tests**

Run: `node tests/security-report-preview-isolation.test.cjs`

Expected: wrong-source and wrong-origin shell cases pass.

### Task 5: Preserve Layout Editing Across the Origin Boundary

**Files:**
- Modify: `src/renderer/utils/reportShellBridge.ts`
- Modify: `src/renderer/components/ReportPreview.tsx`
- Modify: `public/report-shell.html`
- Modify: `tests/security-report-preview-isolation.test.cjs`

**Step 1: Define request and response payloads**

Add `inspect-layout` with a unique `requestId` and `layout-inspection` with serialized `cards`, `gridColumns`, and the same ID.

**Step 2: Move inspection into the shell**

Port the existing card selectors, label/type derivation, span calculation, and grid-column detection into a shell function that reads only its active inner document and returns plain data.

**Step 3: Await an authenticated response in React**

Make edit-mode entry asynchronous. Send the request to the exact shell origin, accept only a matching authenticated response, time out cleanly, then call `enterEditMode` with the returned snapshot.

**Step 4: Remove direct cross-origin DOM reads**

Delete the `shellRef.contentDocument` and nested `contentDocument` access from `ReportPreview.tsx`. Keep custom CSS changes on the authenticated command channel.

**Step 5: Verify focused tests**

Run: `node tests/security-report-preview-isolation.test.cjs`

Expected: the source contains no top-to-shell DOM inspection and the layout request contract passes unit assertions.

### Task 6: Browser Isolation and Compatibility Verification

**Files:**
- Modify: `scripts/smoke-report-preview-isolation.cjs`
- Modify: GitHub Issue `#4`
- Modify: the Spec PR for this branch
- Modify: the Implementation PR for the implementation branch

**Step 1: Verify the reverse capability probe**

Run: `node scripts/smoke-report-preview-isolation.cjs --expect-isolated`

Expected: report code cannot read `top.electronAPI` or the privileged top document, while the ordinary result channel still works.

**Step 2: Verify supported preview behavior**

The smoke fixture renders a plain report plus representative ECharts, ApexCharts, VTable, filter, theme-update, resize, error, and layout-inspection paths. Assert each returns a positive sentinel after the hostile probe.

**Step 3: Run the full automated matrix**

Run:

```powershell
$failed=@(); Get-ChildItem tests -Filter *.test.cjs | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count) { throw "Failed: $($failed -join ', ')" }
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
npx vite build
npm audit --omit=dev --registry=https://registry.npmjs.org/
npm audit --registry=https://registry.npmjs.org/
```

Expected: all commands exit 0 and both audits report zero vulnerabilities.

**Step 4: Record forward and reverse SOP evidence**

Update Issue #4 and both PRs with exact red evidence, shell/renderer origins, hostile probe results, ordinary chart/theme/layout results, test counts, build output, and audit totals.

