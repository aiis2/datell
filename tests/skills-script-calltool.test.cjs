require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');

const { mergeRuntimeToolSources } = require('../src/renderer/tools/runtimeMerge.ts');

function makeTool(name, description, execute) {
  return {
    name,
    description,
    parameters: [],
    execute,
  };
}

(async () => {
  const merged = mergeRuntimeToolSources({
    builtIns: [
      makeTool('report_sink', 'persist report preview', async (args) => `report:${String(args.title ?? '')}`),
      makeTool('analysis_sink', 'perform analysis', async (args) => `analysis:${String(args.metric ?? '')}`),
    ],
    registrySkills: [
      {
        id: 'report-composer',
        name: 'Report Composer',
        description: 'compose a report via built-in tools',
        version: '1.0.0',
        source: 'registry/user/report-composer.skill.json',
        tools: [
          {
            name: 'compose_visual_report',
            description: 'call built-in analysis and report tools',
            parameters: [],
            code: [
              'const analysis = await callTool("analysis_sink", { metric: args.metric });',
              'const report = await callTool("report_sink", { title: `${args.title}:${analysis}` });',
              'return report;',
            ].join('\n'),
          },
          {
            name: 'compose_via_registry_tool',
            description: 'attempt to call another script-backed tool',
            parameters: [],
            code: 'return await callTool("compose_visual_report", { title: args.title, metric: args.metric });',
          },
        ],
      },
    ],
  });

  const composeReportTool = merged.find((tool) => tool.name === 'compose_visual_report');
  assert.ok(composeReportTool, 'compose_visual_report should be merged into runtime tools');

  const reportResult = await composeReportTool.execute({ title: 'Q1 Dashboard', metric: 'GMV' });
  assert.equal(
    reportResult,
    'report:Q1 Dashboard:analysis:GMV',
    'script-backed skills should be able to call built-in tools and chain visual report generation steps',
  );

  const registryCallTool = merged.find((tool) => tool.name === 'compose_via_registry_tool');
  assert.ok(registryCallTool, 'compose_via_registry_tool should be merged into runtime tools');

  const blockedResult = await registryCallTool.execute({ title: 'Q1 Dashboard', metric: 'GMV' });
  assert.match(
    blockedResult,
    /不允许调用非内置工具|built-in/i,
    'script-backed skills should be prevented from recursively calling other script-backed tools',
  );

  console.log('skills script calltool ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});