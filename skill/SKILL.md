---
name: datell-skill-runtime-auditor
description: Audit Datell custom skill runtime, storage format, and packaging compatibility against the current codebase. Use this whenever the user asks whether Datell skills are JSON or YAML, where skills are loaded from, how skill.json or SKILL.md or .claude-plugin/marketplace.json are handled, or whether a proposed skills plan matches the current implementation.
compatibility: Requires repository file inspection. Prefer code over README or planning docs when they conflict.
---

# Datell Skill Runtime Auditor

Use this skill when reviewing or explaining how Datell custom skills actually work in this repository.

## Investigation order

1. Read src/main/dataDir.ts to confirm the real runtime data directory.
2. Read src/main/main.ts around skills:list, skills:openDir, and skills:installFromUrl.
3. Read src/main/preload.ts, src/renderer/App.tsx, src/renderer/stores/configStore.ts, and src/renderer/tools/index.ts.
4. Only after that, read README.md and docs/plan/tech-17-skills-packaging-plan.md to find drift between documentation and code.

## What to verify

- Directory skills are loaded from datellData/skills/*.json, not YAML files.
- AI-created skills in dynamicToolDefs are persisted through app-config restore and are not session-only throwaways.
- URL installation currently supports direct skill.json and GitHub repositories that expose .claude-plugin/marketplace.json.
- When a GitHub repository path is used, Datell fetches the target SKILL.md and wraps it into an instruction-returning JSON tool; this is compatibility behavior, not full native skills.sh execution.
- The current custom-code runtime uses AsyncFunction plus a blacklist. Do not describe that as a strong sandbox.

## Red flags to call out

Flag any proposal that does one of the following:

- Replaces legacy skills:list, skills:openDir, or skills:installFromUrl instead of adding a separate registry namespace.
- Treats autoReportData/skills as the production runtime path instead of datellData/skills resolved by getDataDir().
- Assumes README is more trustworthy than the code.
- Claims Datell already runs prompt-only SKILL.md skills natively without the JSON wrapper conversion path.

## Output format

Always respond with these sections:

## Runtime reality
Summarize the actual behavior in 3-5 concrete points.

## Evidence
List the exact code paths or docs that support the conclusion.

## Plan impact
Explain what this means for the proposal or bug under review.

## Recommended fix
Give the smallest change that aligns the proposal with the current codebase.

## Example use cases

Example 1:
Input: Datell skills should still be YAML, right?
Output: Explain that runtime directory skills are JSON under datellData/skills/*.json, cite the loader, and recommend fixing docs that still say YAML.

Example 2:
Input: Can I install a skills.sh repository directly into Datell?
Output: Explain the current compatibility boundary: skill.json is supported directly, marketplace.json plus SKILL.md can be wrapped into an instruction tool, but native prompt-skill execution is still not implemented.
