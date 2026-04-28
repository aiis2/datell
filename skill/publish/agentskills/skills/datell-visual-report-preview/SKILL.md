---
name: datell-visual-report-preview
description: Create Datell visual reports with a hybrid workflow. Prefer the local Datell MCP runtime via datell_generate_chart when available, otherwise fall back to a polished standalone HTML report.
license: MIT
compatibility: Designed for Agent Skills compatible coding agents. If a Datell MCP runtime exposing datell_generate_chart is available, use it; otherwise generate standalone HTML directly.
metadata:
  author: aiis2
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

## Datell Report Composition Flow

When generating a Datell-style report, follow this order:

1. Choose the layout family and canonical layout ID.
2. Choose card combination.
3. Choose chart engine.
4. Fill the shared Datell shell and card system.
5. Add engine-specific initialization code inside the selected chart cards.

Do not start from chart code first. The report should be shaped by layout and cards before the engine is chosen.

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

## Datell Knowledge Base

Use the publishable markdown knowledge base instead of inventing a reduced subset from memory.

- Start from [the Datell knowledge index](references/datell-knowledge-index.md).
- Use [the Datell layout catalog](references/datell-layout-catalog.md) for built-in layout IDs.
- Use [the Datell palette catalog](references/datell-palette-catalog.md) for built-in palette IDs.
- Use [the Datell card catalog](references/datell-card-catalog.md) for the current app-side card component inventory.

## No-MCP Basic Report Contract

When MCP is unavailable, the fallback should become a static basic report rather than a partially interactive app shell.

- Produce a non-interactive standalone HTML report.
- Do not use filter controls in the no-MCP basic report path.
- Do not emit `window.__REPORT_EVENT_BUS__`, `filterChange`, `callTool(...)`, cross-card linkage, linked brushing, or card-to-card drilldown hooks.
- Keep the composition simple: one layout ID, one palette ID, one KPI row, one primary chart area, and only the minimum supporting table or narrative cards.
- If a chart library cannot be loaded safely, fall back to static SVG or semantic HTML blocks instead of adding fake interactivity.

## Datell Fallback Design System

When MCP is unavailable, do not drop to a generic HTML dashboard. Mirror Datell's real report shell and card system in the standalone output.

- Use the shell structure `report-container`, `report-header`, `report-title`, `report-timestamp`, and `report-content`.
- For standard dashboards, use `grid-kpi` for the KPI row and `grid-charts` for the main content area.
- For embedded hosts that explicitly support local controls, use the zone structure `report-zones`, `zone-kpi`, `zone-filter`, and `zone-content`.
- Use `card` as the base wrapper, then layer specialized classes such as `chart-card`, `kpi-card`, and `data-table` patterns on top.
- Make tables span full width when they are the main evidence block.

## Card Library Guidance

Prefer concrete Datell card variants over anonymous div blocks.

- KPI cards: `kpi-card`, `kpi-bullet-card`, `kpi-ranked-list`, `kpi-traffic-light`, `kpi-risk-flag`, `kpi-two-period`, `kpi-multi`.
- Chart cards: `chart-card` with `card-subtitle`, `chart-footer`, and a sized `chart-container` such as `md`, `lg`, or `full`.
- Table cards: `ranked-table`, `scorecard-table`, `heatmap-table`, `comparison-table`, `pivot-table`.
- Narrative and structure cards: `insight-callout`, `text-summary-card`, `metric-narrative`, `timeline-horizontal`, `timeline-dual-track`, `process-steps`, `comparison-twoCol`.
- Filter controls: only use `zone-filter`, `filter-btn-group`, `filter-select`, or `filter-checkbox-group` when the host can execute basic browser JavaScript and the task explicitly requires embedded controls. Do not use them in the no-MCP basic report path.

## Layout Selection Guidance

Choose a Datell-style canonical layout ID before composing cards.

- `universal/dashboard-2col`: the default for balanced KPI plus chart dashboards.
- `universal/dashboard-3col`: use for wide screens and high-density monitoring.
- `universal/bento-grid`: use when card importance is uneven and one or two hero cards should span more columns.
- `universal/compact-dashboard`: use for operational monitoring, realtime boards, and dense KPI plus small chart collections.
- `universal/magazine-wide`: use when the report needs a dominant main story with a supporting side rail.
- `universal/print-a4`: use for document-style exports and PDF-oriented reports.
- `universal/mobile-first`: use when the request explicitly targets narrow screens.
- If the domain is obvious, mirror Datell's domain layouts such as `finance/kpi-3col`, `ecommerce/gmv-overview`, `sales/daily-report`, or `operations/server-monitor` in structure and card choice.

## Chart Engine Decision Guidance

ECharts and ApexCharts use the same Datell shell and card system. They should both live inside the same `chart-card` and `chart-container` structure.

- Choose ECharts for finance, business, comparison-heavy, mixed analytical dashboards, or when you need the safest default.
- Choose ApexCharts for modern dark dashboards, technology monitoring boards, compact dashboard walls, or when the user explicitly wants ApexCharts.
- Do not rewrite the page structure when switching engines. Only the initialization API, color binding details, and optional interactivity hooks should change.
- If the host already preloads the chosen engine, do not add a CDN script tag. If it does not and standalone HTML is acceptable, load the chosen engine from a CDN.

## Theme And Palette Guidance

Inline Datell's theme variables so the fallback report keeps the same visual grammar as the app shell.

- Define CSS variables such as `--bg-body`, `--bg-card`, `--bg-card-alt`, `--text-main`, `--text-sub`, `--text-accent`, `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`, `--border-table`, `--radius-card`, `--shadow-card`, and `--palette-color-1` through `--palette-color-6`.
- For light palettes, build the header as a gradient from the primary color to the second palette color.
- For dark palettes, use a solid header based on `--bg-card` or `--bg-body`, then keep `--text-header` high-contrast.
- Default palette families should stay close to Datell presets such as `palette-classic`, `palette-slate-dark`, `palette-editorial`, and `palette-cyberpunk`.
- Use palette accents for chart series, KPI emphasis, table heat states, and insight severity colors instead of inventing a disconnected theme.

## Chart Guidance

- Prefer bar charts for ranked category comparison.
- Prefer line charts for time series.
- Prefer a single primary chart unless the user clearly needs a multi-chart dashboard.
- Keep legends, labels, and tooltip copy in the same language as the user's request.

## Runtime Guidance

- If `datell_generate_chart` is available, prefer MCP runtime execution over a prompt-only draft.
- If external scripts are acceptable, use ECharts or ApexCharts from a CDN only when the host does not already preload the chosen engine.
- If the user asks for an offline-safe deliverable, avoid CDN dependencies and fall back to static SVG or simple semantic HTML blocks.
- Do not assume Datell-only helpers such as `callTool(...)` exist unless they are actually exposed by the current host.
- When MCP is unavailable, still inline the Datell shell classes and theme variables instead of switching to a different design language.
- When MCP is unavailable, keep the result non-interactive and do not emit filter controls, event-bus hooks, or linkage logic.
- When using ApexCharts, keep the same Datell card shell, use `new ApexCharts(...)` inside the chosen `chart-card`, and prefer `window.__APEX_PALETTE__` when the host exposes it.
- When using ECharts, keep the same Datell card shell, guard the chart container before `echarts.init(...)`, and keep an explicit chart height.

## Guardrails

- Do not return partial snippets that require the user to reconstruct the page.
- Do not produce placeholder metrics unless the user asked for a mock or example.
- Do not overbuild the layout when one chart and a few KPI cards are enough.
- Do not hide missing data assumptions. State them briefly in the subtitle or a note.
- Do not ignore an available `datell_generate_chart` runtime and silently downgrade to prompt-only output.
- Do not claim MCP is available unless you checked and found the tool.
- Do not mix arbitrary card class names when Datell already has a closer card-library variant.

## Reference

See [the visual report pattern guide](references/visual-report-pattern.md) for the recommended page structure, CSS skeleton, and chart bootstrapping pattern.

See [the Datell knowledge index](references/datell-knowledge-index.md) for the full publishable markdown index of layouts, palettes, and card components.

See [the Datell design system playbook](references/datell-design-system-playbook.md) for reusable card families, layout families, palette presets, and domain-to-layout guidance.

See [the Datell chart engine playbook](references/datell-chart-engine-playbook.md) for ECharts versus ApexCharts decision rules, shared card integration rules, and engine-specific initialization patterns.

See [the real-sales example input](assets/real-sales-december-2024.json) and [the matching standalone report example](assets/real-sales-december-2024-basic-report.html) for a real-data no-MCP validation pack.
