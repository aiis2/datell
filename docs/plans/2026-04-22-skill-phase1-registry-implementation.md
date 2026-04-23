# Skill Phase 1 Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a registry-compatible Phase 1 that unifies built-in tools, app-config dynamic tools, and datellData directory skills without breaking current runtime behavior.

**Architecture:** Keep the existing legacy skills:list/openDir/installFromUrl flow intact, add a new registry manager plus skills:registry:* IPC, and merge registry-backed skills into renderer tool assembly through explicit source-priority rules. Treat dynamicToolDefs as a compatibility layer during Phase 1 rather than deleting or silently changing its persistence semantics.

**Tech Stack:** Electron main/preload IPC, React + Zustand renderer state, TypeScript, Node-based .cjs regression tests with ts-node/register/transpile-only.

**Repository-local skill artifact root:** Keep the publishable sample skill, evals, and reviewer workspace under `skill/` at the repository root, not under `.agents/skills/`, so the directory can later be split into a standalone skills.sh repository with minimal reshaping.

**Phase 1 write-through decision:** Use Option B. `skill_creator` continues to persist only to `dynamicToolDefs` during Phase 1; registry write-through is deferred until a later migration phase.

## Current Implementation Status (2026-04-22)

The original Phase 1 registry slice described below has already been implemented and verified on the `develop-skill` branch, and the current branch round extends that baseline with the first product-surface Phase 2/3 work.

- Main-process registry separation is live through `src/main/skillsManager.ts`, with `datellData/skills/*.json` preserved as the legacy directory-skill path and `datellData/skills/registry/user/*.skill.json` used for registry manifests.
- New registry IPC is live through `skills:registry:list/save/delete/export/import`, while legacy `skills:list`, `skills:openDir`, and `skills:installFromUrl` remain intact.
- Renderer runtime merge is live with deterministic source priority: built-in tools, registry skills, legacy directory skills, `dynamicToolDefs`, then MCP discovered tools.
- Phase 1 Option B is now explicit in both behavior and user-facing output: `skill_creator` writes only to `dynamicToolDefs`, does not write through to the registry, and this is locked by regression coverage.
- Repository-local sample skill authoring assets have been consolidated under the root `skill/` directory for future skills.sh repository extraction.
- `SettingsModal.tsx` now exposes the first unified SkillsTab management surface for built-in manifests, registry skills, legacy directory skills, and dynamic tools.
- Registry skills can now be created, edited, imported, exported, deleted, and populated by promoting legacy or dynamic skills from the UI.
- Built-in tool metadata has been centralized under `src/renderer/skills/manifests/`, giving all 26 built-in tools a single bilingual manifest source for display and future description review.
- Script-backed registry skills and dynamic skills can now call enabled built-in tools via `callTool(name, args)`, which lets custom skills trigger the same report preview pipeline used by direct agent tool calls.
- A tracked example registry manifest now lives at `skill/examples/visual-report-smoke.skill.json`, showing how a custom skill can compose chart HTML and delegate final rendering to `callTool('generate_chart', ...)`.

## Verified Evidence

- Run: `node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs`
	Observed: `skills manager registry ok`
- Run: `node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs`
	Observed: `skills runtime merge ok`
- Run: `node d:\python_project\auto_report\tests\built-in-skill-manifests.test.cjs`
	Observed: `built in skill manifests ok`
- Run: `node d:\python_project\auto_report\tests\skills-registry-helpers.test.cjs`
	Observed: `skills registry helpers ok`
- Run: `node d:\python_project\auto_report\tests\skills-script-calltool.test.cjs`
	Observed: `skills script calltool ok`
- Run: `node d:\python_project\auto_report\tests\skills-report-example-smoke.test.cjs`
	Observed: `skills report example smoke ok`
- Run: `node d:\python_project\auto_report\tests\export-html-bundle-utils.test.cjs`
	Observed: `export html bundle utils ok`
- Run: `node d:\python_project\auto_report\tests\report-event-bus-preview.test.cjs`
	Observed: `preview event bus adapter ok`
- Run: `node d:\python_project\auto_report\tests\report-interactivity-validation.test.cjs`
	Observed: `report interactivity validation ok`
- Run: `node d:\python_project\auto_report\tests\system-prompt-filtered-kpi.test.cjs`
	Observed: `system prompt filtered kpi rule ok`
- Run: `npx tsc -p d:\python_project\auto_report\tsconfig.json --noEmit`
	Observed: exit 0

## Phase 1 Skill Artifact Checklist

The repository-local sample skill and its evaluation artifacts now live in these concrete paths:

- `skill/SKILL.md`
- `skill/evals/evals.json`
- `skill/workspace/iteration-1/review.html`
- `skill/workspace/iteration-1/validation-summary.md`

These files are intentionally outside `.agents/skills/` so the directory can later be split out as a standalone publishable skill repository without reshaping the internal evaluation workspace.

## Still Out Of Scope After This Round

- `dynamicToolDefs` is still the persistence layer for AI-created tools; there is no automatic migration or dual-write into registry storage.
- The new registry editor currently uses JSON textarea editing for tools; Monaco/CodeMirror integration remains future work.
- Dedicated skill test/eval launching from the Settings UI is not implemented yet; current verification remains repo tests plus manual review artifacts under `skill/`.
- External skill execution still uses the current AsyncFunction-plus-blacklist compatibility boundary; stronger isolation remains later-phase work.
- Native skills.sh prompt-skill execution semantics are still out of scope; current GitHub installation remains a compatibility import path rather than a first-class native skill runtime.

---

### Task 0: Branch Bootstrap

**Files:**
- Modify: docs/plan/tech-17-skills-packaging-plan.md
- Create: docs/plans/2026-04-22-skill-phase1-registry-implementation.md

**Step 1: Create the task branch**

Run: git -C d:\python_project\auto_report switch -c develop-skill
Expected: switched to a new branch named develop-skill

**Step 2: Push the task branch to origin**

Run: git -C d:\python_project\auto_report push -u origin develop-skill
Expected: branch develop-skill tracks origin/develop-skill

**Step 3: Verify branch state**

Run: git -C d:\python_project\auto_report status --short --branch
Expected: branch header shows develop-skill

### Task 1: Capture Legacy Runtime Behavior With Failing Tests

**Files:**
- Create: tests/skills-manager-registry.test.cjs
- Create: tests/skills-runtime-merge.test.cjs
- Modify: src/main/main.ts
- Modify: src/renderer/tools/index.ts

**Step 1: Write a failing test for legacy directory skills enumeration**

Assert that datellData/skills/*.json continues to load valid ExternalSkill JSON and ignores malformed files.

**Step 2: Write a failing test for registry filesystem separation**

Assert that datellData/skills/registry/user/*.skill.json is managed separately from legacy datellData/skills/*.json files.

**Step 3: Write a failing test for merge priority**

Assert that getAllTools source ordering remains stable when the same tool name exists in built-in, registry, legacy directory, and dynamic sources.

**Step 4: Run the tests to verify failure**

Run: node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs; node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs
Expected: FAIL because registry helpers and merge rules do not exist yet

### Task 2: Implement Main-Process SkillsManager

**Files:**
- Create: src/main/skillsManager.ts
- Test: tests/skills-manager-registry.test.cjs

**Step 1: Add a SkillsManager that targets datellData/skills/registry/**

Implement methods for:
- listRegistrySkills()
- saveRegistrySkill()
- deleteRegistrySkill()
- exportRegistrySkill()
- importRegistrySkill()

**Step 2: Keep legacy directory logic separate**

Do not move or rename existing datellData/skills/*.json handling in main.ts.

**Step 3: Re-run the filesystem test**

Run: node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs
Expected: PASS for registry path separation and basic CRUD behavior

### Task 3: Add Registry IPC Without Breaking Legacy IPC

**Files:**
- Modify: src/main/main.ts
- Modify: src/main/preload.ts
- Test: tests/skills-manager-registry.test.cjs

**Step 1: Add new IPC namespaced as skills:registry:* **

Handlers to add:
- skills:registry:list
- skills:registry:save
- skills:registry:delete
- skills:registry:export
- skills:registry:import

**Step 2: Preserve legacy IPC exactly**

Do not change the semantics of:
- skills:list
- skills:openDir
- skills:installFromUrl

**Step 3: Expose preload APIs**

Add electronAPI methods for skillsRegistryList/Save/Delete/Export/Import.

**Step 4: Verify IPC behavior by rerunning the registry test**

Run: node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs
Expected: PASS with registry IPC helpers reachable through the tested surface or exported helper seams

### Task 4: Add Renderer Registry State

**Files:**
- Modify: src/renderer/stores/configStore.ts
- Modify: src/renderer/types/index.ts
- Test: tests/skills-runtime-merge.test.cjs

**Step 1: Add registrySkills state and refresh actions**

Track registry-backed skills separately from:
- dynamicToolDefs
- externalSkills

**Step 2: Preserve existing dynamicToolDefs persistence**

Do not regress the current app-config restore path.

**Step 3: Add minimal types for registry-backed skill manifests in the renderer**

Keep the compatibility shape minimal for Phase 1.

**Step 4: Run the merge test again**

Run: node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs
Expected: still FAIL until tool assembly is updated

### Task 5: Refactor Tool Assembly Order

**Files:**
- Modify: src/renderer/tools/index.ts
- Optional Create: src/renderer/skills/registry.ts
- Test: tests/skills-runtime-merge.test.cjs

**Step 1: Centralize source-priority rules**

Recommended order:
1. built-in tools
2. registry skills
3. legacy directory skills
4. dynamicToolDefs compatibility layer
5. MCP discovered tools

**Step 2: Make duplicate-name behavior explicit**

Document whether later sources override earlier sources or vice versa, then encode that in one place.

**Step 3: Ensure disabledBuiltInTools remains authoritative**

A disabled built-in must not silently reappear via a fallback merge path.

**Step 4: Re-run merge tests**

Run: node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs
Expected: PASS with deterministic merge ordering

### Task 6: Decide skill_creator Write-Through Strategy

**Files:**
- Modify: src/renderer/tools/skillCreator.ts
- Modify: src/renderer/stores/configStore.ts
- Test: tests/skills-runtime-merge.test.cjs

**Step 1: Choose one Phase 1 behavior and document it**

Option A: skill_creator writes to dynamicToolDefs and registry
Option B: skill_creator keeps writing only to dynamicToolDefs during Phase 1, with registry migration deferred

Current decision for this phase: Option B.

**Step 2: Implement the chosen behavior explicitly**

Do not leave ambiguous partial sync.

**Step 3: Add regression coverage**

Assert that AI-created tools still survive restart and still appear in getAllTools.

Implementation note: this regression currently imports `src/renderer/stores/configStore.ts` directly from a Node `.cjs` test seam. To keep that working, the checked-in test harness registers `ts-node` in CommonJS mode and stubs `window`, `navigator`, `localStorage`, and `__ENTERPRISE_BUILD__` before loading the renderer store.

**Step 4: Re-run both tests**

Run: node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs; node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs
Expected: PASS

### Task 7: Verify No Legacy Regression

**Files:**
- Test: tests/skills-manager-registry.test.cjs
- Test: tests/skills-runtime-merge.test.cjs
- Test: tests/export-html-bundle-utils.test.cjs
- Test: tests/report-event-bus-preview.test.cjs

**Step 1: Run focused skills regression tests**

Run: node d:\python_project\auto_report\tests\skills-manager-registry.test.cjs; node d:\python_project\auto_report\tests\skills-runtime-merge.test.cjs
Expected: PASS

**Step 2: Run nearby existing regressions to catch unrelated breakage**

Run: node d:\python_project\auto_report\tests\export-html-bundle-utils.test.cjs; node d:\python_project\auto_report\tests\report-event-bus-preview.test.cjs
Expected: PASS

**Step 3: Run a narrow type/build validation**

Run: npx tsc -p d:\python_project\auto_report\tsconfig.json --noEmit
Expected: exit 0

### Task 8: Update Docs and Prepare Handoff

**Files:**
- Modify: docs/plan/tech-17-skills-packaging-plan.md
- Modify: README.md
- Modify: docs/plans/2026-04-22-skill-phase1-registry-implementation.md

**Step 1: Update docs to match implemented behavior**

Document:
- registry path
- legacy compatibility
- branch name develop-skill
- verification commands

**Step 2: Record known limitations**

Examples:
- dynamicToolDefs still acts as compatibility state
- write-through may be transitional
- security isolation remains Phase 4 work

**Step 3: Final verification before handoff**

Run: git -C d:\python_project\auto_report diff -- docs/plan/tech-17-skills-packaging-plan.md docs/plans/2026-04-22-skill-phase1-registry-implementation.md README.md
Expected: only intended documentation changes
