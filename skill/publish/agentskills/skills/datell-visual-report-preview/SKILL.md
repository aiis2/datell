---
name: datell-visual-report-preview
description: Create Datell visual reports with a hybrid workflow. Prefer the local Datell MCP runtime via datell_generate_chart when available, otherwise fall back to a polished standalone HTML report.
license: Apache-2.0
compatibility: Designed for Agent Skills compatible coding agents. If a Datell MCP runtime exposing datell_generate_chart is available, use it; otherwise generate standalone HTML directly.
metadata:
  author: Datell Team
  track: hybrid-skill
  scope: visual-report-only
---

# Datell Visual Report Preview

Use this skill when the user wants a visual report, dashboard, KPI summary page, or chart-heavy HTML deliverable.

## Decision Tree

Always inspect the current runtime before choosing the delivery path.

1. Check whether the current agent session can call a Datell MCP tool named `datell_generate_chart`.
2. If that MCP tool exists, prefer the Track B runtime path.
3. If that MCP tool does not exist, fall back to the Track A standalone HTML path.
4. Do not fail the task only because MCP is unavailable when a standalone HTML deliverable is acceptable.

## Output Contract

Produce a complete HTML document, not a fragment.

1. Include `<!doctype html>`, `<html>`, `<head>`, and `<body>`.
2. Include a clear report title and a short subtitle or context line.
3. Put KPI summary cards above the main chart area when metrics are available.
4. Use a responsive chart container and chart-friendly layout.
5. Return or write ready-to-open HTML, not a prose explanation.

## Workflow

1. Normalize the user's metrics into a small report schema: title, summary KPIs, dimensions, series.
2. Choose the smallest chart set that answers the question.
3. Build the full HTML page.
4. If `datell_generate_chart` is available, call it with the final HTML and title.
5. If `datell_generate_chart` is not available, save the result as a named `.html` artifact when possible.
6. If the environment only allows text output, return one fenced `html` block containing the full document.

## Track B Preferred Path

When a Datell MCP runtime is available:

- build the full HTML document first
- call `datell_generate_chart(html, title, theme?)`
- return the MCP tool result instead of only echoing the HTML

## Track A Fallback Path

When Datell MCP is not available:

- keep the same HTML quality bar
- return or save a complete standalone HTML report
- use CDN ECharts or an offline-safe fallback depending on the environment

## Chart Guidance

- Prefer bar charts for ranked category comparison.
- Prefer line charts for time series.
- Prefer a single primary chart unless the user clearly needs a multi-chart dashboard.
- Keep legends, labels, and tooltip copy in the same language as the user's request.

## Runtime Guidance

- If `datell_generate_chart` is available, prefer MCP runtime execution over a prompt-only draft.
- If external scripts are acceptable, use ECharts from a CDN for the main chart.
- If the user asks for an offline-safe deliverable, avoid CDN dependencies and fall back to static SVG or simple semantic HTML blocks.
- Do not assume Datell-only helpers such as `callTool(...)` exist unless they are actually exposed by the current host.

## Guardrails

- Do not return partial snippets that require the user to reconstruct the page.
- Do not produce placeholder metrics unless the user asked for a mock or example.
- Do not overbuild the layout when one chart and a few KPI cards are enough.
- Do not hide missing data assumptions. State them briefly in the subtitle or a note.
- Do not ignore an available `datell_generate_chart` runtime and silently downgrade to prompt-only output.
- Do not claim MCP is available unless you checked and found the tool.

## Reference

See [the visual report pattern guide](references/visual-report-pattern.md) for the recommended page structure, CSS skeleton, and chart bootstrapping pattern.
