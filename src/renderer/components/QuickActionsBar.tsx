/**
 * QuickActionsBar — Tech-10 Phase 2
 * Shows quick-action suggestion buttons between ChatArea and ChatInput.
 * Reads from suggestionsStore (AI-parsed) and generates static follow-up prompts.
 */
import React, { useMemo } from 'react';
import { useSuggestionsStore } from '../stores/suggestionsStore';
import { useChatStore } from '../stores/chatStore';
import { Sparkles, X } from 'lucide-react';
import { useI18n } from '../i18n';

const QuickActionsBar: React.FC = () => {
  const { t } = useI18n();
  const { suggestions, visible, clearSuggestions } = useSuggestionsStore();
  const { isStreaming, conversations, activeConversationId, sendMessage } = useChatStore();

  // Derive follow-up prompts from latest assistant message
  const followUps = useMemo(() => {
    if (isStreaming) return [];
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv || conv.messages.length === 0) return [];
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.role !== 'assistant' || typeof lastMsg.content !== 'string') return [];
    const text = lastMsg.content;

    const items: { label: string; prompt: string }[] = [];

    // Detect report generation
    const hasReport = text.includes('已生成') || text.includes('预览面板');
    const hasSuggestion = text.includes('优化建议') || text.includes('进一步探索');
    // Detect if report already has interactive/filter linkage
    const hasInteractive = text.includes('联动') || text.includes('筛选控件') || text.includes('交互式') || text.includes('filter');

    if (hasReport && !hasInteractive) {
      items.push({ label: t.quickActions.addFilterLinkage, prompt: '请为当前报告添加交互式联动筛选控件，支持点击图表联动过滤其他图表' });
    }
    if (hasReport) {
      items.push({ label: t.quickActions.exportPdf, prompt: '请将当前报告导出为PDF文件' });
    }
    if (hasSuggestion) {
      items.push({ label: t.quickActions.applyOptimization, prompt: '请根据上方优化建议，选择最优卡片组合方案，立即重新生成优化版本报表' });
    }
    if (hasReport && !hasSuggestion) {
      items.push({ label: t.quickActions.changeTheme, prompt: '请为当前报告切换一个更现代的主题风格' });
    }

    return items.slice(0, 4);
  }, [isStreaming, conversations, activeConversationId]);

  // Combine AI-parsed suggestions with derived follow-ups
  const chips = useMemo(() => {
    const result: { id: string; label: string; action: () => void }[] = [];

    // AI-parsed suggestions first
    if (visible && suggestions.length > 0) {
      suggestions.forEach((s) => {
        result.push({
          id: s.id,
          label: s.label,
          action: () => {
            const prompt = s.payload?.prompt
              ? String(s.payload.prompt)
              : `请执行: ${s.label}`;
            sendMessage(prompt, []);
            clearSuggestions();
          },
        });
      });
    }

    // Static follow-ups (only if no AI suggestions)
    if (result.length === 0) {
      followUps.forEach((f, i) => {
        result.push({
          id: `follow-${i}`,
          label: f.label,
          action: () => {
            sendMessage(f.prompt, []);
            clearSuggestions();
          },
        });
      });
    }

    return result.slice(0, 5);
  }, [suggestions, visible, followUps, sendMessage, clearSuggestions]);

  if (chips.length === 0 || isStreaming) return null;

  return (
    <div className="px-4 pb-1 pt-2 flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Sparkles size={13} className="text-blue-400 flex-shrink-0" />
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={chip.action}
          className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/60 text-blue-600 dark:text-blue-300 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-500 transition-colors shadow-sm"
        >
          {chip.label}
        </button>
      ))}
      <button
        onClick={clearSuggestions}
        title={t.quickActions.closeActions}
        className="ml-auto p-1 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default QuickActionsBar;
