# Report Preview Origin Isolation Design

## Issue

GitHub Issue: #4

The remote default branch is `origin/master`; there is no `origin/main` ref. This design starts from and targets `origin/master`.

Datell executes AI-generated report HTML with inline scripts. The React-owned shell iframe and its nested `srcdoc` report both currently use `sandbox="allow-scripts allow-same-origin"` on the privileged renderer origin. The top renderer exposes `window.electronAPI` through `contextBridge`, so same-origin report code can traverse `top` and reach desktop IPC capabilities. The shell and React listeners also accept unauthenticated `postMessage` traffic.

## Optimization Reason

Interactive charts, filters, and generated report logic are core features, so deleting all report scripts is not acceptable. The security boundary must separate untrusted-but-interactive report code from the privileged renderer while preserving the preview workflow. Origin isolation is a browser-enforced capability boundary; source-text filtering and an iframe sandbox that deliberately restores same-origin are not.

## Considered Approaches

### 1. Dedicated `report://` origin with a typed message bridge (recommended)

Register a second standard, secure custom protocol and load `report-shell.html` from `report://localhost`. The shell and its inner report remain same-origin with each other for chart-library sharing and DOM-based theme/layout work, but they are cross-origin from the top renderer and cannot access `window.electronAPI`. Replace the one top-to-report DOM dependency with a serialized layout-inspection request.

Trade-off: this adds a small protocol and messaging surface, but preserves all current interactive behavior and relies on Chromium's same-origin policy.

### 2. Remove `allow-same-origin` from the existing shell

Give the shell and report opaque origins. This is a strong boundary, but it breaks current parent library transfer, theme patching, custom CSS injection, and layout inspection. Rebuilding every one of those paths inside the report would be substantially larger and riskier.

Trade-off: strongest iframe isolation, highest compatibility and implementation cost.

### 3. Strip all inline report scripts

Render static HTML only.

Trade-off: smallest security patch, but it removes charts, filters, event buses, and other expected product functionality. Rejected as misaligned with the product.

## Chosen Architecture

### Protocol Boundary

- Register `report` beside `app` with standard, secure, fetch, and stream privileges.
- In development, serve `report://localhost/*` from `public/`; in packaged builds, serve it from the renderer `dist` root.
- Keep the privileged React renderer at `http://localhost:5173` in development or `app://localhost` when packaged.
- Resolve the shell URL as `report://localhost/report-shell.html?parentOrigin=<encoded renderer origin>`.
- Do not attach a preload or Node integration to the report frames.

### Message Authentication

- React accepts shell messages only when `event.source` equals the active shell iframe window and `event.origin` equals `report://localhost`.
- React sends commands with target origin `report://localhost`, never `*`.
- The shell accepts commands only when `event.source === window.parent` and `event.origin` equals the `parentOrigin` query parameter.
- The shell accepts inner-report events only from the active `#report-frame` window.
- The shell replies to the exact parent origin.

Source validation is mandatory even with origin validation because multiple frames can share the report origin. Origin validation is mandatory even with source validation so a navigated shell window cannot retain authority.

### Layout Editing

React can no longer read `shellRef.contentDocument` across the new origin. It sends an `inspect-layout` request with a unique request ID. The trusted shell reads its same-origin inner report DOM, serializes card descriptors and grid-column count, and returns `layout-inspection` with the same ID. React ignores stale, mismatched, wrong-source, and wrong-origin responses and applies a short timeout.

Theme patching, custom CSS injection, chart resize, and chart-library transfer remain inside the report origin and keep their existing behavior.

### Error Handling

- Missing or invalid `parentOrigin` causes the shell to ignore commands and avoid sending parent messages.
- Layout inspection returns a controlled empty result when the inner document is unavailable.
- The renderer reports a timeout without entering edit mode if no authenticated response arrives.
- Navigations away from the expected shell origin invalidate subsequent messages automatically.

## Test Strategy

### Red Evidence

- Assert the `origin/master` shell URL shares the privileged renderer origin.
- Assert both iframe levels combine scripts and same-origin while inline report scripts remain executable.
- Assert React and shell listeners lack source/origin checks.
- In an Electron smoke fixture, inject a report script that probes `top.electronAPI`; the baseline must observe the exposed object or callable surface.

### Forward SOP

- Render representative ECharts, ApexCharts, VTable, filter, and plain HTML reports.
- Apply theme, palette, resize, and custom CSS updates.
- Enter layout edit mode, receive card descriptors, resize/reorder cards, and persist a custom layout.
- Verify error forwarding still reaches the preview banner.

### Reverse SOP

- From report code, probe `top.electronAPI`, top DOM, and privileged globals; access must throw or remain unavailable.
- Send forged `shell-ready`, `report-error`, `render`, `inject-custom-css`, and layout responses from wrong windows and origins; every message must be ignored.
- Navigate or replace the shell frame and verify old-window messages lose authority.
- Repeat supported rendering after hostile probes to prove the shell remains usable.

## Non-goals

- Do not remove report interactivity or inline scripts.
- Do not redesign the report generator or exported standalone HTML.
- Do not expose Electron IPC directly to the report protocol.
- Do not use a larger HTML or JavaScript denylist as the isolation boundary.
- Do not merge the first security-baseline PR into this independent change; both PRs target `origin/master` and touch separate boundaries.

## Acceptance Criteria

- Report code cannot read or call `top.electronAPI`, privileged renderer DOM, or privileged globals.
- Shell and renderer commands are accepted only from the expected window and origin.
- The shell uses a distinct origin in development and packaged execution.
- Chart libraries, filters, themes, resizing, errors, and layout editing retain their current behavior.
- No renderer code reads the cross-origin shell document directly.
- Red regressions fail on `origin/master` and pass on the implementation.
- All CJS tests, both TypeScript builds, Vite build, npm audits, and an Electron isolation smoke test pass.

