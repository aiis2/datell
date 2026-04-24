# Datell Design System Playbook

Use this reference when the no-MCP fallback should stay visually close to Datell's in-app report preview. This document is intentionally reusable across future skills that need Datell cards, layouts, and palettes.

## Card Families

### KPI Cards

- `kpi-card`: default metric summary card.
- `kpi-bullet-card`: progress or target-attainment card with bullet track.
- `kpi-ranked-list`: ranked KPI summary with inline bars.
- `kpi-traffic-light`: operational health card with red, yellow, green state.
- `kpi-risk-flag`: alert-oriented KPI with severity strip.
- `kpi-two-period`: current versus previous comparison block.
- `kpi-multi`: compact grid of many sub-metrics inside one card.

### Chart Cards

- `chart-card`: default analytical visualization wrapper.
- `card-subtitle`: secondary framing line under the chart title.
- `chart-footer`: source note, caveat, or takeaway.
- `chart-container md|lg|full`: choose height based on chart density.

### Table Cards

- `ranked-table`: top-N or leaderboard tables.
- `scorecard-table`: KPI status rows with badges.
- `heatmap-table`: cell-level intensity comparison.
- `comparison-table`: side-by-side comparisons.
- `pivot-table`: denser matrix-style summaries.

### Narrative And Structure Cards

- `insight-callout`: prominent key takeaway or warning.
- `text-summary-card`: short executive narrative with bullet highlights.
- `metric-narrative`: one main value plus explanatory paragraph.
- `timeline-horizontal` and `timeline-dual-track`: milestone or sequence storytelling.
- `process-steps`: workflow or funnel stages.
- `comparison-twoCol`: structured two-column qualitative comparison.

## Layout Families

- `dashboard-2col`: balanced default for KPI row plus two-column analytical grid.
- `dashboard-3col`: wide-screen monitoring and denser dashboards.
- `bento-grid`: asymmetric hero-card composition.
- `compact-dashboard`: dense operations board with small gaps and many cards.
- `magazine-wide`: dominant main story plus supporting side rail.
- `print-a4`: calmer printable report flow.
- `mobile-first`: narrow-screen single-column delivery.

When interaction or denser composition matters, prefer the zone-based shell:

- `report-zones`
- `zone-kpi`
- `zone-filter`
- `zone-content`

## Palette Presets

Use palette variables rather than inventing one-off colors.

- `palette-classic`: business blue default.
- `palette-royal-blue`: high-trust enterprise blue.
- `palette-slate-dark`: dark dashboard with purple-blue accents.
- `palette-cyberpunk`: neon dark theme for bold operational boards.
- `palette-editorial`: restrained black-white editorial look.
- `palette-coral`: warmer ecommerce or marketing storytelling.

Minimum CSS variables to inline in standalone HTML:

- `--bg-body`
- `--bg-card`
- `--bg-card-alt`
- `--text-main`
- `--text-sub`
- `--text-accent`
- `--color-primary`
- `--color-success`
- `--color-warning`
- `--color-danger`
- `--border-table`
- `--radius-card`
- `--shadow-card`
- `--palette-color-1` through `--palette-color-6`

## Domain Mapping

### Finance

- Preferred layouts: `finance/kpi-3col`, `finance/pnl-report`, `finance/cashflow-timeline`, `finance/risk-matrix`.
- Preferred cards: `kpi-bullet-card`, `kpi-two-period`, `scorecard-table`, `metric-narrative`, `insight-callout`.
- Palette direction: `palette-classic`, `palette-royal-blue`, or `palette-slate-dark`.

### Ecommerce

- Preferred layouts: `ecommerce/gmv-overview`, `ecommerce/funnel-conversion`, `ecommerce/order-status`, `ecommerce/product-heatmap`.
- Preferred cards: `kpi-ranked-list`, `kpi-traffic-light`, `chart-card`, `heatmap-table`, `text-summary-card`.
- Palette direction: `palette-classic`, `palette-coral`, or `palette-editorial` depending on tone.

## Reuse Rules

- Start with a Datell shell class before inventing custom wrappers.
- Pick one layout family first, then choose cards that fit that layout.
- Choose the chart engine only after layout family and card combination are already decided.
- Keep all accent colors tied to palette variables.
- For no-MCP fallback, prefer a credible static report over fake interactivity.

For engine-specific guidance, see `datell-chart-engine-playbook.md`.