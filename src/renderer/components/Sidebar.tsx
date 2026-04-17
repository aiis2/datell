import React, { useState, useRef } from 'react';
import { Bot, Plus, MessageSquare, Trash2, Settings, Sun, Moon, PanelRight, BookOpen, RefreshCw, ChevronDown, ChevronRight, Library, FolderOpen, Search, Edit2, Check, X, User, ShieldCheck, ShieldAlert, RefreshCcw, Loader2, PanelLeftClose, PanelLeftOpen, Languages } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useConfigStore } from '../stores/configStore';
import { useReportStore } from '../stores/reportStore';
import { useSystemStore } from '../stores/systemStore';
import { useI18n } from '../i18n';
import type { ActivationStatus } from '../types';

interface SidebarProps {
  activationStatus?: ActivationStatus | null;
}

const Sidebar: React.FC<SidebarProps> = ({ activationStatus }) => {
  const { t } = useI18n();
  const { conversations, activeConversationId, createConversation, setActiveConversation, deleteConversation, renameConversation, isStreaming, streamingConversationIds } = useChatStore();
  const { theme, toggleTheme, setSettingsOpen, sidebarCollapsed, setSidebarCollapsed, language, setLanguage } = useConfigStore();
  const {
    isPreviewOpen, togglePreview, reports, setActiveReport, removeReport,
    templates, selectedTemplateId, setSelectedTemplate, removeTemplate, refreshTemplates,
  } = useReportStore();
  const { identity } = useSystemStore();

  const [showUserCard, setShowUserCard] = useState(false);
  const [userCardPos, setUserCardPos] = useState({ top: 0, left: 0 });
  const userCardHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userCardTriggerRef = useRef<HTMLDivElement>(null);

  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);

  // Search states
  const [chatSearch, setChatSearch] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [reportSearch, setReportSearch] = useState('');

  // Rename states
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filteredConversations = conversations.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase()));
  const filteredTemplates = templates.filter(t => t.templateName.toLowerCase().includes(templateSearch.toLowerCase()));
  const filteredReports = reports.filter(r => r.title.toLowerCase().includes(reportSearch.toLowerCase()));

  const handleRenameChat = (id: string) => {
    if (editingTitle.trim()) {
      renameConversation(id, editingTitle.trim());
    }
    setEditingChatId(null);
    setEditingTitle('');
  };

  // Collapsed icon-only sidebar
  if (sidebarCollapsed) {
    return (
      <div className="w-12 flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full items-center py-2 gap-1">
        {/* Expand button */}
        <button
          onClick={() => setSidebarCollapsed(false)}
          title={t.sidebar.expandSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <PanelLeftOpen size={18} />
        </button>
        {/* New Chat */}
        <button
          onClick={() => createConversation()}
          title={t.sidebar.newChat}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <Plus size={18} />
        </button>
        <div className="flex-1" />
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? t.sidebar.switchToDark : t.sidebar.switchToLight}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {/* Language toggle */}
        <button
          onClick={() => setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')}
          title={language === 'zh-CN' ? t.sidebar.switchLangToEn : t.sidebar.switchLangToZh}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <Languages size={16} />
        </button>
        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title={t.sidebar.settings}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/70 dark:text-blue-300">
            <Bot size={20} />
          </div>
          <span className="font-semibold text-sm flex-1">{t.app.title}</span>
          {/* Collapse button */}
          <button
            onClick={() => setSidebarCollapsed(true)}
            title={t.sidebar.collapseSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
        {/* User identity + activation — compact row with hover card */}
        {(identity || activationStatus) && (
          <div
            ref={userCardTriggerRef}
            className="mt-2 relative"
            onMouseEnter={() => {
              if (userCardHideTimer.current) clearTimeout(userCardHideTimer.current);
              if (userCardTriggerRef.current) {
                const rect = userCardTriggerRef.current.getBoundingClientRect();
                setUserCardPos({ top: rect.top, left: rect.right + 4 });
              }
              setShowUserCard(true);
            }}
            onMouseLeave={() => {
              userCardHideTimer.current = setTimeout(() => setShowUserCard(false), 200);
            }}
          >
            {/* Compact row */}
            <div className="flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-default transition-colors">
              {identity && (
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate flex-1">
                  <User size={11} className="flex-shrink-0" />
                  <span className="truncate font-mono">{identity.displayName}</span>
                  {identity.isFallback && <span className="flex-shrink-0 text-amber-500">⚠</span>}
                </div>
              )}
              {activationStatus && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {activationStatus.activated ? (
                    <ShieldCheck size={11} className="text-green-500" />
                  ) : (
                    <ShieldAlert size={11} className="text-red-500" />
                  )}
                </div>
              )}
            </div>

            {/* Floating hover card — fixed position to escape any overflow clipping */}
            {showUserCard && (
              <div
                className="fixed z-[9999] w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 space-y-2"
                style={{ top: userCardPos.top, left: userCardPos.left }}
                onMouseEnter={() => {
                  if (userCardHideTimer.current) clearTimeout(userCardHideTimer.current);
                }}
                onMouseLeave={() => {
                  userCardHideTimer.current = setTimeout(() => setShowUserCard(false), 200);
                }}
              >
                {identity && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      <User size={11} />
                      {t.sidebar.systemUser}
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">{t.sidebar.loginAccount}</span>
                      <span className="font-mono text-gray-700 dark:text-gray-200 truncate max-w-[140px]">{identity.displayName}</span>
                    </div>
                    {identity.domain && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{t.sidebar.domainComputer}</span>
                        <span className="font-mono text-gray-700 dark:text-gray-200">{identity.domain}</span>
                      </div>
                    )}
                    {identity.sid && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{t.sidebar.sid}</span>
                        <span className="font-mono text-gray-500 dark:text-gray-500 text-[10px] truncate max-w-[140px]">{identity.sid}</span>
                      </div>
                    )}
                    {identity.isFallback && (
                      <div className="text-[10px] text-amber-500 mt-1">⚠ {t.sidebar.fallbackWarning}</div>
                    )}
                  </div>
                )}
                {activationStatus && (
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      {activationStatus.activated ? (
                        <ShieldCheck size={12} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <ShieldAlert size={12} className="text-red-500 flex-shrink-0" />
                      )}
                      <span className={activationStatus.activated ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 font-medium'}>
                        {activationStatus.activated ? t.sidebar.authorized : t.sidebar.notActivated}
                      </span>
                      {activationStatus.activated && (activationStatus as any).isPro && (
                        <span className="ml-1 text-[10px] bg-gradient-to-r from-amber-400 to-orange-400 text-white px-1.5 py-0.5 rounded-full font-semibold">Pro</span>
                      )}
                    </div>
                    {activationStatus.activated && activationStatus.expiry && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{t.sidebar.expiry}</span>
                        <span className="text-gray-700 dark:text-gray-200">
                          {new Date(activationStatus.expiry).toLocaleDateString()}
                          {activationStatus.daysRemaining !== null && (
                            <span className="ml-1 text-gray-400">({activationStatus.daysRemaining} {t.sidebar.days})</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Refresh identity button */}
                <RefreshIdentityButton />
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={() => createConversation()}
          title={t.sidebar.newChat}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Plus size={16} />
          <span>{t.sidebar.newChat}</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {/* Chat Search */}
        {conversations.length > 0 && (
          <div className="mb-2 relative">
            <Search className="absolute left-2 top-1.5 text-gray-400" size={14} />
            <input
              type="text"
              placeholder={t.sidebar.searchChats}
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-gray-100 dark:bg-gray-700/50 border-none rounded-md outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-300"
            />
          </div>
        )}

        {/* Conversation List */}
        {filteredConversations.map((conv) => {
          const isConvStreaming = streamingConversationIds.includes(conv.id);
          return (
          <div
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
              conv.id === activeConversationId
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {isConvStreaming ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-blue-500" />
            ) : (
              <MessageSquare size={14} className="shrink-0" />
            )}
            {editingChatId === conv.id ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={editingTitle}
                  title="重命名"
                  placeholder="输入新标题..."
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameChat(conv.id);
                    if (e.key === 'Escape') setEditingChatId(null);
                  }}
                  autoFocus
                  className="flex-1 min-w-0 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs rounded border border-blue-400 outline-none"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleRenameChat(conv.id); }}
                  title={t.sidebar.confirmRename}
                  className="text-green-600 hover:text-green-700 p-0.5"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingChatId(null); }}
                  title={t.sidebar.cancelRename}
                  className="text-red-600 hover:text-red-700 p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <span className="truncate flex-1">{conv.title}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingChatId(conv.id);
                      setEditingTitle(conv.title);
                    }}
                    title={t.sidebar.renameChat}
                    className="p-1 hover:text-blue-500 transition-all text-gray-400"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title={t.sidebar.deleteChat}
                    className="p-1 hover:text-red-500 transition-all text-gray-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
          );
        })}
        {conversations.length > 0 && filteredConversations.length === 0 && (
           <p className="text-xs text-gray-400 text-center py-2">未找到匹配的对话</p>
        )}
        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">暂无对话记录</p>
        )}

        {/* Templates Section */}
        {templates.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setTemplatesExpanded((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors group"
            >
              {templatesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Library size={12} />
              <span>{t.sidebar.templates}</span>
              <span className="ml-auto bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full text-[10px] px-1.5">{templates.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); refreshTemplates(); }}
                title={t.sidebar.refreshTemplates}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-blue-500 transition-all"
              >
                <RefreshCw size={10} />
              </button>
            </button>
            {templatesExpanded && (
              <div className="mt-1 space-y-0.5">
                <div className="px-2 mb-2 relative">
                  <Search className="absolute left-3 top-1.5 text-gray-400" size={12} />
                  <input
                    type="text"
                    placeholder={t.sidebar.searchTemplates}
                    title={t.sidebar.searchTemplates}
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="w-full pl-6 pr-2 py-1 text-[11px] bg-gray-100 dark:bg-gray-700/50 border-none rounded outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-300"
                  />
                </div>
                {filteredTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(selectedTemplateId === tmpl.id ? null : tmpl.id)}
                    className={`group flex items-center gap-2 pl-6 pr-2 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                      selectedTemplateId === tmpl.id
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                    title={tmpl.templateDescription || tmpl.templateName}
                  >
                    <BookOpen size={11} className="shrink-0" />
                    <span className="truncate flex-1">{tmpl.templateName}</span>
                    {selectedTemplateId === tmpl.id && (
                      <span className="shrink-0 text-amber-600 dark:text-amber-400 font-bold">✓</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTemplate(tmpl.id); }}
                      title={t.sidebar.deleteTemplate}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
                {filteredTemplates.length === 0 && templateSearch && (
                  <p className="pl-6 text-[10px] text-gray-400 py-1">未找到匹配的模板</p>
                )}
                {selectedTemplateId && (
                  <p className="pl-6 text-[10px] text-amber-600 dark:text-amber-400 px-1 py-0.5">
                    ✓ 已选模板，下次生成将参考此结构
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reports History Section */}
        {reports.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setReportsExpanded((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {reportsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <PanelRight size={12} />
              <span>{t.sidebar.reports}</span>
              <span className="ml-auto bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full text-[10px] px-1.5">{reports.length}</span>
            </button>
            {reportsExpanded && (
              <div className="mt-1 space-y-0.5">
                <div className="px-2 mb-2 relative">
                  <Search className="absolute left-3 top-1.5 text-gray-400" size={12} />
                  <input
                    type="text"
                    placeholder={t.sidebar.searchReports}
                    title={t.sidebar.searchReports}
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full pl-6 pr-2 py-1 text-[11px] bg-gray-100 dark:bg-gray-700/50 border-none rounded outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-300"
                  />
                </div>
                {filteredReports.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => { setActiveReport(r.id); togglePreview(true); }}
                    className={`group flex items-center gap-2 pl-6 pr-2 py-2 rounded-lg cursor-pointer text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400`}
                    title={r.title}
                  >
                    <PanelRight size={11} className="shrink-0" />
                    <span className="truncate flex-1">{r.title}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {new Date(r.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeReport(r.id); }}
                      title={t.sidebar.deleteReport}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all text-gray-400 shrink-0"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
                {filteredReports.length === 0 && reportSearch && (
                  <p className="pl-6 text-[10px] text-gray-400 py-1">未找到匹配的报表</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? t.sidebar.switchToDark : t.sidebar.switchToLight}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')}
            title={language === 'zh-CN' ? t.sidebar.switchLangToEn : t.sidebar.switchLangToZh}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <Languages size={16} />
          </button>
          {reports.length > 0 && (
            <button
              onClick={() => togglePreview()}
              title={isPreviewOpen ? t.sidebar.previewReport : t.sidebar.openReport}
              className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                isPreviewOpen ? 'text-blue-500' : 'text-gray-500'
              }`}
            >
              <PanelRight size={16} />
            </button>
          )}
          {window.electronAPI?.fsOpenDataDir && (
            <button
              onClick={() => window.electronAPI?.fsOpenDataDir?.()}
              title={t.common.moreInfo}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            >
              <FolderOpen size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          title={t.sidebar.settings}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
};

/** Small refresh button for use inside the hover card */
const RefreshIdentityButton: React.FC = () => {
  const { refresh, loading } = useSystemStore();
  const { t } = useI18n();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); refresh(); }}
      disabled={loading}
      title={t.common.refresh}
      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
    >
      <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} />
      {t.common.refresh}
    </button>
  );
};

export default Sidebar;
