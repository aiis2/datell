import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { SandboxReport, ReportTemplate } from '../types';
import { dbAPI } from '../services/dbAPI';

interface ReportState {
  reports: SandboxReport[];
  activeReportId: string | null;
  isPreviewOpen: boolean;
  templates: ReportTemplate[];
  selectedTemplateId: string | null;
  isLoadingReports: boolean;

  loadReports: () => Promise<void>;
  addReport: (report: SandboxReport) => void;
  setActiveReport: (id: string | null) => void;
  togglePreview: (open?: boolean) => void;
  removeReport: (id: string) => void;

  // Templates
  loadTemplates: () => Promise<void>;
  saveAsTemplate: (reportId: string, name: string, description?: string) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
  setSelectedTemplate: (id: string | null) => void;
  refreshTemplates: () => Promise<void>;
}

/** Convert a DB row → SandboxReport */
function rowToReport(row: any): SandboxReport {
  return {
    id: row.id,
    title: row.title,
    html: row.html,
    createdAt: row.created_at,
    conversationId: row.conversation_id ?? undefined,
  };
}

/** Convert a DB row → ReportTemplate */
function rowToTemplate(row: any): ReportTemplate {
  return {
    id: row.id,
    title: row.title,
    html: row.html,
    createdAt: row.created_at,
    templateName: row.template_name || row.title,
    templateDescription: row.template_description ?? undefined,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  activeReportId: null,
  isPreviewOpen: false,
  templates: [],
  selectedTemplateId: null,
  isLoadingReports: false,

  loadReports: async () => {
    set({ isLoadingReports: true });
    try {
      const rows = await dbAPI.getReports();
      set({ reports: rows.map(rowToReport), isLoadingReports: false });
    } catch (e) {
      console.error('Failed to load reports', e);
      set({ isLoadingReports: false });
    }
  },

  addReport: (report) => {
    // Persist to DB asynchronously
    dbAPI.upsertReport({
      id: report.id,
      title: report.title,
      html: report.html,
      created_at: report.createdAt,
      conversation_id: report.conversationId ?? null,
      is_template: 0,
      template_name: null,
      template_description: null,
    }).catch((e) => console.error('Failed to save report', e));

    set((s) => ({
      reports: [report, ...s.reports],
      activeReportId: report.id,
      isPreviewOpen: true,
    }));
  },

  setActiveReport: (id) => set({ activeReportId: id }),

  togglePreview: (open) =>
    set((s) => ({ isPreviewOpen: open !== undefined ? open : !s.isPreviewOpen })),

  removeReport: (id) => {
    dbAPI.deleteReport(id).catch((e) => console.error('Failed to delete report', e));
    set((s) => ({
      reports: s.reports.filter((r) => r.id !== id),
      activeReportId: s.activeReportId === id ? (s.reports.find((r) => r.id !== id)?.id ?? null) : s.activeReportId,
    }));
  },

  // Templates
  loadTemplates: async () => {
    try {
      const rows = await dbAPI.getTemplates();
      set({ templates: rows.map(rowToTemplate) });
    } catch (e) {
      console.error('Failed to load templates', e);
    }
  },

  saveAsTemplate: async (reportId, name, description) => {
    const report = get().reports.find((r) => r.id === reportId);
    if (!report) return;
    const templateId = uuidv4();
    const template: ReportTemplate = {
      id: templateId,
      title: report.title,
      html: report.html,
      createdAt: Date.now(),
      templateName: name,
      templateDescription: description,
    };
    await dbAPI.saveTemplate({
      id: templateId,
      title: report.title,
      html: report.html,
      created_at: template.createdAt,
      conversation_id: null,
      is_template: 1,
      template_name: name,
      template_description: description ?? null,
    });
    set((s) => ({ templates: [template, ...s.templates] }));
  },

  removeTemplate: async (id) => {
    await dbAPI.deleteTemplate(id);
    set((s) => ({
      templates: s.templates.filter((t) => t.id !== id),
      selectedTemplateId: s.selectedTemplateId === id ? null : s.selectedTemplateId,
    }));
  },

  setSelectedTemplate: (id) => set({ selectedTemplateId: id }),

  refreshTemplates: async () => {
    try {
      const rows = await dbAPI.getTemplates();
      set({ templates: rows.map(rowToTemplate) });
    } catch (e) {
      console.error('Failed to refresh templates', e);
    }
  },
}));
