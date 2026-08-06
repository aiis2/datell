# Skills Registry Id Path Sanitization Design

## Mainline

This design starts from authoritative `origin/master@491fe58` and addresses Issue #135.

The repository has no `origin/main`; `origin/HEAD` points to `origin/master`.

## Problem

`createSkillsManager` builds registry file paths as:

```ts
path.join(registryUserDir, `${id}.skill.json`)
```

for save, delete, and export source resolve. The `id` comes from IPC (`skills:registry:save|delete|export`) and from imported manifests. Values such as `../escape-skill` resolve to `skills/registry/escape-skill.skill.json` **outside** `registry/user`. Slash-containing ids attempt nested paths under the user dir.

Import/export destination path guards (#132 / #134) closed arbitrary path arguments but left **id-as-path-segment** unconstrained.

## Invariant

Any registry skill `id` used to form a filesystem path must be a single safe basename:

- non-empty string after trim
- no path separators (`/`, `\`)
- no `..` or `.` as the whole id
- no absolute / drive prefixes
- characters limited to a conservative allowlist suitable for cross-platform filenames (e.g. `[A-Za-z0-9._-]+`, matching renderer `slugifySkillId` output)

Invalid ids are refused **before** any read/write/delete. Successful operations only touch `skills/registry/user/<id>.skill.json` under the data directory.

## Chosen Design

### Fail-closed `assertSafeRegistrySkillId` (or equivalent) in main

1. Export a pure helper from `src/main/skillsManager.ts` (or a tiny sibling module) that:
   - Accepts `unknown`.
   - Trims strings; rejects non-strings, empty, `.`, `..`, separators, and non-allowlisted characters.
   - Returns the normalized safe id string.
   - Throws a stable error, e.g. `Registry skill id is invalid`.
2. Call it from:
   - `saveRegistrySkill` (on manifest.id before write)
   - `deleteRegistrySkill`
   - `exportRegistrySkill` (source path resolve)
3. Optionally also assert the resolved file path stays inside `registryUserDir` via `path.resolve` + relative check (defense in depth).

Renderer `validateRegistrySkillManifest` / `slugifySkillId` remain UX only; main is the integrity boundary.

### Alternatives Rejected

| Option | Why not |
|--------|---------|
| Only strip `..` | Incomplete (slashes, absolute, weird basenames) |
| Silently rewrite evil ids | Hides attacks; hard to reason about identity |
| Trust renderer slugify | Not an integrity boundary |

## Verification Strategy

1. RED: `saveRegistrySkill` with id `../escape-skill` currently writes outside `registry/user`.
2. GREEN: that throws; valid ids like `phase-one-skill` still save under `registry/user`; delete/export refuse the same bad ids.
3. Full CJS suite + both tsc projects.
