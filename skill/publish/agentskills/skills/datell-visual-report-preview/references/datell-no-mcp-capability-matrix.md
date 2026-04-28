# Datell No-MCP Capability Matrix

Use this matrix when MCP is unavailable and the task still expects the Datell card library rather than a generic HTML dashboard.

## Core Point

The published skill mirrors the full current app-side card inventory in [datell-card-catalog.md](datell-card-catalog.md). That means the skill can reason from the complete library, not only from a reduced teaching subset.

No-MCP delivery is narrower: some cards map directly to static HTML, some require a static equivalent, and some are intentionally out of scope when the page must remain non-interactive.

## Support Tiers

### Full Catalog Knowledge Coverage

- The published card catalog is the public mirror of the current app-side card ID inventory.
- Use it whenever the task needs to choose cards by app-side picker ID or family.
- Knowledge coverage does not imply one-to-one runtime parity in standalone HTML.

### Direct Static Support

These families translate directly into a credible no-MCP standalone report.

- KPI families: `kpi-single`, `kpi-trend`, `kpi-sparkline`, `kpi-bar`, `kpi-comparison`, `kpi-bullet`, `kpi-two-period`, `kpi-ranked-list`, `kpi-traffic-light`, `kpi-risk-flag`, `kpi-multi-row`, and similar metric-summary variants.
- Table families: ranked tables, scorecards, comparison tables, pivot-style summaries, cohort-style summaries, and heatmap-like tables when rendered with semantic HTML plus inline CSS.
- Narrative and structure families: `text-summary-card`, `insight-callout`, `metric-narrative`, `comparison-twoCol`, `timeline-horizontal`, `timeline-dual-track`, `process-steps`, `cover-page`, `section-header`, `roadmap-card`, and `image-embed-card`.

### Partial Or Static-Equivalent Support

These families remain usable without MCP, but they should be rendered with a static equivalent instead of trying to reproduce full in-app runtime behavior.

- Most chart families: bar, line, pie, scatter, heatmap, funnel, treemap, radar, gauge, mixed charts, and finance snapshots can be rendered through ECharts, ApexCharts, inline SVG, or semantic HTML.
- Map, network, chord, and 3D families can still be presented as static SVG, image-backed diagrams, or simplified ranked views when a full interactive runtime is not safe.
- `vtable-*` families should degrade to plain semantic tables or pivot-style HTML blocks.
- Realtime or streaming families should become a documented snapshot instead of a live board.
- `org-chart`, `mind-map`, and `process-flowchart-svg` should use inline SVG or simpler semantic layout rather than assuming a host-side diagram runtime.

### Out Of Scope Without MCP

These capabilities should not be emitted in the no-MCP basic-report path.

- `filter-*` families.
- `zone-filter`, `filter-btn-group`, `filter-select`, `filter-checkbox-group`, `filter-search-box`, `filter-global-panel`, and similar controls.
- `window.__REPORT_EVENT_BUS__`, `filterChange`, linked brushing, drilldown hooks, or any cross-card linkage logic.
- Any behavior that depends on shared client-side state between cards.

## Selection Rules

1. Start from the full card catalog so the selected layout still reflects the real Datell library.
2. Prefer direct static-support cards first.
3. If the chosen card is only partially supported, switch to the closest static equivalent instead of dropping the Datell shell.
4. If the card belongs to the out-of-scope interactive set, replace it with a narrative, scorecard, or static chart alternative.
5. Keep the no-MCP result self-contained: shell CSS, variant CSS, charts, images, and data assumptions must all live in the same deliverable.

## Practical Examples

- `table-scorecard` -> use `scorecard-table` in semantic HTML.
- `kpi-ranked-list` -> use a ranked static list with inline bars.
- `image-embed-card` -> use inline SVG, a local asset, or a safe remote image with descriptive copy.
- `map-world` -> use a static SVG or ranked geographic summary instead of an interactive map widget.
- `vtable-pivot` -> use a static `pivot-table` style HTML matrix.
- `filter-dropdown-single` -> remove it entirely in no-MCP mode and replace it with a sentence describing the active scope.