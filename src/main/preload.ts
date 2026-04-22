import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // EXP-01 FIX: Accept themeId/layoutId so PDF/screenshot exports use the user's selected theme
  // THEME-HDR FIX: palette passed so header background follows the active color palette
  savePdf: (args: { html: string; title: string; themeId?: string; layoutId?: string; palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean } }): Promise<boolean> =>
    ipcRenderer.invoke('save-pdf', args),

  captureReport: (args: { html: string; title: string; themeId?: string; layoutId?: string; palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean } }): Promise<boolean> =>
    ipcRenderer.invoke('capture-report', args),

  exportHtmlBundle: (args: {
    html: string;
    title: string;
    mode: 'interactive' | 'static';
    themeId?: string;
    layoutId?: string;
    palette?: { primary: string; colors: string[]; bodyBg: string; cardBg: string; textColor: string; subTextColor?: string; isDark: boolean };
  }): Promise<boolean> =>
    ipcRenderer.invoke('export-html-bundle', args),

  saveFile: (data: Uint8Array, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file', data, defaultName),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  setNativeTheme: (theme: 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke('set-native-theme', theme),

  testModelConnection: (config: {
    provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible' | 'anthropic-compatible';
    modelId: string;
    apiKey: string;
    baseUrl: string;
  }): Promise<{ ok: boolean; status?: number; latencyMs?: number; message: string }> =>
    ipcRenderer.invoke('test-model-connection', config),

  // Streaming fetch proxy (bypasses CORS)
  fetchStream: (
    requestId: string,
    url: string,
    options: { method: string; headers: Record<string, string>; body: string }
  ): Promise<void> =>
    ipcRenderer.invoke('fetch-stream', requestId, url, options),

  fetchStreamAbort: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('fetch-stream-abort', requestId),

  // Enterprise plugin status — renderer uses this to conditionally show locked models
  getEnterprisePluginStatus: (): Promise<{ available: boolean; meta: { name: string; version: string; description?: string } | null }> =>
    ipcRenderer.invoke('enterprise:pluginStatus'),

  onFetchStreamData: (callback: (requestId: string, data: any) => void) => {
    const handler = (_event: any, requestId: string, data: any) => callback(requestId, data);
    ipcRenderer.on('fetch-stream-data', handler);
    return () => ipcRenderer.removeListener('fetch-stream-data', handler);
  },

  // ===== DB: Conversations =====
  dbGetConversations: (): Promise<any[]> => ipcRenderer.invoke('db:getConversations'),
  dbGetMessages: (convId: string): Promise<any[]> => ipcRenderer.invoke('db:getMessages', convId),
  dbUpsertConversation: (conv: any): Promise<void> => ipcRenderer.invoke('db:upsertConversation', conv),
  dbUpsertMessage: (msg: any): Promise<void> => ipcRenderer.invoke('db:upsertMessage', msg),
  dbDeleteConversation: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteConversation', id),
  dbDeleteMessage: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteMessage', id),
  dbUpdateConversationTitle: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('db:updateConversationTitle', id, title),

  // ===== DB: Reports =====
  dbGetReports: (): Promise<any[]> => ipcRenderer.invoke('db:getReports'),
  dbUpsertReport: (report: any): Promise<void> => ipcRenderer.invoke('db:upsertReport', report),
  dbDeleteReport: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteReport', id),
  dbGetReportById: (id: string): Promise<any> => ipcRenderer.invoke('db:getReportById', id),

  // ===== DB: Templates =====
  dbGetTemplates: (): Promise<any[]> => ipcRenderer.invoke('db:getTemplates'),
  dbSaveTemplate: (report: any): Promise<void> => ipcRenderer.invoke('db:saveTemplate', report),
  dbDeleteTemplate: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteTemplate', id),

  // ===== DB: Config =====
  dbGetConfig: (key: string): Promise<string | null> => ipcRenderer.invoke('db:getConfig', key),
  dbSetConfig: (key: string, value: string): Promise<void> => ipcRenderer.invoke('db:setConfig', key, value),
  dbGetAllConfig: (): Promise<Record<string, string>> => ipcRenderer.invoke('db:getAllConfig'),

  // ===== FS =====
  fsGetDataDir: (): Promise<string> => ipcRenderer.invoke('fs:getDataDir'),
  fsSetDataDir: (dir: string): Promise<void> => ipcRenderer.invoke('fs:setDataDir', dir),
  fsOpenDataDir: (): Promise<void> => ipcRenderer.invoke('fs:openDataDir'),
  fsExportExcel: (html: string, title: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('fs:exportExcel', html, title),

  // ===== System Identity =====
  getWindowsIdentity: (): Promise<unknown> =>
    ipcRenderer.invoke('system:getWindowsIdentity'),

  // ===== Activation =====
  activationGetMachineCode: (): Promise<string> =>
    ipcRenderer.invoke('activation:getMachineCode'),
  activationGetStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('activation:getStatus'),
  activationSubmit: (authCode: string): Promise<{ ok: boolean; message: string; status?: unknown }> =>
    ipcRenderer.invoke('activation:submit', authCode),
  activationClear: (): Promise<void> =>
    ipcRenderer.invoke('activation:clear'),

  // ===== Vendor file reader (for inlining CDN libs) =====
  readVendorFile: (filename: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:readVendorFile', filename),

  // ===== Theme CSS reader (for inlining theme styles in exported HTML) =====
  readStyleFile: (filename: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:readStyleFile', filename),

  // ===== System RAG (内置系统知识库检索) =====
  systemRagSearch: (
    query: string,
    options?: { topK?: number; type?: 'card' | 'layout' | 'all'; category?: string }
  ): Promise<unknown[]> =>
    ipcRenderer.invoke('system-rag:search', query, options),
  systemRagPreload: (): Promise<number> =>
    ipcRenderer.invoke('system-rag:preload'),

  // ===== Memory =====
  memoryRead: (type: 'long_term' | 'short_term'): Promise<string> =>
    ipcRenderer.invoke('memory:read', type),
  memoryWrite: (type: 'long_term' | 'short_term', content: string): Promise<void> =>
    ipcRenderer.invoke('memory:write', type, content),
  memoryAppend: (type: 'long_term' | 'short_term', entry: string): Promise<void> =>
    ipcRenderer.invoke('memory:append', type, entry),
  memoryClear: (type: 'long_term' | 'short_term'): Promise<void> =>
    ipcRenderer.invoke('memory:clear', type),

  // ===== MCP HTTP Transport =====
  mcpHttpDiscover: (url: string, timeoutMs?: number): Promise<{ ok: boolean; tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>; error?: string }> =>
    ipcRenderer.invoke('mcp:http:discover', url, timeoutMs),
  mcpHttpCall: (url: string, toolName: string, toolArgs: Record<string, unknown>, timeoutMs?: number): Promise<{ ok: boolean; result?: string; error?: string }> =>
    ipcRenderer.invoke('mcp:http:call', url, toolName, toolArgs, timeoutMs),

  // ===== External Skills =====
  skillsList: (): Promise<Array<{
    id: string; name: string; description: string; version: string; source: string;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown>; code: string }>;
  }>> => ipcRenderer.invoke('skills:list'),
  skillsOpenDir: (): Promise<void> => ipcRenderer.invoke('skills:openDir'),
  skillsInstallFromUrl: (url: string): Promise<{ ok: boolean; name?: string; toolCount?: number; error?: string }> =>
    ipcRenderer.invoke('skills:installFromUrl', url),

  // ===== Data Directory Migration =====
  fsSelectDirectory: (): Promise<string | null> => ipcRenderer.invoke('fs:selectDirectory'),
  fsMigrateDataDir: (newDir: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('fs:migrateDataDir', newDir),

  // ===== Datasource =====
  datasourceGetAll: (): Promise<import('../main/datasource').DatasourceConfig[]> =>
    ipcRenderer.invoke('datasource:getAll'),
  datasourceSave: (config: import('../main/datasource').DatasourceConfig): Promise<import('../main/datasource').DatasourceConfig> =>
    ipcRenderer.invoke('datasource:save', config),
  datasourceDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke('datasource:delete', id),
  datasourceTest: (id: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('datasource:test', id),
  datasourceQuery: (id: string, sql: string, params?: unknown[]): Promise<import('../main/datasource').QueryResult> =>
    ipcRenderer.invoke('datasource:query', id, sql, params),
  datasourceGetSchema: (id: string, opts?: { limit?: number; search?: string }): Promise<import('../main/datasource').SchemaInfo> =>
    ipcRenderer.invoke('datasource:getSchema', id, opts),
  datasourceGetTableData: (id: string, tableName: string): Promise<import('../main/datasource').TableDataResult> =>
    ipcRenderer.invoke('datasource:getTableData', id, tableName),

  // ===== File Picker =====
  fsSelectFile: (extensions: string[]): Promise<string | null> =>
    ipcRenderer.invoke('fs:selectFile', extensions),
  fsReadTextFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:readTextFile', filePath),

  // ===== RAG =====
  ragCollectionsList: (): Promise<any[]> =>
    ipcRenderer.invoke('rag:collections:list'),
  ragCollectionsCreate: (data: any): Promise<any> =>
    ipcRenderer.invoke('rag:collections:create', data),
  ragCollectionsDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke('rag:collections:delete', id),
  ragDocumentsList: (cid: string): Promise<any[]> =>
    ipcRenderer.invoke('rag:documents:list', cid),
  ragDocumentsAdd: (cid: string, filePath: string, modelCfg?: any, chunkOpts?: any): Promise<any> =>
    ipcRenderer.invoke('rag:documents:add', cid, filePath, modelCfg, chunkOpts),
  ragDocumentsRemove: (id: string): Promise<void> =>
    ipcRenderer.invoke('rag:documents:remove', id),
  ragChunksList: (collectionId: string, documentId: string): Promise<any[]> =>
    ipcRenderer.invoke('rag:chunks:list', collectionId, documentId),
  ragChunksUpdate: (id: string, content: string): Promise<void> =>
    ipcRenderer.invoke('rag:chunks:update', id, content),
  ragChunksPreview: (filePath: string, chunkOpts?: any): Promise<string[]> =>
    ipcRenderer.invoke('rag:chunks:preview', filePath, chunkOpts),
  ragSearchFts: (cid: string, query: string, topK?: number): Promise<any[]> =>
    ipcRenderer.invoke('rag:search:fts', cid, query, topK),
  ragSearchSemantic: (cid: string, query: string, cfg: any, topK?: number): Promise<any[]> =>
    ipcRenderer.invoke('rag:search:semantic', cid, query, cfg, topK),
  ragSearchDify: (params: any): Promise<any[]> =>
    ipcRenderer.invoke('rag:search:dify', params),
  ragSearchRagflow: (params: any): Promise<any[]> =>
    ipcRenderer.invoke('rag:search:ragflow', params),

  // ===== Knowledge Graph =====
  kgraphNodesList: (filter?: any): Promise<any[]> =>
    ipcRenderer.invoke('kgraph:nodes:list', filter),
  kgraphNodesCreate: (data: any): Promise<any> =>
    ipcRenderer.invoke('kgraph:nodes:create', data),
  kgraphNodesUpdate: (id: string, patch: any): Promise<void> =>
    ipcRenderer.invoke('kgraph:nodes:update', id, patch),
  kgraphNodesDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke('kgraph:nodes:delete', id),
  kgraphEdgesList: (nodeId?: string): Promise<any[]> =>
    ipcRenderer.invoke('kgraph:edges:list', nodeId),
  kgraphEdgesCreate: (data: any): Promise<any> =>
    ipcRenderer.invoke('kgraph:edges:create', data),
  kgraphEdgesDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke('kgraph:edges:delete', id),

  // ===== DevTools secret unlock (session-only, resets on close) =====
  devtoolsUnlock: (): Promise<void> =>
    ipcRenderer.invoke('devtools:unlock'),

  // ===== App language notification (main process dialogs) =====
  /** Notify main process of the current UI language so native dialogs are localised. */
  appSetLanguage: (lang: string): void =>
    ipcRenderer.send('app:set-language', lang),
});
