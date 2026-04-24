# Datell Agent Skills

This subtree is the first publish-ready Agent Skills working tree extracted from Datell.

Current scope:

- a single installable skill: `datell-visual-report-preview`
- the merged skill prefers MCP runtime when `datell_generate_chart` is available and falls back to standalone HTML when it is not
- `mcp/`: a Track B runtime skeleton limited to local visual report runtime

Install with the Agent Skills CLI after splitting this subtree into its own public repository:

```bash
npx skills add <owner>/datell-skills --skill datell-visual-report-preview
```

This working tree also includes `.claude-plugin/marketplace.json` so the same repository can be imported by Datell's current GitHub compatibility installer.

## Layout

```text
skills/
  datell-visual-report-preview/
    SKILL.md
    evals/evals.json
    references/visual-report-pattern.md
mcp/
  package.json
  README.md
  src/index.ts
```