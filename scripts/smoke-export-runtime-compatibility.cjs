const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('ts-node/register/transpile-only');
const { EXPORT_CSP } = require('../src/main/exportDocumentStore.ts');
const { inlineBuiltInRuntimes } = require('../src/main/exportRuntime.ts');

if (!process.argv.includes('--expect-isolated')) {
  console.error('Usage: node scripts/smoke-export-runtime-compatibility.cjs --expect-isolated');
  process.exit(2);
}

const projectRoot = path.resolve(__dirname, '..');
const vendorRoot = path.join(projectRoot, 'public', 'vendor');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-export-runtime-smoke-'));
const html = inlineBuiltInRuntimes(`<!doctype html><html><head>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/apexcharts@3/dist/apexcharts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@visactor/vtable/dist/vtable.min.js"></script>
</head><body>
<div id="echart" style="width:320px;height:180px"></div>
<div id="apex" style="width:320px;height:180px"></div>
<div id="vtable" style="width:320px;height:180px"></div>
<script>
window.__runtimeProbe = (async function () {
  var result = {
    echarts: typeof echarts === 'object',
    apex: typeof ApexCharts === 'function',
    vtable: typeof VTable === 'object' && typeof VTable.ListTable === 'function',
    tableRows: 0
  };
  if (result.echarts) {
    var chart = echarts.init(document.getElementById('echart'));
    chart.setOption({ xAxis: { type: 'category', data: ['A'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] });
    result.echartsCanvas = !!document.querySelector('#echart canvas');
  }
  if (result.apex) {
    var apex = new ApexCharts(document.getElementById('apex'), { chart: { type: 'line', height: 160 }, series: [{ data: [1, 2] }] });
    await apex.render();
    result.apexSvg = !!document.querySelector('#apex svg');
  }
  if (result.vtable) {
    var vt = new VTable.ListTable(document.getElementById('vtable'), {
      columns: [{ field: 'name', title: 'Name' }],
      records: [{ name: 'runtime-row' }]
    });
    result.vtableCanvas = !!document.querySelector('#vtable canvas');
    if (vt && typeof vt.release === 'function') setTimeout(function () { try { vt.release(); } catch (_) {} }, 200);
  }
  var table = document.createElement('table');
  table.id = 'excel-table';
  table.innerHTML = '<tr><th>Runtime</th></tr><tr><td>packaged</td></tr>';
  document.body.appendChild(table);
  result.tableRows = table.rows.length;
  return result;
})();
</script></body></html>`, {
  echarts: fs.readFileSync(path.join(vendorRoot, 'echarts.min.js'), 'utf8'),
  apexcharts: fs.readFileSync(path.join(vendorRoot, 'apexcharts.min.js'), 'utf8'),
  vtable: fs.readFileSync(path.join(vendorRoot, 'vtable.min.js'), 'utf8'),
});

const mainSource = `
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, protocol, session } = require('electron');
protocol.registerSchemesAsPrivileged([{ scheme: 'export', privileges: { standard: true, secure: true } }]);
const fixtureRoot = process.env.DATELL_RUNTIME_FIXTURE_ROOT;
const documentUrl = process.env.DATELL_RUNTIME_DOCUMENT_URL;
const csp = process.env.DATELL_RUNTIME_CSP;
app.whenReady().then(async () => {
  const requests = [];
  const ses = session.fromPartition('datell-runtime-smoke-' + Date.now());
  ses.protocol.handle('export', (request) => request.url === documentUrl
    ? new Response(fs.readFileSync(path.join(fixtureRoot, 'report.html')), { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp } })
    : new Response('Not Found', { status: 404 }));
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    requests.push(details.url); callback({ cancel: true });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, webSecurity: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await win.loadURL(documentUrl);
  const runtime = await win.webContents.executeJavaScript('window.__runtimeProbe');
  const payload = { runtime, requests, protocol: await win.webContents.executeJavaScript('location.protocol') };
  const pass = payload.protocol === 'export:' && requests.length === 0 && runtime.echarts && runtime.apex && runtime.vtable
    && runtime.echartsCanvas && runtime.apexSvg && runtime.vtableCanvas && runtime.tableRows === 2;
  console.log('__EXPORT_RUNTIME_SMOKE__' + JSON.stringify({ ...payload, pass }));
  win.destroy(); app.exit(pass ? 0 : 1);
});
`;

try {
  fs.writeFileSync(path.join(fixtureRoot, 'report.html'), html, 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'main.cjs'), mainSource, 'utf8');
  const result = spawnSync(require('electron'), [path.join(fixtureRoot, 'main.cjs')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATELL_RUNTIME_FIXTURE_ROOT: fixtureRoot,
      DATELL_RUNTIME_DOCUMENT_URL: 'export://runtime-smoke.localhost/document.html',
      DATELL_RUNTIME_CSP: EXPORT_CSP,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error) throw result.error;
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status !== 0) {
    console.error(combined);
    process.exit(result.status || 1);
  }
  const marker = combined.split(/\r?\n/).find((line) => line.includes('__EXPORT_RUNTIME_SMOKE__'));
  if (!marker) throw new Error(`runtime smoke marker missing:\n${combined}`);
  const payload = JSON.parse(marker.slice(marker.indexOf('__EXPORT_RUNTIME_SMOKE__') + '__EXPORT_RUNTIME_SMOKE__'.length));
  if (!payload.pass) throw new Error(`runtime compatibility failed: ${JSON.stringify(payload)}`);
  console.log(marker.trim());
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
