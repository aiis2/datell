# Skills Registry Id Path Sanitization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refuse path-escaping registry skill ids so save/delete/export only operate under `skills/registry/user/<safe-id>.skill.json`.

**Architecture:** Pure `assertSafeRegistrySkillId` (or equivalent) in main skills manager; call from save/delete/export before FS ops.

**Issue:** #135

---

### Task 1: Red tests

Create `tests/skills-registry-id-sanitization.test.cjs`:

1. Load `createSkillsManager` / `assertSafeRegistrySkillId` from shipped main module.
2. `saveRegistrySkill` with id `../escape-skill` must throw and must not create a file outside `registry/user`.
3. Ids with `/`, `\`, empty, `.`, `..`, spaces-only, non-strings throw.
4. Valid id `phase-one-skill` (and similar allowlisted basenames) still saves under `registry/user`.
5. `deleteRegistrySkill` / `exportRegistrySkill` refuse the same bad ids (export may throw “not found” only after safe resolve — prefer invalid-id error first).

Commit: `test: reproduce registry skill id path escape`

### Task 2: Implement

1. Add `assertSafeRegistrySkillId` + use in `registryFileName` or at each call site in `skillsManager.ts`.
2. Keep stable error message for tests.

Commit: `fix: sanitize registry skill ids for path safety`

### Task 3: Verify

```bash
node --test tests/skills-registry-id-sanitization.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
```
