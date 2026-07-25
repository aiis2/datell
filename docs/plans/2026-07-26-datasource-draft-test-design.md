# Datasource Draft Connection Test Design

## Mainline

This design starts from authoritative `origin/master@18f951a` and addresses Issue #99.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

The settings form keeps edits in `buf`, but `handleTest` sends only an ID to the main process. For an existing datasource, the main process reloads the old config from `datasources.json`; unsaved edits are ignored. For a new datasource, the renderer saves the draft, reloads the list, and exits edit mode before it tests.

The result can be actively misleading: a user changes the host to an invalid address, clicks Test, and receives success from the old saved host. New invalid drafts become persisted records merely because the user tried to validate them.

## Invariant

**Test connection** is a read-only operation on the current form draft. It must use the visible draft values, perform connection work in the main process, and leave persisted datasource state and editor state unchanged.

## Chosen Design

### Draft-aware main-process API

Add `testDatasourceConfig(config: DatasourceConfig)` in `src/main/datasource.ts`. It receives a renderer draft and calls the same internal driver probe used by the existing ID-based test function. It never calls `saveDatasource` or `writeDatasources`.

Extract one internal `testDatasourceConnection(config)` implementation so both public paths share driver selection, `SELECT 1`, success text, and error formatting:

- `testDatasource(id)` loads the stored config, preserving compatibility.
- `testDatasourceConfig(draft)` resolves credentials and tests the draft.

### Masked password resolution

The renderer intentionally receives `__MASKED__` for saved passwords. When a draft contains that sentinel, the main process looks up the stored datasource with the same ID and substitutes only its real password into a copied config. All other draft fields remain authoritative.

If the renderer sends an explicit password or an empty string, test it exactly as supplied. The real stored password never crosses back to the renderer.

### Typed IPC path

Expose `datasource:testConfig` through:

1. `src/main/main.ts`
2. `src/main/preload.ts`
3. `src/renderer/types/index.ts`
4. `src/renderer/stores/datasourceStore.ts`

The payload is a `DatasourceConfig`; the result stays `{ ok: boolean; message: string }`.

### Renderer behavior

`SettingsModal` calls `testDatasourceConfig(buf)` in every mode. Remove the Test path's calls to `saveDatasource`, `loadDatasources`, `setIsNew`, `setSelected`, and `setViewMode`.

View mode already copies the selected datasource into `buf`, so its Test button continues to test the saved values. Edit and new modes test their unsaved values without changing mode or selection.

## Alternatives Rejected

### Save then test

This makes validation destructive and leaves invalid records behind. Extending that behavior to existing edits would be worse, not a fix.

### Test in the renderer

Database drivers and credentials belong in the Electron main process. Moving them into the renderer expands credential exposure and attack surface.

### Temporarily save, test, then restore

Restoration can fail or race with other operations, and watchers can observe the temporary invalid config. No persistence is needed.

### Add optional draft fields to the ID API

An explicit `testConfig` IPC contract is easier to audit and makes the non-persistent intent clear.

## Scope

- Main datasource service, datasource IPC/preload/type/store plumbing, and settings Test handler.
- Product tests for draft value use, masked-password resolution, persistence immutability, and renderer/IPC wiring.
- No UI layout or copy changes.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Mask sentinel is sent to the driver | Resolve in main by matching stored ID; capture driver config in tests |
| Draft test accidentally persists | Snapshot stored configs before/after success and failure |
| Existing view-mode Test regresses | `startView` already copies selected config into `buf`; all modes use one handler |
| IPC type drift | Structural regression covers main, preload, renderer declaration, and store |
| Test action still changes editor mode | Narrow handler-source assertion excludes save/reload/mode setters |

## Verification Strategy

1. RED on `origin/master`: no draft-test service/IPC exists and `handleTest` saves new records or tests a stored ID.
2. GREEN service test captures the edited host plus resolved stored password while `datasources.json` remains unchanged.
3. A new draft with an explicit password is tested without adding a record.
4. Renderer/IPC structure proves the current buffer is sent and Test has no persistence/mode side effects.
5. Full CJS suite, both TypeScript compilers, Vite build, Electron isolation/runtime smoke tests, and dependency audits.
