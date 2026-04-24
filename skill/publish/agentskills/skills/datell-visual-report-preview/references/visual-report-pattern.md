# Visual Report Pattern Guide

Use this reference when the task needs more than a trivial chart snippet.

## Recommended Page Structure

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Report Title</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <style>
      body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f5f7fb; color: #172033; }
      .wrap { max-width: 1120px; margin: 0 auto; padding: 32px 24px 48px; }
      .hero { margin-bottom: 20px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
      .card { background: #fff; border: 1px solid #d9e2f2; border-radius: 18px; box-shadow: 0 14px 36px rgba(15, 23, 42, 0.08); }
      .kpi { padding: 18px; }
      #chart { height: 420px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="hero">
        <h1>Report Title</h1>
        <p>Short context line with timeframe or segmentation.</p>
      </header>
      <section class="kpis">
        <article class="card kpi">...</article>
        <article class="card kpi">...</article>
      </section>
      <section class="card">
        <div id="chart"></div>
      </section>
    </div>
    <script>
      const chart = echarts.init(document.getElementById('chart'));
      chart.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [120, 168, 210] }]
      });
    </script>
  </body>
</html>
```

## KPI Rules

- Keep KPI labels short.
- Pair raw value with a one-line interpretation when useful.
- Avoid more than 4 KPI cards unless the task explicitly asks for a dense dashboard.

## Visual Rules

- Use one dominant accent color and neutral surfaces.
- Give charts enough vertical space to avoid cramped labels.
- Prefer readable spacing over squeezing in extra charts.

## Offline Fallback

If the environment cannot use CDN assets, replace the chart section with one of:

- inline SVG bar or line chart
- semantic HTML table plus lightweight trend badges
- KPI-only summary page when a real chart would be misleading