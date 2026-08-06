# Skills Registry Import/Export Path Guards Design

## Mainline

This design starts from authoritative `origin/master@4adcacf` and addresses Issue #132.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

Skills registry IPC exposes unconstrained filesystem access:

1. **Import** — `skills:registry:import` passes `sourcePath` straight into `importRegistrySkill`, which calls `fs.readFileSync(sourcePath)` with no authorization check. Settings does call `fs:selectFile` first (which `rememberSelectedFile`s), but the import handler never consults `textFileReadGuard`. Any IPC caller can read arbitrary files and import their contents as skill manifests.

2. **Export** — `skills:registry:export` accepts a renderer-supplied `targetPath` and `fs.copyFileSync`s the registry file there. The Settings UI already exports via dialog-backed `save-file` and does **not** call this IPC; the path-parameter export remains a free write primitive.

## Invariant

1. Registry **import** may only read a path that `textFileReadGuard.canReadTextFile` allows (explicit `fs:selectFile` pick, or a file under `DATA_DIR`).
2. Registry **export over IPC** must not accept an untrusted destination path from the renderer. Export either uses a main-process save dialog or is removed in favor of the existing `save-file` product path.
3. Manager helpers used only from trusted main-process/tests may still write to an explicit path under test control; the integrity boundary is the IPC surface.

## Chosen Design

### Import: fail-closed read guard at IPC

1. Add a small pure helper (prefer export from a testable module, e.g. re-use patterns next to `fileReadGuard` or a thin `assertAuthorizedSkillImportPath`) that:
   - Rejects non-string / empty paths.
   - Resolves the path.
   - Throws a stable error if `!textFileReadGuard.canReadTextFile(resolved)` (same product message family as RAG: `文件未通过选择器授权，无法读取`).
   - Returns the authorized resolved path for `importRegistrySkill`.
2. Wire `skills:registry:import` in `main.ts` through that helper before calling the manager.

Legitimate Settings flow (`fs:selectFile` → `skillsRegistryImport`) continues to work because select already remembers the file.

### Export: close path-parameter write IPC

Prefer the minimal product-preserving option:

1. **Change** `skills:registry:export` so it no longer takes `targetPath` from the renderer.
2. In main, open `dialog.showSaveDialog` (default name `{id}.skill.json`), then copy via `exportRegistrySkill(id, dialogPath)` only when the user confirms.
3. Update preload + renderer types accordingly. Settings already uses `save-file`; no Settings change required unless something still invoked the old export API (today nothing in the UI does).

`createSkillsManager().exportRegistrySkill(id, path)` may remain for unit tests and internal use; it is not an IPC trust boundary.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Trust SettingsModal only | Not an integrity boundary; IPC is the boundary |
| Only strip `..` on import path | Incomplete; absolute paths and siblings still leak |
| Keep path-parameter export “for power users” | Unconstrained write from renderer is the defect |
| Bound export to DATA_DIR only | Breaks user-chosen download location; dialog is the right consent |

## Verification Strategy

1. RED: import of an outside file without `rememberSelectedFile` currently succeeds; path-parameter export currently writes outside DATA_DIR.
2. GREEN: unauthorized import throws; authorized (selected or under DATA_DIR) import succeeds; export IPC no longer accepts/writes a raw renderer path (dialog-only or removed path param).
3. Full CJS suite + both `tsc` projects.
