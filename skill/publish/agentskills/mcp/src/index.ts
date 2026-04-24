export type DatellGenerateChartArgs = {
  html: string;
  title: string;
  theme?: string;
};

export const DATELL_MCP_SERVER_NAME = 'datell-mcp';

export const VISUAL_REPORT_TOOLS = [
  {
    name: 'datell_generate_chart',
    description: 'Generate a Datell-hosted visual report from a complete HTML document.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Complete HTML document for the report.' },
        title: { type: 'string', description: 'Report title.' },
        theme: { type: 'string', description: 'Optional theme hint.' },
      },
      required: ['html', 'title'],
    },
  },
] as const;

export function createSkeletonNotice(): string {
  return [
    'Track B skeleton only.',
    'Wire datell_generate_chart to Datell\'s real visual report runtime in a later phase.',
  ].join(' ');
}