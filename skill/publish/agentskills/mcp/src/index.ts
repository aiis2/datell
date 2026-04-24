import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const DATELL_MCP_SERVER_NAME = 'datell-mcp';
const DATELL_MCP_SERVER_VERSION = '0.1.0';

const reportInputSchema = z.object({
  html: z.string().min(1).describe('Complete HTML document for the report.'),
  title: z.string().min(1).describe('Human-readable report title.'),
  theme: z.string().min(1).optional().describe('Optional theme hint.')
});

const reportOutputSchema = z.object({
  title: z.string(),
  theme: z.string().nullable(),
  artifactPath: z.string(),
  outputDir: z.string(),
  outputMode: z.literal('html-file'),
  bytes: z.number().int().nonnegative()
});

function sanitizeFileSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'report';
}

function looksLikeCompleteHtmlDocument(html: string): boolean {
  return /<!doctype html>/i.test(html) && /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html);
}

function getOutputDirectory(): string {
  return process.env.DATELL_MCP_OUTPUT_DIR || path.join(os.tmpdir(), 'datell-mcp-output');
}

async function persistHtmlArtifact(title: string, html: string): Promise<{ artifactPath: string; outputDir: string; bytes: number }> {
  const outputDir = getOutputDirectory();
  await mkdir(outputDir, { recursive: true });

  const fileName = `${Date.now()}-${sanitizeFileSegment(title)}-${randomUUID()}.html`;
  const artifactPath = path.join(outputDir, fileName);
  await writeFile(artifactPath, html, 'utf8');

  return {
    artifactPath,
    outputDir,
    bytes: Buffer.byteLength(html, 'utf8')
  };
}

function createServer(): McpServer {
  const server = new McpServer({ name: DATELL_MCP_SERVER_NAME, version: DATELL_MCP_SERVER_VERSION });

  server.registerTool(
    'datell_generate_chart',
    {
      title: 'Datell Generate Chart',
      description: 'Persist a complete HTML report as a Datell visual-report artifact.',
      inputSchema: reportInputSchema,
      outputSchema: reportOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ html, title, theme }): Promise<CallToolResult> => {
      if (!looksLikeCompleteHtmlDocument(html)) {
        return {
          content: [
            {
              type: 'text',
              text: 'datell_generate_chart expects a complete HTML document containing <!doctype html>, <html>, and <body>.'
            }
          ],
          isError: true
        };
      }

      const artifact = await persistHtmlArtifact(title, html);
      const structuredContent = {
        title,
        theme: theme ?? null,
        artifactPath: artifact.artifactPath,
        outputDir: artifact.outputDir,
        outputMode: 'html-file' as const,
        bytes: artifact.bytes
      };

      return {
        content: [
          {
            type: 'text',
            text: `Saved visual report "${title}" to ${artifact.artifactPath}`
          }
        ],
        structuredContent
      };
    }
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    void server.close().finally(() => process.exit(0));
  });

  await server.connect(transport);
}

main().catch((error) => {
  console.error('[datell-mcp]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});