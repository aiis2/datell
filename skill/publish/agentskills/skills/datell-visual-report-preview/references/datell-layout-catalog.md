# Datell Layout Catalog

Use this catalog as the source-of-truth list of built-in Datell layout IDs that the current report design UI exposes.

## Rules

- Use the layout ID verbatim.
- Pair each layout with one palette ID and a card mix that matches the layout density.
- Keep the no-MCP fallback static even when the chosen layout normally supports control zones.

## Universal

- `universal/single-col`: document-style single-column stack.
- `universal/poster-single`: portrait poster with one full-page hero composition.
- `universal/poster-wide`: wide 16:9 poster layout.
- `universal/dashboard-2col`: balanced default dashboard with KPI row and two chart columns.
- `universal/dashboard-3col`: wide high-density dashboard with three main columns.
- `universal/bento-grid`: asymmetric bento-style grid with hero spans.
- `universal/compact-dashboard`: compact dense monitoring board.
- `universal/magazine-wide`: editorial 2/3 plus 1/3 split.
- `universal/print-a4`: printable A4 document flow.
- `universal/mobile-first`: narrow-screen single-column mobile layout.

## Finance

- `finance/kpi-3col`: finance KPI-led three-column board.
- `finance/pnl-report`: profit-and-loss report layout.
- `finance/monitoring-realtime`: realtime finance monitoring dashboard.
- `finance/risk-matrix`: risk matrix layout.
- `finance/cashflow-timeline`: cashflow timeline and waterfall layout.
- `finance/trading-candlestick`: trading and candlestick market layout.

## Ecommerce

- `ecommerce/gmv-overview`: GMV overview dashboard.
- `ecommerce/funnel-conversion`: ecommerce funnel conversion layout.
- `ecommerce/order-status`: order-status monitoring board.
- `ecommerce/product-heatmap`: product sales heatmap layout.
- `ecommerce/user-behavior`: ecommerce user-behavior analysis layout.

## Operations

- `operations/server-monitor`: server-performance monitoring board.
- `operations/sla-monitor`: SLA service-level monitor.
- `operations/incident-flow`: incident-management flow layout.
- `operations/capacity-planning`: capacity-planning layout.
- `operations/logistics-map`: operations map-centered logistics layout.

## Sales

- `sales/crm-pipeline`: CRM pipeline funnel layout.
- `sales/daily-report`: sales daily-report dashboard.
- `sales/quota-progress`: sales quota-progress board.
- `sales/regional-analysis`: region-analysis layout.
- `sales/territory-map`: territory-map sales distribution layout.

## HR

- `hr/headcount-dashboard`: headcount and staffing dashboard.
- `hr/performance`: HR performance evaluation layout.
- `hr/hr-onboarding`: onboarding-process tracking layout.
- `hr/talent-matrix`: talent matrix layout.

## Marketing

- `marketing/campaign-performance`: campaign performance board.
- `marketing/attribution`: channel attribution analysis layout.
- `marketing/mkt-ab-test`: A/B test report layout.
- `marketing/social-analytics`: social analytics layout.

## Logistics

- `logistics/route-optimizer`: logistics route-optimization layout.
- `logistics/warehouse-heatmap`: warehouse heatmap layout.

## Medical

- `medical/patient-flow`: patient-flow process layout.
- `medical/clinical-outcomes`: clinical-outcomes analysis layout.

## Editorial

- `editorial/article-analytics`: article analytics layout.
- `editorial/content-calendar`: content calendar layout.
