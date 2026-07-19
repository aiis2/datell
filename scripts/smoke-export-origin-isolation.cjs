const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const expectation = process.argv.includes('--expect-file-readable')
  ? 'file-readable'
  : process.argv.includes('--expect-isolated')
    ? 'isolated'
    : null;

if (!expectation) {
  console.error('Usage: node scripts/smoke-export-origin-isolation.cjs --expect-file-readable|--expect-isolated');
  process.exit(2);
}

const projectRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-export-origin-smoke-'));
const secretPath = path.join(fixtureRoot, 'secret.txt');
fs.writeFileSync(secretPath, 'export-local-secret-sentinel', 'utf8');

const escapeScript = (source) => source.replace(/<\/script/gi, '<\\/script');
const echarts = escapeScript(fs.readFileSync(path.join(projectRoot, 'public/vendor/echarts.min.js'), 'utf8'));
const apex = escapeScript(fs.readFileSync(path.join(projectRoot, 'public/vendor/apexcharts.min.js'), 'utf8'));
const fileUrl = require('node:url').pathToFileURL(secretPath).href;

const reportHtml = `<!doctype html><html><head>
<meta charset="utf-8">
<script>${echarts}</script>
<script>${apex}</script>
</head><body>
<div id="echart" style="width:320px;height:180px"></div>
<div id="apex" style="width:320px;height:180px"></div>
<script>
(function () {
  window.__inlineRan = true;
  window.__fileProbe = fetch(${JSON.stringify(fileUrl)})
    .then(function (r) { return r.text(); })
    .then(function (text) { return { ok: true, text: text }; })
    .catch(function (error) { return { ok: false, name: error.name, message: error.message }; });
  window.__xhrProbe = new Promise(function (resolve) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ${JSON.stringify(fileUrl)});
    xhr.onload = function () { resolve({ ok: true, text: xhr.responseText }); };
    xhr.onerror = function () { resolve({ ok: false, name: 'error' }); };
    try { xhr.send(); } catch (error) { resolve({ ok: false, name: error.name }); }
  });
  window.__workerProbe = new Promise(function (resolve) {
    try {
      var worker = new Worker(URL.createObjectURL(new Blob(['self.postMessage(1)'], { type: 'text/javascript' })));
      worker.onmessage = function () { worker.terminate(); resolve({ ok: true }); };
      worker.onerror = function (error) { worker.terminate(); resolve({ ok: false, name: error && error.error ? error.error.name : 'error' }); };
      setTimeout(function () { worker.terminate(); resolve({ ok: false, name: 'timeout' }); }, 500);
    } catch (error) { resolve({ ok: false, name: error.name }); }
  });
  window.__popupAttempt = Promise.resolve().then(function () {
    try { window.open(${JSON.stringify(fileUrl)}, '_blank'); return true; }
    catch (error) { return false; }
  });
  var escapeFrame = document.createElement('iframe');
  escapeFrame.src = ${JSON.stringify(fileUrl)};
  escapeFrame.id = 'escape-frame';
  document.body.appendChild(escapeFrame);
  window.__tableProbe = Promise.resolve().then(function () {
    var table = document.createElement('table');
    table.id = 'generated-table';
    table.innerHTML = '<tr><th>Metric</th></tr><tr><td>safe-table</td></tr>';
    document.body.appendChild(table);
    return table.rows.length;
  });
  try {
    var chart = echarts.init(document.getElementById('echart'));
    chart.setOption({ xAxis: { type: 'category', data: ['A', 'B'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] });
  } catch (error) { window.__echartsError = error.name + ':' + error.message; }
  try {
    var apexChart = new ApexCharts(document.getElementById('apex'), { chart: { type: 'line', height: 160 }, series: [{ data: [1, 2] }] });
    window.__apexProbe = apexChart.render().then(function () { return true; }).catch(function () { return false; });
  } catch (error) { window.__apexProbe = Promise.resolve(false); window.__apexError = error.name + ':' + error.message; }
})();
</script></body></html>`;

const preloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('exportProbeApi', {
  report: (result) => ipcRenderer.send('export-probe-result', result),
});
`;

const mainSource = `
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');
const expectation = process.env.DATELL_EXPORT_EXPECTATION;
const fixtureRoot = process.env.DATELL_EXPORT_FIXTURE_ROOT;
const html = fs.readFileSync(path.join(fixtureRoot, 'report.html'), 'utf8');
const documentUrl = process.env.DATELL_EXPORT_DOCUMENT_URL;
const secretPath = process.env.DATELL_EXPORT_SECRET_PATH;
protocol.registerSchemesAsPrivileged([
  { scheme: 'export', privileges: { standard: true, secure: true } },
]);
let popupCount = 0;
let navigationCount = 0;
let requestLog = [];
function finish(code, payload) {
  console.log('__EXPORT_ORIGIN_SMOKE__' + JSON.stringify(payload));
  setTimeout(() => app.exit(code), 40);
}
app.whenReady().then(async () => {
  const jobSession = expectation === 'isolated'
    ? session.fromPartition('datell-export-smoke-' + Date.now().toString(16))
    : null;
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      ...(jobSession ? { session: jobSession } : {}),
      preload: path.join(fixtureRoot, 'preload.cjs'),
      sandbox: expectation === 'isolated',
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
    },
  });
  if (jobSession) {
    jobSession.protocol.handle('export', (request) => {
      const url = new URL(request.url);
      if (request.url !== documentUrl) return new Response('Not found', { status: 404 });
      return new Response(html, { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.undraw.co; font-src 'self' data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      } });
    });
    jobSession.webRequest.onBeforeRequest({ urls: ['*://*/*', 'file://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      requestLog.push({ url: details.url, resourceType: details.resourceType, canceled: true });
      callback({ cancel: true });
    });
    jobSession.setPermissionCheckHandler(() => false);
    jobSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.setWindowOpenHandler(() => { popupCount += 1; return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event) => { navigationCount += 1; event.preventDefault(); });
    win.webContents.on('will-frame-navigate', (event) => { navigationCount += 1; event.preventDefault(); });
  } else {
    win.webContents.on('did-create-window', () => { popupCount += 1; });
  }
  ipcMain.on('export-probe-result', async (event) => {
    if (event.sender !== win.webContents) return;
    const result = await win.webContents.executeJavaScript(\`Promise.all([
      window.__fileProbe,
      window.__xhrProbe,
      window.__workerProbe,
      window.__popupAttempt,
      window.__tableProbe,
      window.__apexProbe || false,
      Promise.resolve({
        protocol: location.protocol,
        origin: location.origin,
        inlineRan: !!window.__inlineRan,
        echarts: typeof echarts === 'object' && !window.__echartsError,
        apex: typeof ApexCharts === 'function',
        tableText: document.querySelector('#generated-table td')?.innerText || '',
        secretPath: ${JSON.stringify(secretPath)},
      }),
    ])\`);
    const [fileProbe, xhrProbe, workerProbe, popupAttempt, tableRows, apexRendered, meta] = result;
    const isolated = expectation === 'isolated';
    const pass = isolated
      ? meta.protocol === 'export:' && !fileProbe.ok && !xhrProbe.ok && !workerProbe.ok && tableRows === 2
        && meta.inlineRan && meta.echarts && meta.apex && apexRendered && meta.tableText === 'safe-table' && popupCount === 0
      : meta.protocol === 'file:' && fileProbe.ok && fileProbe.text === 'export-local-secret-sentinel';
    finish(pass ? 0 : 1, { expectation, result: { fileProbe, xhrProbe, workerProbe, popupAttempt, tableRows, apexRendered, meta }, popupCount, navigationCount, requestLog, pass });
  });
  await win.loadURL(expectation === 'isolated' ? documentUrl : 'file://' + path.join(fixtureRoot, 'report.html'));
  await win.webContents.executeJavaScript('window.exportProbeApi.report({ ready: true })');
  setTimeout(() => finish(1, { expectation, timeout: true, popupCount, navigationCount, requestLog, pass: false }), 20000);
});
`;

try {
  fs.writeFileSync(path.join(fixtureRoot, 'report.html'), reportHtml, 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'preload.cjs'), preloadSource, 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'main.cjs'), mainSource, 'utf8');
  const token = 'export-' + require('node:crypto').randomUUID() + '.localhost';
  const documentUrl = 'export://' + token + '/document.html';
  const result = spawnSync(electronPath, [path.join(fixtureRoot, 'main.cjs')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATELL_EXPORT_EXPECTATION: expectation,
      DATELL_EXPORT_FIXTURE_ROOT: fixtureRoot,
      DATELL_EXPORT_DOCUMENT_URL: documentUrl,
      DATELL_EXPORT_SECRET_PATH: secretPath,
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
  const marker = combined.split(/\r?\n/).find((line) => line.includes('__EXPORT_ORIGIN_SMOKE__'));
  if (!marker) throw new Error(`Electron smoke result marker missing:\n${combined}`);
  const payload = JSON.parse(marker.slice(marker.indexOf('__EXPORT_ORIGIN_SMOKE__') + '__EXPORT_ORIGIN_SMOKE__'.length));
  if (!payload.pass) throw new Error(`Electron smoke expectation failed: ${JSON.stringify(payload)}`);
  console.log(marker.trim());
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
