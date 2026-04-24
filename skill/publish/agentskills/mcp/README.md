# Datell MCP

`@datell/mcp` is a minimal runnable stdio MCP server dedicated to Datell visual-report delivery.

Current scope:

- one MCP tool: `datell_generate_chart`
- visual report runtime only
- no extra runtime domains in this phase
- consumed by the single merged installable skill `datell-visual-report-preview`

## Transport

- transport: stdio
- startup command after build: `npm run start`
- smoke command: `npm run smoke`

## Tool Contract

### datell_generate_chart

Inputs:

- `html`: complete HTML document
- `title`: report title
- `theme`: optional theme hint

Behavior:

- validates that the input looks like a complete HTML document
- writes an `.html` artifact to the configured output directory
- returns a structured tool result with the saved artifact path and byte count

## Output Directory

By default the server writes artifacts to the operating system temp directory under `datell-mcp-output`.

You can override that location with the `DATELL_MCP_OUTPUT_DIR` environment variable.

## Development

From the repository root:

```bash
npm install
npm --workspace @datell/mcp run smoke
```

The matching Agent Skill lives at `../skills/datell-visual-report-preview/` and should prefer this runtime when `datell_generate_chart` is available.