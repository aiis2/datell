import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useSubagentStore } from '../stores/subagentStore';
import MessageBubble from './MessageBubble';
import { TaskGraphSvg } from './TaskGraphSvg';
import type { LangCode } from '../i18n';
import { useI18n } from '../i18n';
import { Bot, MessageCircleQuestion, SendHorizonal, X, BarChart2, TrendingUp, TrendingDown, LayoutDashboard, TableProperties, Database, CheckCircle2, Loader2, AlertCircle, ListTodo, ChevronDown, ChevronRight, GitBranch } from 'lucide-react';

const ChatArea: React.FC = () => {
  const { t } = useI18n();
  const { conversations, activeConversationId, isStreaming, streamingConversationIds, pendingQuestion, agentTurnInfo, agentStatusMessage, answerQuestion, stopStreaming, regenerateResponse, resendMessage } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [questionAnswer, setQuestionAnswer] = useState('');

  const conversation = conversations.find((c) => c.id === activeConversationId);
  // Check if THIS specific conversation is streaming (not just the global flag)
  const activeConvStreaming = activeConversationId
    ? streamingConversationIds.includes(activeConversationId)
    : false;
  // Only show the pending question if it belongs to the active conversation
  const activePendingQuestion =
    pendingQuestion?.convId === activeConversationId ? pendingQuestion : null;
  const activeTurnInfo =
    agentTurnInfo?.convId === activeConversationId ? agentTurnInfo : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages, activeConvStreaming, activePendingQuestion]);

  // Clear the input whenever a new question arrives
  useEffect(() => {
    if (activePendingQuestion) setQuestionAnswer('');
  }, [activePendingQuestion?.callId]);

  const handleAnswerSubmit = () => {
    const answer = questionAnswer.trim();
    if (!answer) return;
    answerQuestion(answer);
    setQuestionAnswer('');
  };

  if (!conversation) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {conversation.messages.map((msg, index) => {
        const isLatestMessage = index === conversation.messages.length - 1;
        const isAssistantStreaming = activeConvStreaming && msg.role === 'assistant' && isLatestMessage;

        let onRetry: (() => void) | undefined;
        if (msg.role === 'assistant' && !activeConvStreaming) {
          if (isLatestMessage) {
            onRetry = regenerateResponse;
          } else {
            // Find the preceding user message so we can re-run from that point
            const precedingUserMsg = conversation.messages.slice(0, index).reverse().find((m) => m.role === 'user');
            if (precedingUserMsg) {
              onRetry = () => resendMessage(precedingUserMsg.id);
            }
          }
        }

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isAssistantStreaming}
            statusMessage={isAssistantStreaming ? (agentStatusMessage ?? undefined) : undefined}
            onRetry={onRetry}
            onResend={msg.role === 'user' && !activeConvStreaming ? () => resendMessage(msg.id) : undefined}
          />
        );
      })}

      {/* AG2UI: Inline question card — shown when model calls ask_user */}
      {activePendingQuestion && (
        <div className="flex items-start gap-3 pl-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mt-0.5">
            <MessageCircleQuestion size={16} className="text-blue-500 dark:text-blue-400" />
          </div>
          <div className="flex-1 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 rounded-2xl rounded-tl-sm px-4 py-3 space-y-3 shadow-sm max-w-2xl">
            <div className="text-xs font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wider">
              {t.chatArea.needsConfirmation}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
              {activePendingQuestion.question}
            </p>
            {/* Preset option buttons */}
            {activePendingQuestion.options && activePendingQuestion.options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activePendingQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { answerQuestion(opt); setQuestionAnswer(''); }}
                    className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={questionAnswer}
                onChange={(e) => setQuestionAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnswerSubmit(); } }}
                placeholder={t.chatArea.answerPlaceholder}
                className="flex-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400"
                autoFocus
              />
              <button
                onClick={handleAnswerSubmit}
                disabled={!questionAnswer.trim()}
                title={t.chatArea.submitAnswer}
                className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
              >
                <SendHorizonal size={16} />
              </button>
              <button
                onClick={() => stopStreaming()}
                title={t.chatArea.skipQuestion}
                className="px-3 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeConvStreaming && !activePendingQuestion && (
        <div className="flex items-start gap-3 pl-2 animate-in fade-in duration-200">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mt-0.5">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce bounce-delay-1" />
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce bounce-delay-2" />
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce bounce-delay-3" />
            </div>
          </div>
          {activeTurnInfo ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl rounded-tl-sm px-4 py-2.5 min-w-[220px] max-w-[320px] shadow-sm">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  {activeTurnInfo.max > 0
                    ? t.chatArea.stepProgressMax.replace('{current}', String(activeTurnInfo.current)).replace('{max}', String(activeTurnInfo.max))
                    : t.chatArea.stepProgress.replace('{current}', String(activeTurnInfo.current))}
                </span>
                <span className="text-blue-400 dark:text-blue-500">
                  ~{activeTurnInfo.estimatedTokens >= 1000
                    ? `${(activeTurnInfo.estimatedTokens / 1000).toFixed(1)}K`
                    : activeTurnInfo.estimatedTokens} tokens
                </span>
              </div>
              {activeTurnInfo.max > 0 && (
                <div className="w-full bg-blue-100 dark:bg-blue-800 rounded-full h-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (activeTurnInfo.current / activeTurnInfo.max) * 100)}%` }}
                  />
                </div>
              )}
              {agentStatusMessage && (
                <div className="mt-1.5 text-[11px] text-blue-500/80 dark:text-blue-400/70 truncate">{agentStatusMessage}</div>
              )}
            </div>
          ) : (
            <div className="self-center text-gray-400 dark:text-gray-500 text-sm">
              {agentStatusMessage ? agentStatusMessage : t.chatArea.agentThinking}
            </div>
          )}
        </div>
      )}
      {/* Inline sub-task progress panel — visible during streaming and lingers 2s after all done */}
      <InlineAgentTodoPanel />

      <div ref={bottomRef} />
    </div>
  );
};

export default ChatArea;

/* ─────────────────────────────────────────────────────────────
   InlineAgentTodoPanel — sub-task progress shown in message stream
   Moves the AgentTodoPanel from above-input to inline in conversation flow
───────────────────────────────────────────────────────────── */
const InlineAgentTodoPanel: React.FC = () => {
  const { todos } = useSubagentStore();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [visible, setVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'progress' | 'graph'>('progress');

  useEffect(() => {
    if (todos.length === 0) return;
    const allDone = todos.every((t) => t.status === 'done' || t.status === 'error');
    if (!allDone) return;
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [todos]);

  useEffect(() => {
    if (todos.length > 0) { setVisible(true); setExpanded(true); }
  }, [todos.length]);

  if (!visible || todos.length === 0) return null;

  const doneCount = todos.filter((t) => t.status === 'done').length;
  const errorCount = todos.filter((t) => t.status === 'error').length;
  const hasParallel = todos.some((t) => t.parallelGroup);

  // ── Status icon helper ──
  const statusIcon = (status: string) => {
    if (status === 'done')    return <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />;
    if (status === 'error')   return <AlertCircle  size={12} className="text-red-400 flex-shrink-0" />;
    if (status === 'running') return <Loader2 size={12} className="text-blue-400 animate-spin flex-shrink-0" />;
    return <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />;
  };

  // ── Group todos for progress view ──
  const renderGroups: Array<typeof todos> = [];
  const visited = new Set<string>();
  for (const todo of todos) {
    if (visited.has(todo.id)) continue;
    if (todo.parallelGroup) {
      const groupItems = todos.filter((t) => t.parallelGroup === todo.parallelGroup);
      groupItems.forEach((t) => visited.add(t.id));
      renderGroups.push(groupItems);
    } else {
      visited.add(todo.id);
      renderGroups.push([todo]);
    }
  }

  return (
    <div className="flex items-start gap-3 pl-2 animate-in fade-in duration-200">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mt-0.5">
        <ListTodo size={14} className="text-purple-500" />
      </div>
      <div className="flex-1 max-w-xl rounded-xl border border-purple-200/70 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors select-none"
        >
          <span className="font-medium text-purple-700 dark:text-purple-300 flex-1">
            {hasParallel ? t.chatArea.workflowPlanning : t.chatArea.subtaskProgress}
          </span>
          <span className="text-gray-400 text-[11px] mr-1">{doneCount + errorCount}/{todos.length} {t.chatArea.doneSuffix}</span>
          {expanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        </button>

        {expanded && (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-purple-100 dark:border-purple-800/30 px-3">
              <button
                onClick={() => setActiveTab('progress')}
                className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 border-b-2 transition-colors -mb-px ${
                  activeTab === 'progress'
                    ? 'border-purple-400 text-purple-600 dark:text-purple-300'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <ListTodo size={11} />
                {t.chatArea.progressTab}
              </button>
              <button
                onClick={() => setActiveTab('graph')}
                className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 border-b-2 transition-colors -mb-px ${
                  activeTab === 'graph'
                    ? 'border-purple-400 text-purple-600 dark:text-purple-300'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <GitBranch size={11} />
                {t.chatArea.flowchartTab}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'progress' && (
              <div className="px-3 pb-3 pt-2 space-y-1">
                {renderGroups.map((group, gi) => (
                  <React.Fragment key={gi}>
                    {group.length > 1 ? (
                      // Parallel group box
                      <div className="border border-blue-200 dark:border-blue-800/40 rounded-lg px-2 py-1.5 bg-blue-50/40 dark:bg-blue-900/10">
                        <div className="text-[9px] text-blue-400 font-semibold uppercase tracking-wide mb-1">{t.chatArea.parallelGroup}</div>
                        <div className="space-y-1">
                          {group.map((todo) => (
                            <div key={todo.id} className="flex items-center gap-2">
                              {statusIcon(todo.status)}
                              <span className={`text-[11px] flex-1 truncate ${
                                todo.status === 'done'    ? 'text-gray-400 line-through' :
                                todo.status === 'error'   ? 'text-red-500' :
                                todo.status === 'running' ? 'text-blue-600 dark:text-blue-400 font-medium' :
                                'text-gray-500'
                              }`}>{todo.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      // Serial step (no arrows, just status icon + label)
                      <div className="flex items-center gap-2 py-0.5 px-1">
                        {statusIcon(group[0].status)}
                        {typeof group[0].stepIndex === 'number' && (
                          <span className="text-[9px] text-gray-300 dark:text-gray-600 font-mono flex-shrink-0 w-4">
                            {group[0].stepIndex}.
                          </span>
                        )}
                        <span className={`text-[12px] truncate ${
                          group[0].status === 'done'    ? 'text-gray-400 line-through' :
                          group[0].status === 'error'   ? 'text-red-500' :
                          group[0].status === 'running' ? 'text-blue-600 dark:text-blue-400 font-medium' :
                          'text-gray-500'
                        }`}>{group[0].label}</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {activeTab === 'graph' && (
              <div className="p-3 overflow-auto">
                <TaskGraphSvg todos={todos} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Empty State — shown when no conversation is active
   6 scenario starter cards for common analysis tasks
───────────────────────────────────────────────────────────── */

function getScenarioCards(lang: LangCode) {
  const isEn = lang === 'en-US';
  return [
    {
      icon: BarChart2,
      title: isEn ? 'Sales Report' : '销售报表',
      desc: isEn ? 'Analyze sales data, generate monthly/quarterly trends' : '分析销售数据，生成月度/季度销售趋势',
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      prompt: isEn
        ? 'Please analyze my sales data and generate a sales report with KPI metrics, monthly trend lines, and category comparison charts'
        : '请帮我分析销售数据，生成包含KPI指标、月度趋势折线图和品类对比柱状图的销售报表',
    },
    {
      icon: TrendingUp,
      title: isEn ? 'Trend Analysis' : '趋势分析',
      desc: isEn ? 'Multi-dimensional time series trend comparison' : '多维度时间序列趋势对比',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      prompt: isEn
        ? 'Please analyze my data for trends, focusing on growth over time with year-over-year and month-over-month comparisons'
        : '请对我的数据进行趋势分析，重点展示随时间变化的增长趋势，包含同比/环比对比',
    },
    {
      icon: TrendingDown,
      title: isEn ? 'Comparison Analysis' : '对比分析',
      desc: isEn ? 'Year-over-year, period-over-period, multi-group comparison' : '同比、环比及多组数据对比',
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      prompt: isEn
        ? 'Please create a comparison analysis of my data, including YoY and PoP change charts, highlighting key differences'
        : '请帮我做数据对比分析，生成同比、环比变化图表，突出显示关键差异',
    },
    {
      icon: LayoutDashboard,
      title: isEn ? 'Data Dashboard' : '数据看板',
      desc: isEn ? 'Multi-chart linkage, KPI + charts combined dashboard' : '多图联动，KPI+图表综合看板',
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      prompt: isEn
        ? 'Please create a comprehensive data dashboard with core KPI cards, multi-dimensional charts, and interactive filter linkage'
        : '请帮我生成一个综合数据看板，包含核心KPI卡片、多维图表，支持筛选联动',
    },
    {
      icon: TableProperties,
      title: isEn ? 'Pivot Analysis' : '多维透视',
      desc: isEn ? 'Group aggregation and cross-dimensional analysis' : '分组汇总与交叉分析',
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      prompt: isEn
        ? 'Please perform a multi-dimensional pivot analysis, grouping by different dimensions and generating cross-analysis reports'
        : '请对我的数据进行多维度透视分析，按不同维度分组汇总，生成交叉分析报表',
    },
    {
      icon: Database,
      title: isEn ? 'Database Query' : '数据库查询',
      desc: isEn ? 'Connect to database, SQL query and analysis' : '连接数据库，SQL查询分析',
      color: 'text-teal-500',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      prompt: isEn
        ? 'Please query the database, analyze key metrics using SQL, and generate visual reports'
        : '请帮我查询数据库中的数据，使用SQL分析关键指标，生成可视化报表',
    },
  ];
}

const EmptyState: React.FC = () => {
  const { t, lang } = useI18n();
  const handleCard = useCallback((prompt: string) => {
    // Emit a custom event that ChatInput listens to, to pre-fill the input
    window.dispatchEvent(new CustomEvent('set-chat-draft', { detail: { text: prompt } }));
  }, []);

  const scenarioCards = getScenarioCards(lang);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 mb-4">
        <Bot size={40} className="text-blue-500" />
      </div>
      <h2 className="text-xl font-semibold mb-1">{t.chatArea.emptyTitle}</h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
        {t.chatArea.emptySubtitle}
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {scenarioCards.map((card) => (
          <button
            key={card.title}
            onClick={() => handleCard(card.prompt)}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm bg-white dark:bg-gray-800 text-left transition-all group"
          >
            <div className={`p-2 rounded-lg ${card.bg} flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform`}>
              <card.icon size={15} className={card.color} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{card.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{card.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
