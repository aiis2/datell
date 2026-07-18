# Security Baseline Optimization Spec

## Issue

The remote default branch is `origin/master`; there is no `origin/main` ref in this repository. This optimization therefore targets `origin/master` as the current authoritative mainline until the repository creates or renames a `main` branch.

The current mainline has a security baseline gap:

- `npm audit --omit=dev --registry=https://registry.npmjs.org/` reports 17 production vulnerabilities.
- Several high-risk production dependencies are not referenced by application source but still ship in dependency metadata.
- User-controlled SQL, SVG markup, text file paths, and JavaScript sandbox code need explicit regression coverage around read-only and sandbox boundaries.

### Sandbox escape audit

The first implementation pass used `AsyncFunction` plus a regular-expression denylist. A follow-up audit proved that this is not a security boundary. The following payload splits dangerous property and global names so the validator accepts it, then recovers the host `Function` constructor and reads the Node.js `process` global in the non-browser fallback:

```js
result = Object['con' + 'structor']('return typeof pro' + 'cess')()
```

Observed result:

```text
validation: null
execution: object
```

A browser Worker alone is also insufficient because Worker globals include network and script-loading capabilities. The sandbox must execute in a separate JavaScript engine that has no host objects unless they are explicitly provided.

### SVG and file-boundary follow-up audit

The first SVG guard used regular-expression replacement. That approach leaves entity-encoded URL schemes such as `jav&#x61;script:` intact; an XML parser decodes the entity before the browser uses the `href`. It also leaves SVG animation elements such as `<animate>` and `<set>` able to mutate URL or event attributes after sanitization. SVG therefore needs structural XML parsing, an element allowlist, and decoded attribute validation rather than source-text replacement.

The file guard compares lexical paths. A symlink or junction placed under the application data directory can therefore point outside the authorized tree while still passing `path.relative`. Both the configured data directory and candidate files must be compared by canonical real path.

## Optimization Reason

Security fixes have high leverage because they reduce runtime risk without changing the product surface. The mainline currently depends on vulnerable packages and lacks durable tests for previously identified security-sensitive boundaries. Tightening those areas improves maintainability, release confidence, and future auditability.

The JavaScript tool is especially sensitive because a validator that can be bypassed with string concatenation is not a security boundary, even when ordinary tests pass. This phase replaces host evaluation with an isolated interpreter so calculation workflows no longer expose Electron or Node.js. Product requirements allow network access inside the sandbox, but that capability is intentionally deferred until the final sandbox-focused phase so current work can return to higher-priority user functionality.

## Chosen Design: QuickJS WASM Isolation

### Architecture

- Replace all host `Function` and `AsyncFunction` evaluation with a dedicated QuickJS WebAssembly runtime.
- Use the minimal `quickjs-emscripten-core` plus `@jitl/quickjs-wasmfile-release-sync` packages rather than the four-variant umbrella package.
- Create a fresh runtime and context for each tool invocation so globals, heap state, and mutations cannot leak across calls.
- Do not configure a module loader and do not expose host objects. QuickJS receives only a narrow `console.log` bridge that converts arguments to strings.
- Set an explicit heap limit, stack limit, and interrupt deadline on every runtime.

### Execution Flow

1. Validate that the request contains non-empty source and clamp the requested timeout to the existing 1-30 second contract.
2. Lazily initialize the release QuickJS WASM module.
3. Create a new limited runtime and context.
4. Install the log bridge and evaluate a wrapper that declares `result`, executes the submitted code, and returns a JSON-compatible envelope.
5. Dump only the resulting QuickJS value into the host and format it with the existing Markdown response shape.
6. Dispose every QuickJS handle, context, and runtime in `finally` blocks.

### Security Properties

- Constructor-chain obfuscation may recover QuickJS's own global object, but it cannot reach Electron, Node.js, the DOM, or browser network APIs because those capabilities do not exist in the QuickJS realm.
- `process`, `require`, `fetch`, `XMLHttpRequest`, `WebSocket`, `document`, and `window` remain `undefined` without relying on source-text matching.
- Static and dynamic module imports fail because no module loader is installed and code is evaluated as a script.
- Infinite loops are interrupted by the runtime deadline; excessive allocation is stopped by the heap limit.
- The old inline fallback and Blob Worker source are removed entirely.

### Errors and Compatibility

- Syntax and runtime errors return the existing `[sandbox execution failed]` response rather than escaping the tool boundary.
- Interruptions return a timeout-specific error; out-of-memory conditions return a resource-limit error.
- Existing synchronous calculations, `result = ...`, and `console.log(...)` remain supported.
- Host async APIs and top-level `await` are intentionally unsupported because exposing them would widen the capability surface beyond the tool's documented calculation use case.

### Test Strategy

- Prove the current implementation fails by executing the obfuscated constructor-chain payload.
- Verify normal array/statistical calculation and log formatting.
- Verify direct and obfuscated access to host globals cannot escape the isolated realm.
- Verify dynamic import is unavailable.
- Verify an infinite loop is interrupted within a bounded wall-clock interval.
- Run the full CJS suite, renderer and main-process TypeScript checks, Vite production build, and npm audit.

## Chosen Design: Structural SVG and File Authorization

- Parse custom SVG as XML with `@xmldom/xmldom`; reject malformed documents, doctypes, and non-`svg` roots.
- Retain only a compatibility-oriented allowlist of static SVG drawing, text, gradient, mask, pattern, and filter elements. Remove navigation, embedded content, animation, scripting, and external-resource elements as whole subtrees.
- Remove event handlers and unsafe URL-bearing attributes after XML entity decoding. Permit only local fragment references such as `url(#gradient)` and `<use href="#symbol">`.
- Preserve a small allowlist of presentation declarations from inline `style`; reject URL functions, escapes, imports, and executable legacy CSS forms.
- Canonicalize existing files and the application data directory with `realpath` before comparing authorization boundaries. An explicitly selected file is stored by canonical path, so aliases do not widen access.

## Verification SOP

### Forward SOP

1. Start from the exact `origin/master` commit recorded by the PR base.
2. Run the new regression against that baseline and capture the expected failure or risk evidence.
3. Apply the smallest implementation that satisfies the approved spec.
4. Exercise the supported path end to end: create representative data, perform an authorized write, read it back through the guarded read path, and compare the persisted value.
5. Run focused tests first, then the complete test/type/build/audit matrix.
6. Record commands and observed results in the implementation PR before declaring the optimization complete.

### Reverse SOP

1. Exercise the inverse and hostile cases: mutating chat SQL, multi-statement SQL, unauthorized file reads, unsafe SVG, sandbox constructor escapes, module loading, infinite loops, and memory pressure.
2. Assert each operation is rejected at the intended boundary with a controlled error.
3. Read the affected data again after every rejected write and prove that the original value is unchanged.
4. Dispose or close temporary runtimes, files, and databases, then repeat the supported read to prove cleanup did not corrupt state.
5. Treat any bypass, state mutation, leaked capability, hang, or unverifiable result as a failed acceptance criterion.

### Data Write/Read Evidence

- The user database regression creates a temporary SQLite database, writes a sentinel row through the authorized management path, and reads the same row through an allowed read-only query.
- It then attempts a mutating statement through the chat-mode guard, verifies rejection, and reads the sentinel again to prove the database was not modified.
- File authorization tests write distinct sentinel contents to an approved file and an unapproved sibling, then verify that only the explicitly authorized path can be read.
- Sandbox and SVG paths do not persist application data; their forward evidence is output round-trip correctness and their reverse evidence is absence of host capabilities or unsafe markup.

## Plan

1. Add focused regression tests for:
   - read-only SQL guards for external datasources and embedded user DBs
   - SVG sanitization before previewing or persisting custom illustrations
   - JavaScript sandbox escape, resource limits, and normal `result = ...` execution behavior
   - file read authorization for renderer-initiated text reads
2. Implement small, reusable guard helpers and connect them to existing runtime paths. Use structural XML parsing for SVG and canonical filesystem paths for file authorization; do not extend either source-text denylist.
3. Replace host JavaScript evaluation with a capability-free QuickJS WASM runtime using explicit memory, stack, and deadline limits.
4. Replace or remove vulnerable dependencies that are unused or have safer maintained equivalents.
5. Reconcile the Agent Skills publish metadata around the single installable skill surface.
6. Verify with:
   - all `tests/*.test.cjs`
   - `npx tsc --noEmit`
   - `npx tsc -p src/main/tsconfig.json`
   - `npm audit --registry=https://registry.npmjs.org/`
   - `npx vite build`

## Non-goals

- Do not rename repository branches or create a new remote `main` branch from automation.
- Do not change user-facing workflows beyond the security constraints needed to close the gaps.
- Do not attempt to secure host `eval`, `Function`, `AsyncFunction`, or `node:vm` with a larger denylist.
- Do not expose filesystem, network, DOM, Electron, Node.js, or module-loading capabilities to QuickJS.
- Do not treat the absence of network in this phase as a permanent product restriction; add a bounded network bridge in the final sandbox capability phase after functional optimization.
- Do not run full platform packaging unless implementation touches packaging-only behavior.

## Acceptance Criteria

- Production and full npm audit both report zero vulnerabilities.
- Security regression tests fail on the current mainline and pass after the implementation.
- Obfuscated constructor-chain code cannot observe host globals.
- Infinite loops and excessive memory use are bounded by the runtime.
- Entity-encoded SVG script URLs, animation-based attribute mutation, embedded content, and external resource references are removed while ordinary static SVG remains renderable.
- Symlinks or junctions inside the application data directory cannot authorize files outside its canonical tree.
- Ordinary synchronous calculation, `result`, and `console.log` behavior remain available.
- Authorized database writes can be read back exactly, while rejected writes leave the persisted sentinel unchanged.
- Forward and reverse SOP evidence is recorded in the implementation PR.
- TypeScript and Vite production build pass.
- The implementation PR links this spec and the tracking issue.
