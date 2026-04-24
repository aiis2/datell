# Contributing

## Scope

This repository currently accepts contributions in two areas only:

- Agent Skill guidance and reference material for `datell-visual-report-preview`
- the minimal visual-report MCP runtime in `mcp/`

Do not add unrelated runtime domains such as memory, RAG, or knowledge-base tools in this repository without a separate design and review pass.

## Local Setup

1. Install dependencies from the repository root with `npm install`.
2. Run `npm run validate` before opening a pull request.
3. If you changed the MCP package, also run `npm --workspace @datell/mcp run smoke` directly when debugging.

## Contribution Rules

- Keep all repository-facing files in English only.
- Preserve the single installable skill surface published through `.claude-plugin/marketplace.json`.
- Keep the fallback HTML path working even when MCP is unavailable.
- Prefer additive reference documentation over silent behavior changes.
- When changing evals, make sure every referenced file path remains valid.

## Pull Request Checklist

- `npm run validate`
- Update `CHANGELOG.md` when the public behavior changes
- Update `README.md` when install or compatibility behavior changes
- Update `mcp/README.md` when MCP runtime behavior changes