import React, { useEffect, useState, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import QuickActionsBar from './components/QuickActionsBar';
import ChatInput from './components/ChatInput';

// Lazy-load heavy panels to reduce initial JS parse time
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const ReportPreview = lazy(() => import('./components/ReportPreview'));
const ActivationDialog = lazy(() => import('./components/ActivationDialog'));

import { useConfigStore } from './stores/configStore';
import { useChatStore } from './stores/chatStore';
import { useReportStore } from './stores/reportStore';
import { useSystemStore } from './stores/systemStore';
import type { ActivationStatus } from './types';
import { I18nProvider, useI18n, getLocale } from './i18n';

/** Syncs document.title with the current locale so the window title bar reflects the language. */
const TitleSync: React.FC = () => {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t.app.title;
  }, [t.app.title]);
  return null;
};

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.min.css';

/** Minimal shell skeleton shown while lazy components hydrate */
const AppSkeleton: React.FC = () => (
  <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-900 animate-pulse">
    <div className="w-64 bg-gray-100 dark:bg-gray-800 shrink-0" />
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 bg-gray-50 dark:bg-gray-900" />
      <div className="h-20 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" />
    </div>
  </div>
);

const App: React.FC = () => {
  const { theme, language, setExternalSkills, loadCustomPalettes, setEnterprisePluginAvailable } = useConfigStore();
  const initChats = useChatStore((s) => s.init);
  const { loadReports, loadTemplates } = useReportStore();
  const initSystem = useSystemStore((s) => s.init);

  // null = still loading; ActivationStatus = any state (activated or not)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus | null>(null);
  const [showActivationDialog, setShowActivationDialog] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.electronAPI?.setNativeTheme?.(theme);
  }, [theme]);

  // Initialize DB-backed stores on mount; remove loading splash once ready
  useEffect(() => {
    const maxWait = new Promise<void>((resolve) => setTimeout(resolve, 2500));
    const inits = Promise.race([
      Promise.all([initChats(), loadReports(), loadTemplates(), initSystem()]),
      maxWait,
    ]);
    inits.finally(() => {
      const splash = document.getElementById('app-loading');
      if (splash) {
        splash.classList.add('fade-out');
        splash.addEventListener('transitionend', () => splash.remove(), { once: true });
        setTimeout(() => { try { splash.remove(); } catch { /* already removed */ } }, 600);
      }
    });
  }, []);

  // Load external skills from datellData/skills directory
  useEffect(() => {
    // Load custom palettes on startup
    loadCustomPalettes().catch(() => { /* non-critical */ });

    const loadSkills = async () => {
      try {
        const skills = await window.electronAPI?.skillsList?.();
        if (skills && skills.length > 0) {
          setExternalSkills(skills);
        }
      } catch { /* non-critical, ignore */ }
    };
    loadSkills();

    // Check enterprise plugin availability (non-blocking)
    window.electronAPI?.getEnterprisePluginStatus?.().then((status) => {
      setEnterprisePluginAvailable(status.available);
    }).catch(() => { /* non-critical — open-source mode, plugin absent */ });
  }, []);

  // Load activation status (non-blocking — app works without activation for non-locked models)
  useEffect(() => {
    const locale = getLocale(language);
    const api = window.electronAPI;
    if (!api?.activationGetStatus) {
      setActivationStatus({ activated: true, machineCode: 'DEV', expiry: null, daysRemaining: null, reason: locale.app.devMode });
      return;
    }
    api.activationGetStatus().then((status) => {
      setActivationStatus(status);
    }).catch(() => {
      setActivationStatus({ activated: false, machineCode: locale.app.unknownMachineCode, expiry: null, daysRemaining: null, reason: locale.app.activationFetchFailed });
    });
  }, [language]);

  // Notify main process of current language so native dialogs are localised
  useEffect(() => {
    window.electronAPI?.appSetLanguage?.(language);
  }, [language]);

  return (
    <I18nProvider lang={language}>
    <TitleSync />
    <Suspense fallback={<AppSkeleton />}>
    <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      {/* Sidebar */}
      <Sidebar activationStatus={activationStatus} />

      {/* Main Area — min-w-[320px] prevents ChatArea from collapsing when preview panel is wide */}
      <div className="flex-1 flex flex-col min-w-[320px] relative overflow-hidden">
        {/* Chat Content */}
        <ChatArea />

        {/* Quick suggestion buttons — shown after AI response */}
        <QuickActionsBar />

        {/* Input — passes activation context for locked-model check */}
        <ChatInput
          activationStatus={activationStatus}
          onNeedActivation={() => setShowActivationDialog(true)}
        />
      </div>

      {/* Report Preview Panel */}
      <Suspense fallback={null}>
        <ReportPreview />
      </Suspense>

      {/* Settings Modal */}
      <Suspense fallback={null}>
        <SettingsModal activationStatus={activationStatus} onReactivated={(s) => setActivationStatus(s)} />
      </Suspense>

      {/* Activation Dialog — shown on demand when user tries to use locked model */}
      {showActivationDialog && (
        <Suspense fallback={null}>
          <ActivationDialog
            onActivated={(s) => { setActivationStatus(s); setShowActivationDialog(false); }}
            onClose={() => setShowActivationDialog(false)}
          />
        </Suspense>
      )}
    </div>
    </Suspense>
    </I18nProvider>
  );
};

export default App;
