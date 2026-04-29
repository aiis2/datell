---
name: frontend-design-report
description: Search and install alias for frontend-design-report. Create Datell-style visual reports, dashboards, KPI summaries, and standalone no-MCP HTML reports with the same runtime contract as datell-visual-report-preview.
license: MIT
compatibility: Designed for Agent Skills compatible coding agents. If a Datell MCP runtime exposing datell_generate_chart is available, use it; otherwise generate standalone HTML directly.
metadata:
  author: aiis2
  track: alias-skill
  scope: visual-report-discovery
  canonical_skill: datell-visual-report-preview
---

# frontend-design-report

This skill is the repository-name alias for `datell-visual-report-preview`.

Use it when the user searches for or installs the repository by the name `frontend-design-report`, or when the request is for Datell-style visual reports, dashboards, KPI summaries, chart-heavy HTML pages, or standalone no-MCP report output.

## Shared Runtime Contract

This alias intentionally resolves to the same capability surface as the primary skill.

1. Check whether the current runtime can call a Datell MCP tool named `datell_generate_chart`.
2. If that MCP tool exists, prefer the MCP runtime path.
3. If that MCP tool does not exist, fall back to a polished standalone HTML report.
4. Do not fail the task only because MCP is unavailable when a standalone HTML deliverable is acceptable.

## Output Contract

Produce a complete HTML document rather than a fragment.

1. Include `<!doctype html>`, `<html>`, `<head>`, and `<body>`.
2. Include a clear report title and a short context line.
3. Put KPI summary cards above the main evidence block when metrics are available.
4. Return or write a ready-to-open HTML artifact, not only prose.

## No-MCP Fallback Rules

When MCP is unavailable, the alias skill must use the same fallback discipline as the primary skill.

- Produce a static, non-interactive standalone HTML report.
- Do not use filter controls in the no-MCP path.
- Do not emit `window.__REPORT_EVENT_BUS__`, `filterChange`, cross-card linkage, linked brushing, or drilldown hooks.
- Prefer Datell shell classes, palette variables, and concrete card-library variants instead of a generic HTML dashboard.
- If a chart runtime cannot be loaded safely, fall back to static SVG or semantic HTML rather than fake interactivity.

## Canonical References

This alias skill reuses the same reference system as `datell-visual-report-preview`.

- Start from [the Datell knowledge index](../datell-visual-report-preview/references/datell-knowledge-index.md).
- Use [the Datell layout catalog](../datell-visual-report-preview/references/datell-layout-catalog.md) for canonical layout IDs.
- Use [the Datell palette catalog](../datell-visual-report-preview/references/datell-palette-catalog.md) for palette selection.
- Use [the Datell card catalog](../datell-visual-report-preview/references/datell-card-catalog.md) for current app-side card coverage.
- Use [the no-MCP capability matrix](../datell-visual-report-preview/references/datell-no-mcp-capability-matrix.md) to distinguish direct static support, static-equivalent support, and out-of-scope interactive families.
- Use [the visual report pattern guide](../datell-visual-report-preview/references/visual-report-pattern.md) for shell structure and standalone composition.
- Use [the chart engine playbook](../datell-visual-report-preview/references/datell-chart-engine-playbook.md) when ECharts versus ApexCharts is part of the decision.

## Example Assets

Use the same public examples as the primary skill.

- [U.S. agriculture export example](../datell-visual-report-preview/assets/us-ag-exports-top8-2011-basic-report.html)
- [European GDP magazine example](../datell-visual-report-preview/assets/europe-gdp-top8-2014-magazine-report.html)
- [SaaS subscription health example](../datell-visual-report-preview/assets/saas-subscription-health-ibm-telco-bento-report.html)

## Relationship To The Primary Skill

`datell-visual-report-preview` remains the canonical skill name.

`frontend-design-report` exists so repository-name discovery, installation, and future search indexing can resolve to the same Datell visual report workflow instead of pointing to an unrelated capability.