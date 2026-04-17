/**
 * Thin wrapper around window.electronAPI DB calls for use in renderer stores.
 * All methods are async and go through IPC to the main process.
 */

// Check if running in Electron (not browser-only dev server)
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && !!window.electronAPI;

export const dbAPI = {
  // Conversations
  getConversations: () => isElectron() ? window.electronAPI!.dbGetConversations() : Promise.resolve([]),
  getMessages: (convId: string) => isElectron() ? window.electronAPI!.dbGetMessages(convId) : Promise.resolve([]),
  upsertConversation: (conv: any) => isElectron() ? window.electronAPI!.dbUpsertConversation(conv) : Promise.resolve(),
  upsertMessage: (msg: any) => isElectron() ? window.electronAPI!.dbUpsertMessage(msg) : Promise.resolve(),
  deleteConversation: (id: string) => isElectron() ? window.electronAPI!.dbDeleteConversation(id) : Promise.resolve(),
  deleteMessage: (id: string) => isElectron() ? window.electronAPI!.dbDeleteMessage(id) : Promise.resolve(),
  updateConversationTitle: (id: string, title: string) =>
    isElectron() ? window.electronAPI!.dbUpdateConversationTitle(id, title) : Promise.resolve(),

  // Reports
  getReports: () => isElectron() ? window.electronAPI!.dbGetReports() : Promise.resolve([]),
  upsertReport: (report: any) => isElectron() ? window.electronAPI!.dbUpsertReport(report) : Promise.resolve(),
  deleteReport: (id: string) => isElectron() ? window.electronAPI!.dbDeleteReport(id) : Promise.resolve(),
  getReportById: (id: string) => isElectron() ? window.electronAPI!.dbGetReportById(id) : Promise.resolve(null),

  // Templates
  getTemplates: () => isElectron() ? window.electronAPI!.dbGetTemplates() : Promise.resolve([]),
  saveTemplate: (report: any) => isElectron() ? window.electronAPI!.dbSaveTemplate(report) : Promise.resolve(),
  deleteTemplate: (id: string) => isElectron() ? window.electronAPI!.dbDeleteTemplate(id) : Promise.resolve(),

  // Config
  getConfig: (key: string) => isElectron() ? window.electronAPI!.dbGetConfig(key) : Promise.resolve<string | null>(null),
  setConfig: (key: string, value: string) => isElectron() ? window.electronAPI!.dbSetConfig(key, value) : Promise.resolve(),
  getAllConfig: () => isElectron() ? window.electronAPI!.dbGetAllConfig() : Promise.resolve<Record<string, string>>({}),
};
