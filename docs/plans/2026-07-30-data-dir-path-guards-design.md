# Data Directory Set/Migrate Path Guards Design

## Mainline

This design starts from authoritative `origin/master@5ad6100` and addresses Issue #138.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

1. **`fs:setDataDir`** writes any renderer-supplied path into `data-settings.json` via `setDataDir`. Preload exposes `fsSetDataDir`; Settings does not call it today, but the IPC remains an unconstrained config write.

2. **`fs:migrateDataDir`** recursively copies the entire current data tree to any `newDir`, then persists that path. Settings can browse via `fs:selectDirectory` or type a free-text path; migrate never checks dialog authorization. Any IPC caller can fill/overwrite an arbitrary destination tree and retarget the app data root.

## Invariant

1. Persisting a new data directory (set or migrate) must only accept a path that main has authorized as an explicit directory pick (same consent model as `textFileReadGuard` for files).
2. Empty / non-string paths are refused.
3. Migration still refuses migrating onto the current data dir (existing check).
4. Legitimate Settings flow: `fs:selectDirectory` → path remembered → `fs:migrateDataDir` succeeds.

## Chosen Design

### Directory selection guard (mirror file read guard)

1. Add `createDirectorySelectGuard` (or extend a small shared module) with:
   - `rememberSelectedDirectory(dirPath: string): void` — resolve existing directory (realpath) and add to allow-set.
   - `canUseDirectory(dirPath: string): boolean` — true only if resolved dir is in the allow-set.
2. Wire `fs:selectDirectory` to `rememberSelectedDirectory` on successful pick (today it only returns the path).
3. **`fs:migrateDataDir`**: before copy, require `canUseDirectory(newDir)`; stable error e.g. `目录未通过选择器授权` or keep product Chinese style consistent with file guard (`文件未通过选择器授权，无法读取` → directory variant `目录未通过选择器授权，无法使用`).
4. **`fs:setDataDir`**: apply the same authorization, **or** remove/disable the IPC if unused (prefer authorize if keeping preload API for future; removing is fine if no callers — check preload/types and drop dead API only if safe).

Optional defense in depth: reject non-absolute empty strings; require directory exists and `stat.isDirectory()`.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Trust Settings free-text + browse | Free-text bypasses consent; IPC is the boundary |
| Only open dialog inside migrate (drop path arg) | Breaks current two-step UI (browse then confirm migrate); remember-set preserves UX |
| Allow any existing directory on disk | Still unconstrained; attacker picks system folders |

### UI note (non-blocking)

Settings free-text path field remains UX sugar; without a prior select, migrate will fail closed. Optionally later force browse-only — out of scope unless needed for product clarity.

## Verification Strategy

1. RED: migrate to an unselected absolute path currently succeeds (or setDataDir writes arbitrary path); guard API missing.
2. GREEN: unselected migrate/set refused; after `rememberSelectedDirectory`, migrate allowed; selectDirectory handler remembers.
3. Full CJS suite + both tsc projects.
