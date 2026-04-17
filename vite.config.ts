import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import * as https from 'https';
import * as http from 'http';

/**
 * Dev-only CORS proxy plugin.
 * Forwards requests from /dev-llm-proxy to the real LLM API URL specified
 * in the X-Dev-Proxy-Target header, adding CORS headers on the response.
 * This plugin is ONLY active during `vite dev` (`apply: 'serve'`), so it
 * has zero impact on production builds.
 */
function devLlmProxyPlugin(): Plugin {
  return {
    name: 'dev-llm-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-llm-proxy', (req, res) => {
        const targetUrl = req.headers['x-dev-proxy-target'] as string | undefined;
        if (!targetUrl) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('Missing X-Dev-Proxy-Target header');
          return;
        }

        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('Invalid X-Dev-Proxy-Target URL');
          return;
        }

        const forwardHeaders: http.OutgoingHttpHeaders = {};
        for (const [k, v] of Object.entries(req.headers)) {
          // Strip hop-by-hop and our custom header; set Host to target
          if (['host', 'x-dev-proxy-target', 'connection', 'transfer-encoding'].includes(k)) continue;
          forwardHeaders[k] = v;
        }
        forwardHeaders['host'] = parsed.host;

        const options: https.RequestOptions = {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + parsed.search,
          method: req.method || 'POST',
          headers: forwardHeaders,
        };

        const proxyReq = https.request(options, (proxyRes) => {
          const resHeaders: http.OutgoingHttpHeaders = {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
          };
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (k.toLowerCase() === 'transfer-encoding') continue;
            resHeaders[k] = v;
          }
          res.writeHead(proxyRes.statusCode ?? 200, resHeaders);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain' });
          }
          res.end(`Proxy error: ${err.message}`);
        });

        req.pipe(proxyReq, { end: true });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devLlmProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
  },
  /**
   * Compile-time constants.
   * __ENTERPRISE_BUILD__ is set to `true` only when the env var ENTERPRISE_BUILD=true
   * is present at build time (i.e. via `npm run build:win:enterprise`).
   * Vite will tree-shake all `if (__ENTERPRISE_BUILD__) { ... }` branches in
   * community/OSS builds, completely removing enterprise model code.
   */
  define: {
    __ENTERPRISE_BUILD__: JSON.stringify(process.env.ENTERPRISE_BUILD === 'true'),
  },
});
