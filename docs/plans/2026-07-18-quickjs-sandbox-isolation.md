# QuickJS Sandbox Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the bypassable host JavaScript evaluator with a resource-limited QuickJS WASM realm while preserving synchronous calculation and log output.

**Architecture:** Load one release QuickJS WASM module lazily, but create and dispose a fresh runtime and context for every tool call. The isolated context receives only a `console.log` bridge; it has no module loader or host capabilities, and its heap, stack, and execution time are bounded by the runtime.

**Deferred capability:** Network access is allowed by product policy, but its bounded bridge is scheduled for the final sandbox phase. This plan closes the already-reproduced host escape without delaying higher-priority functional work.

**Tech Stack:** TypeScript, Node test runner scripts, Vite, Electron renderer, `quickjs-emscripten-core`, `@jitl/quickjs-wasmfile-release-sync`.

---

### Task 1: Prove the Existing Escape

**Files:**
- Modify: `tests/security-run-js-sandbox.test.cjs`

**Step 1: Write the failing regression test**

Add an execution assertion for a payload whose dangerous identifiers are split across strings:

```js
const escaped = await runJsSandboxTool.execute({
  code: `result = Object['con' + 'structor']('return typeof pro' + 'cess')()`,
});
assert.doesNotMatch(escaped, /object/, 'sandbox must not expose the host process global');
```

Also add a direct capability probe that returns the types of `process`, `require`, `fetch`, `window`, and `document`; every value must be `undefined` inside the isolated runtime.

**Step 2: Run the test to verify it fails**

Run: `node tests/security-run-js-sandbox.test.cjs`

Expected: FAIL because the obfuscated payload returns `object` on the current inline evaluator.

**Step 3: Commit the red test**

```bash
git add tests/security-run-js-sandbox.test.cjs
git commit -m "test: reproduce sandbox host escape"
```

### Task 2: Add the Minimal QuickJS Runtime Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Install only the release sync runtime**

Run:

```bash
npm install quickjs-emscripten-core@0.32.0 @jitl/quickjs-wasmfile-release-sync@0.32.0
```

Expected: the two direct dependencies and their FFI dependency are recorded without adding debug or asyncify variants.

**Step 2: Verify dependency health**

Run: `npm audit --registry=https://registry.npmjs.org/`

Expected: `found 0 vulnerabilities`.

### Task 3: Replace Host Evaluation With QuickJS

**Files:**
- Modify: `src/renderer/tools/runJsSandbox.ts`
- Test: `tests/security-run-js-sandbox.test.cjs`

**Step 1: Load the minimal WASM variant lazily**

Use one cached module promise:

```ts
import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';

let quickJSModulePromise: Promise<QuickJSWASMModule> | null = null;

function loadQuickJS(): Promise<QuickJSWASMModule> {
  quickJSModulePromise ??= newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
  return quickJSModulePromise;
}
```

**Step 2: Create a limited runtime per invocation**

Use constants for a 16 MiB heap and 512 KiB stack. Set the interrupt handler with `shouldInterruptAfterDeadline(Date.now() + timeoutMs)`. Do not install a module loader.

**Step 3: Expose only console logging**

Create a QuickJS `console` object and a host `log` function. Dump each argument while it is still inside the callback, append the formatted values to a host string array, then dispose the temporary handles according to the library ownership rules.

**Step 4: Evaluate a result wrapper**

Evaluate user code as a script inside an IIFE:

```js
(() => {
  let result;
  USER_CODE
  return result;
})()
```

Dump the successful value and feed it to the existing Markdown formatter. On an error handle, dump it, classify interruption and allocation messages, dispose the handle, and throw a user-facing `Error`.

**Step 5: Remove the bypassable implementation**

Delete `BLOCKED_GLOBALS`, the denylist validator, `AsyncFunction`, the inline fallback, the Blob Worker source, and the browser Worker dispatch. The security boundary must be the isolated realm, not source matching.

**Step 6: Dispose resources deterministically**

Dispose all created QuickJS handles, the context, and the per-call runtime in `finally`. Keep the cached top-level module alive for reuse.

**Step 7: Run the focused test to verify green**

Run: `node tests/security-run-js-sandbox.test.cjs`

Expected: PASS; the obfuscated payload cannot observe the host process and ordinary calculation still returns `6`.

### Task 4: Verify Resource Limits and Compatibility

**Files:**
- Modify: `tests/security-run-js-sandbox.test.cjs`

**Step 1: Add an infinite-loop deadline test**

Execute `while (true) {}` with `timeout_ms: 1000`. Assert the response reports timeout or interruption and the wall-clock duration stays below five seconds.

**Step 2: Add compatibility assertions**

Cover object/array results and multiple `console.log` arguments. Assert output retains the existing Chinese Markdown labels.

**Step 3: Add module and capability assertions**

Assert dynamic import fails and constructor-chain access reaches only the QuickJS realm, where host capabilities are `undefined`.

**Step 4: Run the focused test**

Run: `node tests/security-run-js-sandbox.test.cjs`

Expected: PASS with `security run js sandbox guard ok`.

**Step 5: Commit the implementation**

```bash
git add package.json package-lock.json src/renderer/tools/runJsSandbox.ts tests/security-run-js-sandbox.test.cjs
git commit -m "fix: isolate sandbox execution with quickjs"
```

### Task 5: Replace Text-Based SVG Sanitization

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/utils/svgSanitizer.ts`
- Modify: `tests/security-svg-sanitizer.test.cjs`

**Step 1: Add failing encoded-protocol and animation tests**

Add SVG containing `href="jav&#x61;script:..."`, `<animate attributeName="href">`, and `<set attributeName="onload">`. Assert no navigable `href`, animation element, event attribute, or executable protocol survives.

Run: `node tests/security-svg-sanitizer.test.cjs`

Expected: FAIL because the regular-expression sanitizer retains the entity-encoded URL and animation elements.

**Step 2: Install the XML parser**

Run: `npm install @xmldom/xmldom@0.9.10 --save-exact`

Expected: `package.json` and `package-lock.json` record the patched XML parser release and `npm audit` remains clean. Do not use versions through `0.8.12`; the current advisory database marks them vulnerable to XML injection and uncontrolled recursion.

**Step 3: Implement structural allowlist sanitization**

Parse `image/svg+xml`, reject doctypes/parser errors/non-SVG roots, recursively remove elements outside the static SVG allowlist, and validate decoded attributes. Allow only fragment URL references and safe presentation style declarations. Serialize the sanitized SVG with `XMLSerializer`.

**Step 4: Verify green**

Run: `node tests/security-svg-sanitizer.test.cjs`

Expected: PASS; ordinary static SVG remains present while encoded protocols, animation, scripts, embedded HTML, event attributes, and external references are absent.

### Task 6: Canonicalize File Authorization

**Files:**
- Modify: `src/main/fileReadGuard.ts`
- Modify: `tests/security-file-read-guard.test.cjs`

**Step 1: Add a failing link-escape regression**

Create a symlink or junction beneath the authorized data directory that targets a sentinel file outside it. Assert `canReadTextFile` rejects the linked path. Skip only when the platform refuses link creation.

Run: `node tests/security-file-read-guard.test.cjs`

Expected: FAIL on platforms that permit the link because lexical containment currently authorizes the external target.

**Step 2: Compare canonical paths**

Resolve existing files and the data directory with `fs.realpathSync.native`. Store explicitly selected files by canonical path and compare canonical candidate paths to the canonical data directory.

**Step 3: Verify green**

Run: `node tests/security-file-read-guard.test.cjs`

Expected: PASS; regular data-directory files and explicitly selected files remain readable, while linked external files and unselected siblings are rejected.

### Task 7: Full Verification and PR Evidence

**Files:**
- Modify: `tests/security-sql-readonly.test.cjs`
- Modify: GitHub Issue `#1`
- Modify: GitHub Spec PR `#2`
- Modify: GitHub Impl PR `#3`

**Step 1: Add the data write/read round-trip regression**

Create a temporary SQLite database, write a sentinel row through an explicitly authorized management operation, read it through SQL accepted by `isReadOnlyUserDBSql`, then attempt a rejected mutation and prove a second read returns the original sentinel unchanged. Always close the database and remove the temporary directory in `finally`.

Run: `node tests/security-sql-readonly.test.cjs`

Expected: PASS with `security sql readonly guard ok`.

**Step 2: Run every CJS test**

Run:

```powershell
$failed=@(); Get-ChildItem tests -Filter *.test.cjs | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count) { throw "Failed: $($failed -join ', ')" }
```

Expected: all tests pass and `$failed` is empty.

**Step 3: Run static and build checks**

Run:

```bash
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json
npx vite build
npm audit --registry=https://registry.npmjs.org/
```

Expected: every command exits 0 and audit reports zero vulnerabilities. Existing bundle-size warnings are recorded for the next optimization cycle rather than hidden.

**Step 4: Execute the forward and reverse SOP audit**

Forward evidence must cover ordinary sandbox calculation, log output, authorized SQLite write, guarded read, and exact sentinel comparison. Reverse evidence must cover obfuscated host escape, module loading, infinite loop interruption, mutating chat SQL rejection, and a post-rejection read proving unchanged state.

**Step 5: Inspect the final diff**

Run: `git diff origin/master...HEAD --stat` and `git diff origin/master...HEAD -- src/renderer/tools/runJsSandbox.ts tests/security-run-js-sandbox.test.cjs package.json`.

Expected: only the security baseline scope and previously documented dependency/metadata cleanup are present.

**Step 6: Push and update PR evidence**

Push `codex/impl-security-baseline`, then update Impl PR #3 with the reproduced root cause, QuickJS architecture, security properties, forward SOP, reverse SOP, data write/read evidence, and exact verification output. Keep Spec PR #2 and Impl PR #3 based on `master`, the repository's authoritative remote mainline.
