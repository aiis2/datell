# Datell Chart Engine Playbook

Use this reference when a skill-driven agent must choose between ECharts and ApexCharts without breaking Datell's card library or layout system.

## Shared Integration Rule

ECharts and ApexCharts do **not** change the outer Datell shell.

- Keep the same `report-container`, `report-header`, `report-content`, `grid-kpi`, `grid-charts`, `report-zones`, and `zone-content` skeleton.
- Keep the same card wrappers such as `card`, `chart-card`, `kpi-card`, `text-summary-card`, and `insight-callout`.
- Keep the same `chart-container` contract: explicit height, same spacing, same card title and subtitle rhythm.

Choose the chart engine **after** layout family and card combination are already decided.

## Agent Flow

1. Choose layout family.
2. Choose card combination.
3. Choose chart engine.
4. Fill the shared Datell HTML shell.
5. Add engine-specific initialization code inside the chosen `chart-card` blocks.

## Engine Decision

### Prefer ECharts When

- the report is business, finance, comparison-heavy, or mixed with dense analytical cards
- you need broader chart variety with flexible composition
- you want the safest default for Datell-style management dashboards
- the output includes KPI mini charts or mixed chart plus narrative sections

### Prefer ApexCharts When

- the report is a modern dark dashboard or a technology-style monitoring board
- you want smoother default motion and a more polished card-wall feel
- the layout is `dashboard-3col`, `compact-dashboard`, or a dense `bento-grid`
- the user explicitly asks for ApexCharts, modern dashboard styling, or dark-theme monitoring

## ECharts Integration

- Preferred wrapper: `chart-card` + `chart-container`
- Initialization pattern: `var chart = echarts.init(el);`
- Always guard container lookup before `echarts.init()`.
- Keep explicit pixel height on the chart container.
- If the host preloads ECharts, do not add a CDN script tag.
- If the host does not preload ECharts and standalone HTML is acceptable, include an ECharts CDN script.

```html
<article class="card chart-card">
  <div class="card-title">Revenue trend</div>
  <div class="card-subtitle">Monthly movement</div>
  <div id="revenue-trend" class="chart-container"></div>
</article>
<script>
  var el = document.getElementById('revenue-trend');
  if (!el) throw new Error('Missing chart container: revenue-trend');
  var chart = echarts.init(el);
  chart.setOption({
    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr'] },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, data: [3.8, 4.1, 4.4, 4.8] }]
  });
</script>
```

## ApexCharts Integration

- Preferred wrapper: the **same** `chart-card` + `chart-container`
- Initialization pattern: `var chart = new ApexCharts(el, options);`
- Keep explicit pixel height on the chart container.
- If the host preloads ApexCharts, do not add a CDN script tag.
- If the host does not preload ApexCharts and standalone HTML is acceptable, include an ApexCharts CDN script.
- When Datell palette variables exist, prefer them and use `window.__APEX_PALETTE__` when the host exposes it.
- When the host supports Datell interactivity, register the chart after render with `window.__REPORT_EVENT_BUS__?.registerApex(cardId, chart)`.

```html
<article class="card chart-card">
  <div class="card-title">Active services</div>
  <div class="card-subtitle">Dark monitoring panel</div>
  <div id="service-health" class="chart-container"></div>
</article>
<script>
  var el = document.getElementById('service-health');
  if (!el) throw new Error('Missing chart container: service-health');
  var apexFg = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#e2e8f0';
  var chart = new ApexCharts(el, {
    chart: { type: 'area', background: 'transparent', foreColor: apexFg },
    colors: window.__APEX_PALETTE__ || ['#38bdf8', '#818cf8', '#34d399', '#f59e0b'],
    series: [{ name: 'Requests', data: [320, 410, 388, 452] }],
    xaxis: { categories: ['00:00', '06:00', '12:00', '18:00'] }
  });
  chart.render().then(function() {
    window.__REPORT_EVENT_BUS__?.registerApex('service-health', chart);
  }).catch(function(err) {
    console.error('[ApexCharts render error]', err);
  });
</script>
```

## Impact On Card Integration

The engine choice affects the inner chart code, not the card system.

- Same shell: yes.
- Same card wrappers: yes.
- Same layout families: yes.
- Same theme and palette variables: yes.
- Different initialization API: yes.
- Different optional interactivity registration details: yes.

## Loading Assumptions

- Host-preloaded mode: preferred when the embedding host already preloads ECharts or ApexCharts.
- CDN mode: acceptable for standalone HTML artifacts when the host does not preload the chosen engine.
- Offline mode: if neither preloaded libraries nor CDN access are available, keep the same card shell and replace the chart with inline SVG or a narrative plus table fallback.