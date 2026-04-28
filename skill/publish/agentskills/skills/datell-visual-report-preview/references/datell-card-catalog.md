# Datell Card Catalog

Use this catalog as the source-of-truth inventory of current Datell card component IDs.

## Rules

- Catalog IDs below are the current app-side picker IDs.
- Standalone HTML still uses the Datell report shell from [visual-report-pattern.md](visual-report-pattern.md).
- Chart IDs are chart archetypes that should be rendered inside the shared `chart-card` plus `chart-container` shell.
- Filter IDs are documented for completeness, but they are out of bounds for the no-MCP basic-report fallback.

## Common App-ID To HTML-Class Mappings

- `kpi-bar` -> `kpi-bar-kpi`
- `kpi-bullet` -> `kpi-bullet-card`
- `kpi-comparison` -> `kpi-comparison-card`
- `kpi-rank-badge` -> `kpi-rank`
- `table-ranked-top5`, `table-ranked-top10`, `table-top-n` -> `ranked-table`
- `table-scorecard` -> `scorecard-table`
- `table-heatmap-cell` -> `heatmap-table`
- `table-comparison` -> `comparison-table`
- `table-pivot-2d` -> `pivot-table`

## KPI Cards

- Core numeric cards: `kpi-single`, `kpi-trend`, `kpi-sparkline`, `kpi-bar`, `kpi-comparison`, `kpi-gauge-ring`, `kpi-target-bar`, `kpi-bullet`.
- Dense summary and ranking: `kpi-multi-row`, `kpi-ranked-list`, `kpi-heatmap-cell`, `kpi-segmented`, `kpi-donut-ratio`, `kpi-traffic-light`, `kpi-waterfall-delta`, `kpi-dual-compare`.
- Analytical KPI variants: `kpi-rolling-avg`, `kpi-percentile`, `kpi-composite`, `kpi-risk-flag`, `kpi-forecast-vs-actual`, `kpi-cohort-retention`, `kpi-nps`, `kpi-conversion-rate`, `kpi-growth-matrix`.
- Business and operational KPI variants: `kpi-stock-ticker`, `kpi-capacity-util`, `kpi-sla-uptime`, `kpi-budget-variance`, `kpi-churn-rate`, `kpi-cac-ltv`, `kpi-pipeline-value`, `kpi-health-score`, `kpi-countdown`, `kpi-change-indicator`, `kpi-rank-badge`, `kpi-two-period`, `kpi-milestone`, `kpi-alert-info`, `alert-success`, `alert-warning`, `alert-danger`.

## Chart Components

### Bar Family

- `bar-basic`, `bar-horizontal`, `bar-stacked`, `bar-stacked-100pct`, `bar-grouped`, `bar-waterfall`, `bar-negative`, `bar-lollipop`, `bar-histogram`, `bar-diverging`, `bar-race`, `bar-polar`.

### Line And Area Family

- `line-single`, `line-multi`, `line-smooth`, `line-area`, `line-area-gradient`, `line-area-stacked`, `line-step`, `line-with-markers`, `line-band`, `line-dual-axis`.

### Pie And Donut Family

- `pie-basic`, `pie-donut`, `pie-rose`, `pie-nested`, `pie-sunburst`, `pie-half-donut`, `pie-waffle`, `pie-progress`.

### Scatter And Heatmap Family

- `scatter-basic`, `scatter-bubble`, `scatter-regression`, `scatter-cluster`, `scatter-quadrant`, `scatter-3d`.
- `heatmap-matrix`, `heatmap-calendar`, `heatmap-correlation`, `heatmap-geo`, `heatmap-risk`.

### Hierarchy, Flow, And Map Family

- `treemap-flat`, `treemap-hierarchical`, `sankey-flow`, `funnel-standard`, `funnel-comparison`, `radar-chart`, `chord-diagram`, `network-graph`, `map-china`, `map-world`, `map-city-scatter`, `map-flight-route`.

### Finance And Advanced Analytical Family

- `candlestick`, `candlestick-ma`, `ohlc-bar`, `volume-chart`, `rsi-chart`, `macd-chart`, `yield-curve`, `options-payoff`, `drawdown-chart`, `rolling-returns`.
- `area-stream`, `pareto-chart`, `population-pyramid`, `bullet-chart`, `gauge-chart`, `slope-chart`, `bump-chart`, `mixed-bar-line`, `realtime-line`, `multi-radial`.

## Table Components

- Ranked and summary tables: `table-ranked-top5`, `table-ranked-top10`, `table-top-n`, `table-detail-basic`, `table-detail-paginated`, `table-comparison`, `table-pivot-2d`, `table-scorecard`, `table-heatmap-cell`.
- Tree, schedule, and action tables: `table-tree`, `table-gantt`, `table-action-list`, `table-data-dict`, `table-inline-trend`, `table-cohort`, `table-ab-test`, `table-financial`, `table-status-board`, `table-risk-register`, `table-schedule`.
- VTable-backed variants: `vtable-basic`, `vtable-pivot`, `vtable-tree`, `vtable-frozen`, `vtable-sort-filter`.

## Structure Components

- Timeline and process blocks: `timeline-vertical`, `timeline-horizontal`, `timeline-dual-track`, `process-steps`, `process-flowchart-svg`, `swimlane-process`, `roadmap-card`.
- Diagram and organization blocks: `mind-map`, `org-chart`.
- Narrative and framing blocks: `text-summary-card`, `insight-callout`, `image-embed-card`, `comparison-twoCol`, `metric-narrative`, `cover-page`, `section-header`.

## Filter Components

- Date and period controls: `filter-date-range`, `filter-date-picker-single`, `filter-year-month`, `filter-date-preset`, `filter-quarter-picker`.
- Dimension and selection controls: `filter-dropdown-single`, `filter-dropdown-multi`, `filter-checkbox-group`, `filter-radio-group`, `filter-cascade`, `filter-segment`.
- Search, range, and state controls: `filter-search-box`, `filter-numeric-range`, `filter-tag-pills`, `filter-reset-button`, `filter-global-panel`.

## No-MCP Restriction

When `datell_generate_chart` is unavailable, do not use any `filter-*` components above. The standalone basic report should stay static, non-interactive, and free of event-bus or cross-card linkage logic.
