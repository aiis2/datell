import assert from 'node:assert/strict';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client, StdioClientTransport } from '@modelcontextprotocol/client';

const outputDir = path.join(os.tmpdir(), 'datell-mcp-output');
await mkdir(outputDir, { recursive: true });
const beforeFiles = new Set(await readdir(outputDir));

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(scriptDir, '..', 'dist', 'index.js');

const client = new Client({ name: 'datell-mcp-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry]
});

try {
  await client.connect(transport);

  const toolResult = await client.listTools();
  assert.ok(toolResult.tools.some((tool) => tool.name === 'datell_generate_chart'), 'server should expose datell_generate_chart');

  const result = await client.callTool({
    name: 'datell_generate_chart',
    arguments: {
      html: '<!doctype html><html><head><meta charset="utf-8" /></head><body><h1>Smoke Report</h1></body></html>',
      title: 'Smoke Report',
      theme: 'palette-classic'
    }
  });

  assert.notEqual(result.isError, true, 'tool call should succeed');

  const afterFiles = await readdir(outputDir);
  const createdFile = afterFiles.find((fileName) => !beforeFiles.has(fileName) && fileName.endsWith('.html'));
  assert.ok(createdFile, 'tool call should write a new HTML artifact');

  const artifactHtml = await readFile(path.join(outputDir, createdFile), 'utf8');
  assert.match(artifactHtml, /Smoke Report/, 'artifact should contain the supplied report title');

  console.log('mcp smoke ok');
} finally {
  await client.close();
}