require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
    esModuleInterop: true,
    resolveJsonModule: true,
  },
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const exampleSkillPath = path.join(
  __dirname,
  '..',
  'skill',
  'examples',
  'visual-report-smoke.skill.json',
);

assert.equal(
  fs.existsSync(exampleSkillPath),
  true,
  'example skill manifest should exist under skill/examples for real smoke testing',
);

const exampleManifest = JSON.parse(fs.readFileSync(exampleSkillPath, 'utf8'));

const { mergeRuntimeToolSources } = require('../src/renderer/tools/runtimeMerge.ts');
const { generateChartTool } = require('../src/renderer/tools/generateChart.ts');
const { useReportStore } = require('../src/renderer/stores/reportStore.ts');

useReportStore.setState({
  reports: [],
  activeReportId: null,
  isPreviewOpen: false,
});

(async () => {
  const merged = mergeRuntimeToolSources({
    builtIns: [generateChartTool],
    registrySkills: [exampleManifest],
  });

  const exampleTool = merged.find((tool) => tool.name === 'visual_report_smoke');
  assert.ok(exampleTool, 'example report skill tool should be registered into runtime');

  const result = await exampleTool.execute({
    title: 'North Region Revenue',
    categories: ['Jan', 'Feb', 'Mar'],
    values: [120, 168, 210],
  });

  assert.match(result, /已生成并在预览面板中展示/);

  const reportState = useReportStore.getState();
  assert.equal(reportState.reports.length, 1, 'example report skill should create a preview report');
  assert.equal(reportState.isPreviewOpen, true, 'example report skill should open preview panel');
  assert.equal(reportState.reports[0].title, 'North Region Revenue');
  assert.match(reportState.reports[0].html, /echarts/i, 'stored report html should contain an echarts-based visualization');
  assert.match(reportState.reports[0].html, /North Region Revenue/);

  console.log('skills report example smoke ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});