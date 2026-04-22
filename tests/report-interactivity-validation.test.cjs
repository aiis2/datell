const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  validateReportInteractivity,
} = require('../src/renderer/utils/reportInteractivityValidation.ts');

const brokenHtml = `<!doctype html>
<html>
  <body>
    <div class="zone-filter" data-filter-group="main">
      <select class="filter-zone-select" data-filter-field="门店">
        <option value="">全部</option>
        <option value="北京">北京</option>
      </select>
      <button class="filter-zone-reset" data-action="filter-reset">重置</button>
    </div>

    <div class="card chart-card" data-card-id="store_rank_chart">
      <div id="store_rank_chart"></div>
      <script>
      document.addEventListener('DOMContentLoaded', function() {
        var rawData = [{"门店":"北京","销售金额":100}];
        var chart = new ApexCharts(document.querySelector('#store_rank_chart'), {
          series: [{ name: '销售金额', data: [{ x: '北京', y: 100 }] }]
        });
        chart.render().then(function() {
          window.__REPORT_EVENT_BUS__?.registerApex('store_rank_chart', chart);
        });
        window.__REPORT_EVENT_BUS__?.emit('store_rank_chart', 'click', { name: '北京', value: 100 });
      });
      <\/script>
    </div>
  </body>
</html>`;

const issues = validateReportInteractivity(brokenHtml);

assert(
  issues.some((issue) => issue.code === 'FILTER_UI_WITHOUT_UPDATE_LOGIC'),
  'expected filter UI without update logic to be flagged',
);

assert(
  issues.some((issue) => issue.code === 'CHART_EMIT_WITHOUT_INTERACTIONS'),
  'expected emit() without data-interactions to be flagged',
);

const brokenDrillHtml = `<!doctype html>
<html>
  <body>
    <div
      class="card chart-card"
      data-card-id="region_chart"
      data-interactions='[{"trigger":"click","action":"drill_down","targetCardIds":["detail_chart"],"payloadMapping":{"region":"$event.name"}}]'
    >
      <div id="region_chart"></div>
      <script>
      document.addEventListener('DOMContentLoaded', function() {
        var chart = new ApexCharts(document.querySelector('#region_chart'), {
          series: [{ name: '销售金额', data: [{ x: '华北', y: 120 }] }]
        });
        chart.render().then(function() {
          window.__REPORT_EVENT_BUS__?.registerApex('region_chart', chart);
        });
      });
      <\/script>
    </div>
  </body>
</html>`;

const drillIssues = validateReportInteractivity(brokenDrillHtml);

assert(
  drillIssues.some((issue) => issue.code === 'DRILL_RULE_WITHOUT_CONTEXT'),
  'expected drill_down rules without drillSql/drillDimension/drillPaths to be flagged',
);

const orphanDrillUiHtml = `<!doctype html>
<html>
  <body>
    <div class="card chart-card" data-card-id="sales_chart">
      <div class="drill-breadcrumb"></div>
      <button class="drill-up-btn">返回上层</button>
      <div id="sales_chart"></div>
    </div>
  </body>
</html>`;

const orphanDrillUiIssues = validateReportInteractivity(orphanDrillUiHtml);

assert(
  orphanDrillUiIssues.some((issue) => issue.code === 'DRILL_UI_WITHOUT_RULES'),
  'expected drill UI without any drill interaction rules to be flagged',
);

const validHtml = `<!doctype html>
<html>
  <body>
    <div class="filter-global-panel">
      <div class="filter-group">
        <label class="filter-label">门店</label>
        <select class="filter-select" data-filter-id="store_filter" data-filter-type="dropdown">
          <option value="">全部</option>
          <option value="北京">北京</option>
        </select>
      </div>
    </div>

    <div
      class="card chart-card"
      data-card-id="store_rank_chart"
      data-interactions='[{"trigger":"click","action":"filter","column":"门店","targetCardIds":["detail_table"]}]'
      data-sql="SELECT 门店, SUM(销售金额) AS 销售金额 FROM orders {{WHERE}} GROUP BY 门店"
    >
      <div id="store_rank_chart"></div>
      <script>
      document.addEventListener('DOMContentLoaded', function() {
        var chart = new ApexCharts(document.querySelector('#store_rank_chart'), {
          series: [{ name: '销售金额', data: [{ x: '北京', y: 100 }] }]
        });
        chart.render().then(function() {
          window.__REPORT_EVENT_BUS__?.registerApex('store_rank_chart', chart);
        });
      });
      <\/script>
    </div>
  </body>
</html>`;

assert.equal(
  validateReportInteractivity(validHtml).length,
  0,
  'expected valid interactivity HTML to pass validation',
);

const brokenFilteredKpiHtml = `<!doctype html>
<html>
  <body>
    <div class="filter-global-panel">
      <div class="filter-group">
        <label class="filter-label">门店</label>
        <select class="filter-select" data-filter-id="store_filter" data-filter-type="dropdown">
          <option value="">全部</option>
          <option value="北京">北京</option>
        </select>
      </div>
    </div>

    <div class="card kpi-card" data-card-id="kpi_total_sales">
      <span class="kpi-title">总销售额</span>
      <span class="kpi-value">¥9999</span>
    </div>

    <div class="card chart-card" data-card-id="store_rank_chart">
      <div id="store_rank_chart"></div>
      <script>
      document.addEventListener('DOMContentLoaded', function() {
        var rawData = [{"门店":"北京","销售金额":100}];
        var chart = new ApexCharts(document.querySelector('#store_rank_chart'), {
          series: [{ name: '销售金额', data: [{ x: '北京', y: 100 }] }]
        });
        chart.render().then(function() {
          window.__REPORT_EVENT_BUS__?.registerApex('store_rank_chart', chart);
        });
        document.addEventListener('filterChange', function() {
          chart.updateSeries([{ data: [{ x: '北京', y: 100 }] }], false);
        });
      });
      <\/script>
    </div>
  </body>
</html>`;

assert(
  validateReportInteractivity(brokenFilteredKpiHtml).some(
    (issue) => issue.code === 'FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC',
  ),
  'expected filtered KPI without update path to be flagged',
);

const staticFilteredKpiHtml = `<!doctype html>
<html>
  <body>
    <div class="filter-global-panel">
      <div class="filter-group">
        <label class="filter-label">门店</label>
        <select class="filter-select" data-filter-id="store_filter" data-filter-type="dropdown">
          <option value="">全部</option>
          <option value="北京">北京</option>
        </select>
      </div>
    </div>

    <div class="card kpi-card" data-card-id="target_hint" data-kpi-static="true">
      <span class="kpi-title">月度目标</span>
      <span class="kpi-value">¥10000</span>
    </div>

    <div class="card chart-card" data-card-id="store_rank_chart" data-sql="SELECT 门店, SUM(销售金额) AS 销售金额 FROM orders {{WHERE}} GROUP BY 门店">
      <div id="store_rank_chart"></div>
      <script>
      document.addEventListener('DOMContentLoaded', function() {
        var chart = new ApexCharts(document.querySelector('#store_rank_chart'), {
          series: [{ name: '销售金额', data: [{ x: '北京', y: 100 }] }]
        });
        chart.render().then(function() {
          window.__REPORT_EVENT_BUS__?.registerApex('store_rank_chart', chart);
        });
      });
      <\/script>
    </div>
  </body>
</html>`;

assert.equal(
  validateReportInteractivity(staticFilteredKpiHtml).filter(
    (issue) => issue.code === 'FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC',
  ).length,
  0,
  'expected explicitly static KPI to skip filtered KPI validation',
);

const manualFilteredKpiHtml = `<!doctype html>
<html>
  <body>
    <div class="filter-global-panel">
      <div class="filter-group">
        <label class="filter-label">门店</label>
        <select class="filter-select" data-filter-id="store_filter" data-filter-type="dropdown">
          <option value="">全部</option>
          <option value="北京">北京</option>
        </select>
      </div>
    </div>

    <div class="card kpi-card" data-card-id="kpi_total_sales">
      <span class="kpi-title">总销售额</span>
      <span class="kpi-value">¥9999</span>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.addEventListener('filterChange', function() {
        var valueEl = document.querySelector('[data-card-id="kpi_total_sales"] .kpi-value');
        if (valueEl) valueEl.textContent = '¥100';
      });
    });
    <\/script>
  </body>
</html>`;

assert.equal(
  validateReportInteractivity(manualFilteredKpiHtml).filter(
    (issue) => issue.code === 'FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC',
  ).length,
  0,
  'expected manually refreshed KPI to pass filtered KPI validation',
);

const jqueryStyleManualKpiHtml = `<!doctype html>
<html>
  <body>
    <div class="filter-global-panel">
      <div class="filter-group">
        <label class="filter-label">门店</label>
        <select class="filter-select" data-filter-id="store_filter" data-filter-type="dropdown">
          <option value="">全部</option>
          <option value="北京">北京</option>
        </select>
      </div>
    </div>

    <div class="card kpi-card" data-card-id="kpi_total_sales">
      <span class="kpi-title">总销售额</span>
      <span class="kpi-value">¥9999</span>
    </div>

    <script>
    $(document).on('filterChange', function() {
      $('[data-card-id="kpi_total_sales"] .kpi-value').text('¥100');
    });
    <\/script>
  </body>
</html>`;

assert.equal(
  validateReportInteractivity(jqueryStyleManualKpiHtml).filter(
    (issue) => issue.code === 'FILTERABLE_KPI_WITHOUT_UPDATE_LOGIC',
  ).length,
  0,
  'expected jQuery-style KPI refresh to pass filtered KPI validation',
);

console.log('report interactivity validation ok');