# In-App Export Origin Isolation Design

## Context

The PDF, PNG, and Excel IPC handlers currently materialize generated report HTML as a temporary file and load it with `BrowserWindow.loadFile()`. Reports intentionally contain inline JavaScript: chart libraries render canvases/SVGs, filters initialize state, and some reports build table DOM asynchronously. `nodeIntegration: false` and `contextIsolation` do not remove the local-file privileges of a `file://` document.

An Electron probe on `origin/master@ec2c68d` loaded the same kind of hidden window and successfully read a local sentinel with `fetch(file://...)`. That turns an untrusted report script into a local-file reader during an otherwise ordinary export operation.

## Goals

- Keep inline report scripts, ECharts, ApexCharts, and script-generated tables working for in-app export.
- Remove `file://` from the transient PDF/PNG/Excel rendering path.
- Prevent local-file reads, arbitrary network requests, workers, downloads, permission grants, popups, and navigation escapes.
- Isolate each export job's document, cookies, storage, protocol handler, and cleanup lifecycle.
- Preserve safe packaged report assets and predeclared unDraw images needed by existing reports.

## Non-Goals

- This change does not make user-downloaded interactive HTML bundles safe to open as files; that is a separate follow-up issue.
- This change does not close network access from the interactive preview iframe; the preview has a separate product/security boundary and follow-up.
- This change does not remove report JavaScript or rewrite arbitrary third-party HTML.

## Chosen Architecture

### Dedicated scheme and per-job session

Register a dedicated `export` scheme before `app.ready` with only `standard: true` and `secure: true`. Do not grant `bypassCSP`, service workers, CORS, streaming, or fetch privileges that are not needed by the export renderer.

For every export invocation, create a random non-persistent Electron session using `session.fromPartition('datell-export-' + randomUUID())`. The session owns its `export` protocol handler and is never shared with the privileged `app://localhost` renderer or the interactive `report://localhost` preview.

The handler stores one HTML document in memory under a cryptographically random host and serves only the exact active document URL, for example `export://<job-token>/document.html`. It may additionally serve a narrow allowlist of packaged `/vendor/` and `/styles/` assets from the trusted renderer distribution. Unknown paths, hosts, and methods fail closed. The document store removes the HTML and the session handler in an idempotent `dispose` operation.

Using a random host plus a fresh session prevents one export from reading another export's storage or guessing a live document URL. Keeping the document in memory avoids temporary-file races and prevents a failed export from leaving report code on disk.

### Network and content policy

The document response includes a restrictive CSP:

```text
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://cdn.undraw.co;
font-src 'self' data:;
connect-src 'none';
worker-src 'none';
frame-src 'none';
child-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none'
```

The session's `webRequest.onBeforeRequest` is a second enforcement layer. It allows the exact active document URL, the narrow packaged asset paths, and exact HTTPS image URLs declared in the original HTML. It cancels `file:`, `http:`, `https:` (except approved images), `ws:`, `wss:`, `data:` navigations, workers, and all other requests. The allowlist is created before the untrusted document executes and cannot be expanded by report JavaScript.

Permission checks and permission requests return false. Downloads are canceled. This makes CSP and request filtering complementary rather than relying on either one as the sole boundary.

### Window policy

Each hidden export window explicitly sets:

- `sandbox: true`
- `webSecurity: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `nodeIntegrationInWorker: false`
- no preload

`setWindowOpenHandler` denies child windows. `will-navigate` and `will-frame-navigate` cancel any navigation away from the active export URL. The window is destroyed in `finally`, after the document store and session handlers are disposed.

### Export data flow

1. Validate the existing IPC arguments and build the export HTML in memory.
2. Create an export job with the transformed HTML, exact asset allowlist, and a random URL.
3. Create the job session and handler, then load the URL with `loadURL`, never `loadFile`.
4. Wait for the existing chart readiness logic, execute the existing DOM preparation/extraction scripts, and call `printToPDF`, `capturePage`, or table extraction.
5. Show the existing save dialog and write only the user-selected final output file.
6. Dispose the job and destroy the hidden window on success, cancellation, timeout, or error.

## Error Handling and Limits

- A single job has a bounded readiness timeout; a hung/infinite report cannot keep a hidden renderer alive indefinitely.
- Cleanup is idempotent and runs for all exceptions, dialog cancellation, and renderer termination.
- A failed asset fetch is reported as a missing image rather than widening the request policy.
- The protocol never passes arbitrary requested file paths to `fs.readFile`; all static paths are canonicalized beneath trusted packaged roots.

## Verification Strategy

- Pure unit tests cover random URL generation, exact host/path matching, unknown/disposed URL rejection, CSP construction, and idempotent cleanup.
- Structural tests prove all three handlers use the export job helper and contain no temporary HTML `loadFile` path.
- An Electron smoke fixture runs inline script, ECharts, ApexCharts, table creation, `fetch(file://...)`, XHR, WebSocket, worker, popup, and navigation probes. The red baseline observes file access; the implementation observes a non-file origin, blocked access, and intact rendering signals.
- Existing 29 CJS tests, renderer/main TypeScript compilation, production build, and both npm audits remain required.

## Follow-Ups

- Harden interactive/static HTML bundles before describing them as safe to open from disk.
- Decide whether preview report network access should be constrained or mediated.
