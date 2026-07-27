# Datasource Save Validation Design

## Mainline

This design starts from authoritative `origin/master@4829193` and addresses Issue #123.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Renderer settings validate datasource name/host/database before calling save, but main-process `saveDatasource` persists the IPC payload almost unchecked. Empty identity fields and invalid ports can be written to `datasources.json`.

The main process is the authority for persisted config. UI checks are UX only and can be bypassed by any IPC caller.

## Invariant

`saveDatasource` must refuse blank `name`/`host`/`database` and non-integer or out-of-range ports. Successful saves persist trimmed identity strings. Masked-password preservation remains unchanged.

## Chosen Design

### Validate and normalize in `saveDatasource`

In `src/main/datasource.ts`, before writing:

1. Require `name`, `host`, and `database` to be non-empty after `trim()`.
2. Require `port` to be a finite integer in `1..65535`.
3. Persist trimmed `name`/`host`/`database`/`username` (username may be empty).
4. Keep existing `__MASKED__` password resolution and timestamp behavior.
5. Keep supported `type` values as today (optional hard check only if already enum-constrained by TypeScript callers; do not expand type system).

Error messages should be stable and testable, e.g.:

- `Datasource name cannot be empty or blank`
- `Datasource host cannot be empty or blank`
- `Datasource database cannot be empty or blank`
- `Datasource port must be an integer between 1 and 65535`

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Rely on SettingsModal only | Not an integrity boundary |
| Coerce invalid port to default | Silent data correction hides bugs |
| Full connection test on every save | Too slow; Test is a separate action |

## Verification Strategy

1. RED: empty name/host/database and port `-1` currently persist.
2. GREEN: those throw; valid save trims and stores; masked password update preserves secret.
3. Full CJS suite + both TypeScript compilers.
