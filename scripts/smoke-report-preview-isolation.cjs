const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const expectation = process.argv.includes('--expect-exposed')
  ? 'exposed'
  : process.argv.includes('--expect-isolated')
    ? 'isolated'
    : null;

if (!expectation) {
  console.error('Usage: node scripts/smoke-report-preview-isolation.cjs --expect-exposed|--expect-isolated');
  process.exit(2);
}

const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');
const electronPath = require('electron');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datell-report-origin-smoke-'));

const reportProbe = `<!doctype html><html><body>
<div class="grid-charts" style="display:grid;grid-template-columns:repeat(2,1fr)">
  <article id="smoke-card" class="card"><h3>Smoke chart</h3><div id="probe">probe</div></article>
</div>
<div data-filter-id="region" data-filter-type="dropdown"><select><option>all</option></select></div>
<script>
(function () {
  var sent = false;
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'chart-resize' || sent) return;
    sent = true;
    setTimeout(function () {
      var observation;
      try {
        var apiType = typeof top.electronAPI;
        observation = {
          apiType: apiType,
          sentinel: apiType === 'object' && typeof top.electronAPI.sentinel === 'function'
            ? top.electronAPI.sentinel()
            : null,
          topTitle: top.document.title
        };
      } catch (error) {
        observation = { apiType: 'blocked', errorName: error && error.name ? error.name : String(error) };
      }
      observation.libraries = {
        echarts: typeof echarts === 'object',
        apex: typeof ApexCharts === 'function',
        vtable: typeof VTable === 'object'
      };
      observation.eventBus = !!window.__REPORT_EVENT_BUS__;
      observation.filterState = !!window.__FILTER_STATE__;
      var customStyle = document.getElementById('__custom-layout-style');
      observation.customCss = !!customStyle && customStyle.textContent.indexOf('smoke-isolated-css') !== -1;
      observation.resizeReceived = true;
      top.postMessage({ type: 'probe-result', observation: observation }, '*');
    }, 80);
  });
  top.postMessage({ type: 'report-runtime-ready' }, '*');
  void VTable;
})();
<\/script></body></html>`;

const shellUrl = expectation === 'exposed'
  ? 'app://localhost/report-shell.html'
  : 'report://localhost/report-shell.html?parentOrigin=app%3A%2F%2Flocalhost';
const shellOrigin = expectation === 'exposed' ? '*' : 'report://localhost';
const encodedReport = Buffer.from(reportProbe, 'utf8').toString('base64');

const topHtml = `<!doctype html><html><head><meta charset="utf-8"><title>privileged-top</title></head><body>
<iframe id="shell" sandbox="allow-scripts allow-same-origin"></iframe>
<script>
  const shell = document.getElementById('shell');
  const shellUrl = ${JSON.stringify(shellUrl)};
  const shellOrigin = ${JSON.stringify(shellOrigin)};
  const reportHtml = atob(${JSON.stringify(encodedReport)});
  let renderSent = false;
  let observation = null;
  let layoutInspection = null;
  function finishWhenReady() {
    if (observation && layoutInspection) {
      window.electronAPI.reportResult({ observation, layoutInspection });
    }
  }
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'shell-ready' && event.source === shell.contentWindow && !renderSent) {
      renderSent = true;
      shell.contentWindow.postMessage({ type: 'render', html: reportHtml, theme: null }, shellOrigin);
      return;
    }
    if (event.data && event.data.type === 'report-runtime-ready') {
      shell.contentWindow.postMessage({
        type: 'theme-update',
        theme: { colors: ['#123456'], primary: '#123456', bodyBg: '#ffffff', cardBg: '#ffffff', textColor: '#111111', isDark: false }
      }, shellOrigin);
      shell.contentWindow.postMessage({ type: 'inject-custom-css', css: '.card{--smoke-isolated-css:1}' }, shellOrigin);
      shell.contentWindow.postMessage({ type: 'inspect-layout', requestId: 'smoke-layout' }, shellOrigin);
      shell.contentWindow.postMessage({ type: 'chart-resize' }, shellOrigin);
      return;
    }
    if (event.data && event.data.type === 'probe-result') {
      observation = event.data.observation;
      finishWhenReady();
      return;
    }
    if (event.data && event.data.type === 'layout-inspection' && event.data.requestId === 'smoke-layout'
        && event.source === shell.contentWindow && event.origin === shellOrigin) {
      layoutInspection = event.data;
      finishWhenReady();
    }
  });
  shell.src = shellUrl;
<\/script></body></html>`;

const preloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  sentinel: () => 'privileged-sentinel',
  reportResult: (result) => ipcRenderer.send('probe-result', result),
});
`;

const mainSource = `
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'report', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const fixtureRoot = process.env.DATELL_SMOKE_FIXTURE_ROOT;
const publicRoot = process.env.DATELL_SMOKE_PUBLIC_ROOT;
const expectation = process.env.DATELL_SMOKE_EXPECTATION;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' })[ext] || 'application/octet-stream';
}

function responseFor(request, root) {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname.replace(/^\\/+/, '')) || 'top.html';
  const filePath = path.resolve(root, relative);
  if (filePath !== path.resolve(root) && !filePath.startsWith(path.resolve(root) + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    return new Response(fs.readFileSync(filePath), { headers: { 'content-type': contentType(filePath) } });
  } catch (error) {
    return new Response(String(error), { status: 404 });
  }
}

let settled = false;
function finish(code, detail) {
  if (settled) return;
  settled = true;
  console.log('__REPORT_ORIGIN_SMOKE__' + JSON.stringify(detail));
  setTimeout(() => app.exit(code), 20);
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const pathname = new URL(request.url).pathname;
    return responseFor(request, pathname === '/top.html' ? fixtureRoot : publicRoot);
  });
  protocol.handle('report', (request) => responseFor(request, publicRoot));

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(fixtureRoot, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ipcMain.on('probe-result', (event, result) => {
    if (event.sender !== win.webContents) return;
    const observation = result && result.observation ? result.observation : result;
    const exposed = observation && observation.apiType === 'object' && observation.sentinel === 'privileged-sentinel';
    const isolated = observation && observation.apiType === 'blocked' && observation.errorName === 'SecurityError';
    const compatibility = !!(result && result.layoutInspection
      && result.layoutInspection.gridColumns === 2
      && Array.isArray(result.layoutInspection.cards)
      && result.layoutInspection.cards.some((card) => card.cardId === 'smoke-card')
      && observation.libraries && observation.libraries.echarts
      && observation.libraries.apex && observation.libraries.vtable
      && observation.eventBus && observation.filterState
      && observation.customCss && observation.resizeReceived);
    const pass = expectation === 'exposed' ? exposed : isolated && compatibility;
    finish(pass ? 0 : 1, { expectation, result, pass });
  });

  win.loadURL('app://localhost/top.html').catch((error) => finish(1, { expectation, loadError: error.message, pass: false }));
  setTimeout(() => finish(1, { expectation, timeout: true, pass: false }), 20000);
});
`;

try {
  fs.writeFileSync(path.join(fixtureRoot, 'top.html'), topHtml, 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'preload.cjs'), preloadSource, 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'main.cjs'), mainSource, 'utf8');

  const result = spawnSync(electronPath, [path.join(fixtureRoot, 'main.cjs')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATELL_SMOKE_FIXTURE_ROOT: fixtureRoot,
      DATELL_SMOKE_PUBLIC_ROOT: publicRoot,
      DATELL_SMOKE_EXPECTATION: expectation,
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
  const marker = combined.split(/\r?\n/).find((line) => line.includes('__REPORT_ORIGIN_SMOKE__'));
  assertMarker(marker, combined);
  console.log(marker.trim());
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function assertMarker(marker, output) {
  if (!marker) {
    throw new Error(`Electron smoke result marker missing:\n${output}`);
  }
  const payload = JSON.parse(marker.slice(marker.indexOf('__REPORT_ORIGIN_SMOKE__') + '__REPORT_ORIGIN_SMOKE__'.length));
  if (!payload.pass) {
    throw new Error(`Electron smoke expectation failed: ${JSON.stringify(payload)}`);
  }
}
