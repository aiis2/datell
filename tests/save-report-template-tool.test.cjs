require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    jsx: 'react-jsx',
  },
});

const assert = require('node:assert/strict');

const savedTemplates = [];
const savedReports = [];

global.window = {
  electronAPI: {
    dbSaveTemplate: async (report) => {
      savedTemplates.push(report);
    },
    dbGetTemplates: async () => savedTemplates,
    dbUpsertReport: async (report) => {
      savedReports.push(report);
    },
    dbGetReports: async () => savedReports,
    dbDeleteTemplate: async () => undefined,
    dbDeleteReport: async () => undefined,
  },
};

const { useReportStore } = require('../src/renderer/stores/reportStore.ts');
const {
  saveReportTemplateTool,
} = require('../src/renderer/tools/saveReportTemplate.ts');

useReportStore.setState({
  reports: [],
  activeReportId: null,
  isPreviewOpen: false,
  templates: [],
  selectedTemplateId: null,
  isLoadingReports: false,
});

(async () => {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><main class="report-content"><section>Generated</section></main></body></html>`;
  const result = await saveReportTemplateTool.execute({
    template_name: 'Screenshot Inspired Template',
    template_description: 'Created by Agent from screenshot',
    html,
    mode: 'full',
    source_width: 1280,
    source_height: 720,
    select_after_save: true,
    preview_after_save: true,
  });

  assert.match(result, /模板 "Screenshot Inspired Template" 已保存/);
  assert.equal(savedTemplates.length, 1, 'tool should persist one template row through dbSaveTemplate');
  assert.equal(savedTemplates[0].is_template, 1, 'saved report row should be marked as template');
  assert.equal(savedTemplates[0].template_source, 'agent', 'saved template should identify the Agent source');
  assert.match(savedTemplates[0].template_meta, /"sourceWidth":1280/, 'saved template should store source dimensions in metadata');

  const state = useReportStore.getState();
  assert.equal(state.templates.length, 1, 'template list should refresh after saving');
  assert.equal(state.templates[0].templateSource, 'agent', 'template store should expose agent source metadata');
  assert.equal(state.selectedTemplateId, savedTemplates[0].id, 'new template should be selected when requested');
  assert.equal(state.reports.length, 1, 'preview_after_save should add a report preview');
  assert.equal(state.activeReportId, state.reports[0].id, 'preview report should become active');
  assert.equal(state.isPreviewOpen, true, 'preview panel should open for generated template inspection');

  console.log('save report template tool ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
