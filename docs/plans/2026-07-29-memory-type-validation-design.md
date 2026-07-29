# Memory Type Path Validation Design

## Mainline

This design starts from authoritative `origin/master@1e6496d` and addresses Issue #129.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Memory IPC handlers in `src/main/main.ts` resolve files as:

```ts
path.join(getMemoryDir(), `${type}.md`)
```

with TypeScript type `'long_term' | 'short_term'`. IPC strips types: a caller can pass `../escape` and write/read/clear outside `DATA_DIR/memory`.

## Invariant

All `memory:*` handlers must only operate on files whose basename is exactly `long_term.md` or `short_term.md` under the memory directory. Any other `type` is rejected before filesystem access.

## Chosen Design

### Fail-closed allowlist helper

1. Add a pure exported helper (prefer `src/main/memoryPaths.ts` for testability without booting Electron) that:
   - Accepts `memoryDir` + `type`.
   - Throws if `type` is not exactly `long_term` or `short_term`.
   - Returns `path.join(memoryDir, `${type}.md`)`.
   - Optionally asserts the resolved path stays inside `memoryDir` via `path.resolve` + relative check (defense in depth).
2. Wire `memory:read|write|append|clear` in `main.ts` to call the helper instead of raw `getMemoryFilePath`.

Stable error: `Memory type must be long_term or short_term`.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Only strip `..` | Incomplete (slashes, absolute paths) |
| Realpath after write | Too late; still creates wrong files |
| Trust renderer enums | Not an integrity boundary |

## Verification Strategy

1. RED: helper (or path builder) currently allows `../x` to resolve outside memory dir.
2. GREEN: only allowlisted types resolve; malicious types throw; legitimate long/short term paths work.
3. Full CJS suite + both tsc projects.
