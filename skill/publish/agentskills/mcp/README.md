# Datell MCP Skeleton

This subtree reserves the Track B package layout for a future Datell MCP runtime.

Current scope:

- one MCP tool: `datell_generate_chart`
- visual report runtime only
- no extra runtime domains in this phase
- consumed by the single merged installable skill `datell-visual-report-preview`

## Intended Shape

- package name: `@datell/mcp`
- endpoint responsibility: expose a local MCP tool surface for Datell-hosted visual report rendering
- first tool: `datell_generate_chart(html, title, theme?)`

The matching Agent Skill lives at `../skills/datell-visual-report-preview/` and should prefer this runtime when `datell_generate_chart` is available.