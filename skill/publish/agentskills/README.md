# Datell Agent Skills

This repository is the standalone publish tree for Datell Agent Skills and the optional Datell visual-report MCP runtime.

## Install

Install the published skill from a Git repository with the Agent Skills CLI:

```bash
npx skills add <owner>/datell-skills --skill datell-visual-report-preview
```

The same repository also ships `.claude-plugin/marketplace.json` so it can be imported by compatibility installers that understand Claude-style marketplace metadata.

## Compatibility

- Install surface: a single installable skill, `datell-visual-report-preview`
- Preferred runtime path: call `datell_generate_chart` when a compatible MCP host is available
- Fallback path: produce standalone HTML that preserves the Datell layout, card, and palette system
- MCP package scope: visual-report runtime only

This merged skill should prefer MCP when `datell_generate_chart` is available and otherwise stay fully usable through the standalone HTML fallback path.
The merged runtime remains limited to visual report scope in this repository.

## Local Validation

Install dependencies from the repository root:

```bash
npm install
```

Run the full local validation suite:

```bash
npm run validate
```

This command validates JSON files, repository layout, eval integrity, and the runnable MCP workspace.

## Support Policy

This repository currently supports only the following surfaces:

- the `datell-visual-report-preview` skill
- the `@datell/mcp` visual-report runtime

Issues outside that scope, including memory, RAG, or unrelated application runtime behavior, are out of scope for this repository unless a dedicated design pass expands the contract.

## Repository Layout

```text
.claude-plugin/
  marketplace.json
skills/
  datell-visual-report-preview/
    SKILL.md
    evals/evals.json
    references/datell-chart-engine-playbook.md
    references/datell-design-system-playbook.md
    references/visual-report-pattern.md
mcp/
  package.json
  README.md
  tsconfig.json
  src/index.ts
  scripts/smoke.mjs
scripts/
  validate-evals.mjs
  validate-json.mjs
  validate-layout.mjs
```

See [STANDALONE-REPO-CHECKLIST.md](STANDALONE-REPO-CHECKLIST.md) for the remaining non-blocking follow-up work after the initial standalone extraction.