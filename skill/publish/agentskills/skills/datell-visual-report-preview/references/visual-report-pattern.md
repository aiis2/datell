# Visual Report Pattern Guide

Use this reference when the task needs more than a trivial chart snippet. The goal is to keep the standalone no-MCP fallback visually close to Datell's real shell.

## Datell Shell Structure

Use the same semantic skeleton Datell uses in its report shell.

- `report-container`: the page root.
- `report-header`: title, subtitle, timestamp, or one-sentence narrative framing.
- `report-content`: the main stack for cards and sections.
- `grid-kpi`: the KPI row for summary cards.
- `grid-charts`: the main chart and narrative grid.
- `report-zones`, `zone-kpi`, `zone-filter`, `zone-content`: the denser three-zone layout for monitoring dashboards and reports with controls.

## Layout Selection

Choose a layout family before writing the HTML.

- `dashboard-2col`: balanced default for most management dashboards.
- `dashboard-3col`: wide-screen KPI walls and denser chart boards.
- `bento-grid`: asymmetrical hero-card composition with one or two emphasis blocks.
- `compact-dashboard`: high-density realtime monitoring.
- `magazine-wide`: one main story plus one supporting side rail.
- `print-a4`: printable document flow with calmer spacing.
- `mobile-first`: narrow-screen single-column flow.

If the domain is obvious, mimic the card rhythm of real Datell layouts like `finance/kpi-3col`, `ecommerce/gmv-overview`, `sales/daily-report`, or `operations/server-monitor`.

## Card Catalog

Prefer these concrete card-library classes when composing fallback HTML.

- KPI: `kpi-card`, `kpi-bullet-card`, `kpi-ranked-list`, `kpi-traffic-light`, `kpi-risk-flag`, `kpi-two-period`, `kpi-multi`.
- Charts: `chart-card`, `card-subtitle`, `chart-footer`, `chart-container md`, `chart-container lg`, `chart-container full`.
- Tables: `ranked-table`, `scorecard-table`, `heatmap-table`, `comparison-table`, `pivot-table`.
- Narrative: `insight-callout`, `text-summary-card`, `metric-narrative`, `comparison-twoCol`.
- Structure: `timeline-horizontal`, `timeline-dual-track`, `process-steps`.
- Controls: `filter-btn-group`, `filter-select`, `filter-checkbox-group` only when the page is meant to stay interactive.

## Theme Variables

Inline Datell-style CSS variables even when no app shell or MCP runtime is available.

```css
:root {
  --bg-body: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-alt: #f1f5f9;
  --text-main: #1e293b;
  --text-sub: #64748b;
  --text-accent: #3b82f6;
  --color-primary: #3b82f6;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --border-table: #e2e8f0;
  --radius-card: 12px;
  --shadow-card: 0 12px 30px rgba(15, 23, 42, 0.08);
  --bg-header: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);
  --text-header: #ffffff;
  --palette-color-1: #3b82f6;
  --palette-color-2: #10b981;
  --palette-color-3: #f59e0b;
  --palette-color-4: #ef4444;
  --palette-color-5: #8b5cf6;
  --palette-color-6: #6366f1;
}
```

Use palette families close to real Datell presets.

- `palette-classic`: clean business blue.
- `palette-slate-dark`: dark dashboard with purple-blue accents.
- `palette-editorial`: restrained black-white editorial look.
- `palette-cyberpunk`: neon dark theme for bold monitoring boards.

## Reference HTML Skeleton

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Report Title</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <style>
      :root {
        --bg-body: #f8fafc;
        --bg-card: #ffffff;
        --bg-card-alt: #f1f5f9;
        --text-main: #1e293b;
        --text-sub: #64748b;
        --text-accent: #3b82f6;
        --color-primary: #3b82f6;
        --color-success: #10b981;
        --color-warning: #f59e0b;
        --color-danger: #ef4444;
        --border-table: #e2e8f0;
        --radius-card: 12px;
        --shadow-card: 0 12px 30px rgba(15, 23, 42, 0.08);
        --bg-header: linear-gradient(135deg, #3b82f6 0%, #10b981 100%);
        --text-header: #ffffff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: var(--bg-body);
        color: var(--text-main);
      }
      .report-container { min-height: 100vh; }
      .report-header {
        padding: 28px 32px;
        background: var(--bg-header);
        color: var(--text-header);
      }
      .report-content {
        max-width: 1280px;
        margin: 0 auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .grid-kpi {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
      .grid-charts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
      }
      .card {
        background: var(--bg-card);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-card);
        padding: 20px;
      }
      .kpi-card,
      .kpi-bullet-card,
      .text-summary-card,
      .metric-narrative,
      .chart-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .kpi-value,
      .narrative-value { color: var(--text-accent); font-weight: 800; }
      .kpi-ranked-list,
      .text-summary-card .summary-highlights {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .insight-callout {
        background: rgba(59, 130, 246, 0.05);
        border-left: 4px solid var(--color-primary);
      }
      .chart-container { height: 360px; }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .data-table th,
      .data-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--border-table);
      }
      .scorecard-table .status-badge.achieved { color: var(--color-success); }
    </style>
  </head>
  <body>
    <div class="report-container">
      <header class="report-header">
        <h1 class="report-title">Revenue Quality Review</h1>
        <p class="report-timestamp">Updated 2026-04-24 · layout: dashboard-2col · palette: palette-classic</p>
      </header>
      <main class="report-content">
        <section class="grid-kpi">
          <article class="card kpi-card">
            <div class="kpi-title">Net revenue</div>
            <div class="kpi-value">$4.8M</div>
            <div class="kpi-trend up">+8.4% vs last month</div>
          </article>
          <article class="card kpi-bullet-card">
            <div class="kpi-title">Target attainment</div>
            <div class="kpi-value">92%</div>
            <div class="kpi-bullet-track">
              <div class="kpi-bullet-range" style="--range-pct:100%"></div>
              <div class="kpi-bullet-actual" style="--actual-pct:92%"></div>
              <div class="kpi-bullet-target" style="--target-pct:95%"></div>
            </div>
          </article>
          <article class="card kpi-traffic-light">
            <div class="tl-lights">
              <span class="tl-dot green active"></span>
              <span class="tl-dot yellow"></span>
              <span class="tl-dot red"></span>
            </div>
            <div class="tl-body">
              <div class="kpi-title">Fulfilment status</div>
              <div class="kpi-value">Stable</div>
              <div class="tl-status status-ok">On track</div>
            </div>
          </article>
          <article class="card kpi-ranked-list">
            <div class="card-title">Top segments</div>
            <div class="rank-item"><span class="rank-num rank-1">1</span><span class="rank-label">Enterprise</span><span class="rank-value">38%</span></div>
            <div class="rank-item"><span class="rank-num rank-2">2</span><span class="rank-label">SMB</span><span class="rank-value">31%</span></div>
          </article>
        </section>
        <section class="grid-charts">
          <article class="card chart-card">
            <div class="card-title">Revenue trend</div>
            <div class="card-subtitle">Primary monthly time series</div>
            <div id="chart" class="chart-container"></div>
            <div class="chart-footer">Use palette-color-1 through palette-color-4 for series.</div>
          </article>
          <article class="card text-summary-card">
            <div class="card-title">Executive summary</div>
            <div class="summary-highlights">
              <div class="highlight-item">Growth accelerated in enterprise accounts.</div>
              <div class="highlight-item">Refund pressure remains concentrated in one region.</div>
            </div>
            <div class="summary-conclusion">Keep acquisition investment in the highest-converting segment.</div>
          </article>
          <article class="card insight-callout success">
            <div class="insight-body">
              <div class="insight-title">Key insight</div>
              <div class="insight-text">The margin mix improved even though discount rate stayed flat.</div>
            </div>
          </article>
          <article class="card">
            <div class="card-title">Regional scorecard</div>
            <table class="data-table scorecard-table">
              <thead>
                <tr><th>Region</th><th>Revenue</th><th class="col-status">Status</th></tr>
              </thead>
              <tbody>
                <tr><td>North</td><td>$1.8M</td><td class="col-status"><span class="status-badge achieved">Achieved</span></td></tr>
                <tr><td>South</td><td>$1.1M</td><td class="col-status"><span class="status-badge on-track">On track</span></td></tr>
              </tbody>
            </table>
          </article>
        </section>
      </main>
    </div>
    <script>
      const chart = echarts.init(document.getElementById('chart'));
      chart.setOption({
        color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr'] },
        yAxis: { type: 'value' },
        series: [{ type: 'line', smooth: true, data: [3.8, 4.1, 4.4, 4.8] }]
      });
    </script>
  </body>
</html>
```

## Chart Engine Variants

Use the same `chart-card` and `chart-container` shell for both engines.

- ECharts variant: use `echarts.init(...)` and the Datell shell classes already shown above.
- ApexCharts variant: keep the same outer HTML, but initialize with `new ApexCharts(...)`.
- Do not fork the card structure by engine. Engine choice changes chart bootstrapping, not card integration.
- If the host preloads ECharts or ApexCharts, skip CDN tags. If the host does not preload them and standalone HTML is acceptable, include the CDN tag for the chosen engine.

### ApexCharts Variant Example

```html
<article class="card chart-card">
  <div class="card-title">Service latency</div>
  <div class="card-subtitle">ApexCharts dark dashboard variant</div>
  <div id="latency-apex" class="chart-container"></div>
</article>
<script>
  var el = document.getElementById('latency-apex');
  if (!el) throw new Error('Missing chart container: latency-apex');
  var apexFg = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#1a1a2e';
  var chart = new ApexCharts(el, {
    chart: { type: 'bar', background: 'transparent', foreColor: apexFg },
    colors: window.__APEX_PALETTE__ || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    series: [{ name: 'Latency', data: [180, 160, 210, 190] }],
    xaxis: { categories: ['North', 'South', 'West', 'East'] }
  });
  chart.render();
</script>
```

## No-CDN Fallback

If the environment cannot use CDN assets, keep the same shell structure and card classes, but replace the main chart block with one of the following:

- inline SVG line or bar chart using `--palette-color-*`
- a `scorecard-table` or `comparison-table` plus a `text-summary-card`
- a `metric-narrative` hero section plus ranked KPI cards when charting would be misleading