import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { User, Bot, ChevronDown, ChevronRight, Wrench, RotateCcw, RefreshCw, Copy, Check, X, Sparkles, CheckCircle2, XCircle, Loader2, BarChart2, TrendingUp, FileSpreadsheet, FileText, Code2, MessageCircle, AlertCircle, Presentation, ScrollText, Network, Globe, Database, Table2, Lightbulb, ListChecks, ListTodo, ShieldCheck, Zap } from 'lucide-react';
import type { ChatMessage, ToolCallInfo } from '../types';
import { useSubagentStore } from '../stores/subagentStore';
import { useChatStore } from '../stores/chatStore';
import { MiniChart } from './MiniChart';
import type { MiniChartSpec } from './MiniChart';
import { useI18n } from '../i18n';
/* ─────────────────────────────────────────────────────────────
   Copilot-style: waiting-for-first-token indicator
───────────────────────────────────────────────────────────── */
/**
 * VS Code GitHub Copilot style loading indicator:
 * a small rotating spinner ring + subtle label, no bouncing dots.
 */
const ThinkingIndicator: React.FC<{ statusMessage?: string }> = ({ statusMessage }) => (
  <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-transparent shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
    <div className="flex items-center gap-2">
      {/* Copilot-style spinning ring — mimics VS Code's progress indicator */}
      <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-blue-200/60 dark:border-blue-800/60 border-t-blue-500 dark:border-t-blue-400 animate-spin flex-shrink-0" />
      <span className="text-[13px] text-gray-400/80 dark:text-gray-500/80 select-none">
        {statusMessage ?? '正在生成回复…'}
      </span>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Copilot-style: thinking process block
   - isLiveThinking=true  → animated header + auto-expanded live scroll
   - isLiveThinking=false → collapsed badge, click to expand
───────────────────────────────────────────────────────────── */
interface ThinkingBlockProps {
  thinking: string;
  /** True while model is still in thinking phase (no response content yet) */
  isLiveThinking: boolean;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ thinking, isLiveThinking }) => {
  const [expanded, setExpanded] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const { t } = useI18n();

  // Auto-scroll to bottom during live thinking
  useEffect(() => {
    if (isLiveThinking && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [thinking, isLiveThinking]);

  const showContent = isLiveThinking || expanded;

  return (
    <div className={`rounded-xl overflow-hidden border transition-colors ${
      isLiveThinking
        ? 'border-blue-200/70 dark:border-blue-700/40'
        : 'border-amber-200/60 dark:border-amber-700/30'
    }`}>
      {/* Header row */}
      <button
        onClick={() => !isLiveThinking && setExpanded((v) => !v)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors select-none ${
          isLiveThinking
            ? 'bg-blue-50/60 dark:bg-blue-900/20 cursor-default'
            : 'bg-amber-50/60 dark:bg-amber-900/20 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 cursor-pointer'
        }`}
      >
        {isLiveThinking ? (
          <>
            <Sparkles size={11} className="text-blue-500 animate-pulse flex-shrink-0" />
            <span className="font-medium text-blue-600 dark:text-blue-400">{t.chatArea.deepThinking}</span>
            <span className="ml-1.5 flex items-end gap-0.5" aria-hidden>
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${d}ms`, animationDuration: '1s' }}
                />
              ))}
            </span>
          </>
        ) : (
          <>
            {expanded
              ? <ChevronDown size={11} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              : <ChevronRight size={11} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            }
            <span className="font-medium text-amber-700 dark:text-amber-300">{t.chatArea.deepThinkingDone}</span>
            <span className="ml-auto text-[10px] text-amber-400/80 dark:text-amber-500/60">
              {expanded ? t.chatArea.collapseThinking : t.chatArea.expandThinking}
            </span>
          </>
        )}
      </button>

      {/* Thinking content */}
      {showContent && (
        <pre
          ref={preRef}
          className={`px-3 py-2.5 text-[11px] whitespace-pre-wrap leading-relaxed font-sans overflow-y-auto ${
            isLiveThinking
              ? 'max-h-32 text-blue-700/90 dark:text-blue-300/90 bg-blue-50/20 dark:bg-blue-900/10'
              : 'max-h-48 text-amber-800 dark:text-amber-200 bg-amber-50/20 dark:bg-amber-900/10'
          }`}
        >
          {thinking}
          {/* Cursor removed: three-dot animation in header is the only loading indicator */}
        </pre>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Rich Markdown Components — custom renderers for professional look
───────────────────────────────────────────────────────────── */

/** Code block with language badge + copy button */
const CodeBlock: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const lang = (className?.replace('language-', '') ?? '').toLowerCase();
  const codeText = typeof children === 'string' ? children : '';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [codeText]);

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[11px] font-mono font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          title={t.messageBubble.copy}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-500 transition-colors px-1.5 py-0.5 rounded"
        >
          {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
          <span>{copied ? t.messageBubble.copied : t.messageBubble.copy}</span>
        </button>
      </div>
      <code className={`block overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed bg-gray-900 dark:bg-gray-950 text-gray-100 ${className ?? ''}`}>
        {children}
      </code>
    </div>
  );
};

/** Inline code — styled badge */
const InlineCode: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded-md text-[12px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40">
    {children}
  </code>
);

/** Table → card-style responsive table */
const StyledTable: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
    <table className="w-full text-xs border-collapse">{children}</table>
  </div>
);

const StyledThead: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <thead className="bg-gray-100 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 uppercase text-[11px] tracking-wide font-semibold">
    {children}
  </thead>
);

const StyledTh: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
    {children}
  </th>
);

const StyledTr: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <tr className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors last:border-0">
    {children}
  </tr>
);

const StyledTd: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">
    {children}
  </td>
);

/** Blockquote → info card */
const StyledBlockquote: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <blockquote className="my-3 pl-4 border-l-4 border-blue-400 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-900/15 rounded-r-xl py-2.5 pr-3 text-blue-800 dark:text-blue-200 italic text-sm">
    {children}
  </blockquote>
);

/** H1 → hero banner */
const StyledH1: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <h1 className="text-xl font-bold mb-3 mt-5 first:mt-0 text-gray-900 dark:text-white pb-2 border-b-2 border-blue-400/50 dark:border-blue-600/50">
    {children}
  </h1>
);

/** H2 → section header with accent bar */
const StyledH2: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <h2 className="text-base font-bold mb-2 mt-4 first:mt-0 flex items-center gap-2 text-gray-800 dark:text-gray-100">
    <span className="w-1 h-4 bg-blue-500 rounded-full flex-shrink-0" />
    {children}
  </h2>
);

/** H3 → sub-section */
const StyledH3: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold mb-1.5 mt-3 first:mt-0 text-gray-700 dark:text-gray-200">
    {children}
  </h3>
);

/** Ordered list → step-numbered list */
const StyledOl: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <ol className="my-2 space-y-1.5 pl-4 list-decimal list-outside text-sm text-gray-700 dark:text-gray-300 marker:text-blue-500 marker:font-bold">
    {children}
  </ol>
);

/** Unordered list → styled bullet list */
const StyledUl: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <ul className="my-2 space-y-1 pl-4 list-disc list-outside text-sm text-gray-700 dark:text-gray-300 marker:text-blue-400">
    {children}
  </ul>
);

/** Paragraph — standard spacing + font */
const StyledP: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <p className="my-1.5 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
    {children}
  </p>
);

/** Horizontal rule */
const StyledHr: React.FC = () => (
  <hr className="my-4 border-gray-200 dark:border-gray-700" />
);

/** Link → external link badge */
const StyledA: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
  >
    {children}
  </a>
);

/** Markdown component map */
const MD_COMPONENTS: Components = {
  code: ({ className, children, ...rest }) => {
    // Block code (inside <pre>) vs inline code
    const isBlock = className?.startsWith('language-') || String(children ?? '').includes('\n');
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return <InlineCode>{children}</InlineCode>;
  },
  pre: ({ children }) => <>{children}</>,  // Let CodeBlock handle the container
  table: ({ children }) => <StyledTable>{children}</StyledTable>,
  thead: ({ children }) => <StyledThead>{children}</StyledThead>,
  th: ({ children }) => <StyledTh>{children}</StyledTh>,
  tr: ({ children }) => <StyledTr>{children}</StyledTr>,
  td: ({ children }) => <StyledTd>{children}</StyledTd>,
  blockquote: ({ children }) => <StyledBlockquote>{children}</StyledBlockquote>,
  h1: ({ children }) => <StyledH1>{children}</StyledH1>,
  h2: ({ children }) => <StyledH2>{children}</StyledH2>,
  h3: ({ children }) => <StyledH3>{children}</StyledH3>,
  ol: ({ children }) => <StyledOl>{children}</StyledOl>,
  ul: ({ children }) => <StyledUl>{children}</StyledUl>,
  p: ({ children }) => <StyledP>{children}</StyledP>,
  hr: () => <StyledHr />,
  a: ({ href, children }) => <StyledA href={href}>{children}</StyledA>,
};

/* ───────────────────────────────────────────────────────────   Main MessageBubble component
───────────────────────────────────────────────────────────── */
interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  /** Current agent status text to show in the thinking indicator */
  statusMessage?: string;
  onRetry?: () => void;   // Regenerate for assistant messages
  onResend?: () => void;  // Resend for user messages
}

const MessageBubble: React.FC<Props> = ({ message, isStreaming = false, statusMessage, onRetry, onResend }) => {
  const isUser = message.role === 'user';
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const [applyOptimizationSent, setApplyOptimizationSent] = useState(false);

  // D-01: Detect if message contains card optimization suggestions
  const hasOptimizationBlock = useMemo(() => {
    if (!message.content || isUser) return false;
    return message.content.includes('## 📈 优化建议') || message.content.includes('## 📈优化建议');
  }, [message.content, isUser]);

  const imageAttachmentSrcMap = useMemo(() => new Map(
    (message.attachments ?? [])
      .filter((attachment) => attachment.type === 'image' && attachment.data)
      .map((attachment) => [
        attachment.id,
        attachment.data!.startsWith('data:') ? attachment.data! : `data:image/*;base64,${attachment.data!}`,
      ])
  ), [message.attachments]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-msg-enter`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        isUser
          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
          : 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        {/* User message */}
        {isUser && (
          <div>
            <div className="inline-block bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap">
              {message.content}
              {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.attachments.map((a) => (
                    a.type === 'image' && a.data ? (
                      <div key={a.id} className="relative group/img">
                        <img
                          src={imageAttachmentSrcMap.get(a.id) ?? ''}
                          alt={a.name}
                          className="max-w-[200px] max-h-[200px] rounded-lg object-contain bg-blue-700/30 cursor-pointer"
                          onClick={() => setPreviewImage({ src: imageAttachmentSrcMap.get(a.id) ?? '', name: a.name })}
                          title={a.name}
                        />
                        <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] text-white bg-black/50 rounded px-1 truncate opacity-0 group-hover/img:opacity-100 transition-opacity">
                          {a.name}
                        </span>
                      </div>
                    ) : (
                      <span key={a.id} className="bg-blue-700 px-2 py-0.5 rounded text-xs">
                        📎 {a.name}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
            {/* User message actions */}
            {onResend && !isStreaming && (
              <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={onResend}
                  title={t.messageBubble.resend}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <RotateCcw size={11} />
                  <span>{t.messageBubble.resend}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Assistant message */}
        {!isUser && (
          <div className="space-y-2">
            {/* Agent Steps — Copilot-style compact panel */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <AgentStepsPanel toolCalls={message.toolCalls} isStreaming={isStreaming} onRetry={onRetry} />
            )}

            {/* Thinking process — Copilot-style */}
            {message.thinking && message.thinking.trim() && (
              <ThinkingBlock
                thinking={message.thinking}
                isLiveThinking={isStreaming && !message.content}
              />
            )}

            {message.content && (
              (() => {
                const bubbles = message.content.split('[NEW_BUBBLE]').map((b) => b.trim()).filter(Boolean);
                return (
                  <div className="space-y-2">
                    {bubbles.map((bubble, idx) => (
                      <div key={idx} className={`prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-800/50 border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 transition-colors duration-300 ${
                        isStreaming && idx === bubbles.length - 1
                          ? 'border-blue-200/60 dark:border-blue-700/20 streaming-prose'
                          : 'border-gray-200 dark:border-transparent'
                      }`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex, rehypeHighlight]}
                          components={MD_COMPONENTS}
                        >
                          {bubble}
                        </ReactMarkdown>
                        {/* Streaming cursor on last bubble */}
                        {isStreaming && idx === bubbles.length - 1 && (
                          <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse align-text-bottom ml-0.5" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}

            {/* Copilot-style loading indicator: only shown when no thinking and no content yet */}
            {!message.content && isStreaming && !message.thinking?.trim() && (
              <ThinkingIndicator statusMessage={statusMessage} />
            )}

            {/* Assistant message actions */}
            {!isStreaming && (message.content || message.toolCalls?.length) && (() => {
              const hasToolError = message.toolCalls?.some((tc) => isToolError(tc.result)) ?? false;
              return (
              <div className={`flex items-center gap-1 transition-opacity ${hasToolError ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button
                  onClick={handleCopy}
                  title={t.messageBubble.copy}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                  <span>{copied ? t.messageBubble.copied : t.messageBubble.copy}</span>
                </button>
                {/* D-01: Quick apply suggestion button — shown when message has optimization block */}
                {hasOptimizationBlock && !applyOptimizationSent && (
                  <button
                    onClick={() => {
                      useChatStore.getState().sendMessage(
                        '请根据上方优化建议，选择最优卡片组合方案，立即调用 generate_chart 或 generate_chart_apex 重新生成优化版本报表。',
                        []
                      );
                      setApplyOptimizationSent(true);
                    }}
                    title="自动应用卡片优化建议，重新生成报表"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 transition-colors"
                  >
                    <Zap size={11} />
                    <span>应用优化</span>
                  </button>
                )}
                {hasOptimizationBlock && applyOptimizationSent && (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-green-500 rounded-lg">
                    <Check size={11} />
                    <span>已发送优化请求</span>
                  </span>
                )}
                {onRetry && (
                  <button
                    onClick={onRetry}
                    title={t.messageBubble.retry}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <RefreshCw size={11} />
                    <span>{t.messageBubble.retry}</span>
                  </button>
                )}
              </div>
              );
            })()}
          </div>
        )}
      </div>

      {previewImage && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            title={t.chatArea.closePreview}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
          <div
            className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl shadow-2xl bg-white"
            />
            <div className="text-xs text-white/90 bg-black/40 px-3 py-1.5 rounded-full max-w-[80vw] truncate">
              {previewImage.name}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Copilot-style: Agent Steps Panel
   Replaces the old per-tool ToolCallBlock with a single compact panel:
   - Running: blue spinner + animated label
   - Done OK: green check + summary. Auto-collapses after 1.5s
   - Done with error: red alert; errors shown inline, no expand needed
───────────────────────────────────────────────────────────── */

// Human-readable tool labels + icons
const TOOL_META: Record<string, { label: string; labelEn: string; icon: React.ReactNode }> = {
  generate_chart:         { label: '生成 ECharts 报表',    labelEn: 'Generate ECharts Chart',     icon: <BarChart2 size={11} /> },
  generate_chart_apex:    { label: '生成 ApexCharts 报表', labelEn: 'Generate ApexCharts Chart',   icon: <BarChart2 size={11} /> },
  data_analysis:          { label: '数据统计分析',          labelEn: 'Data Analysis',              icon: <TrendingUp size={11} /> },
  generate_excel:         { label: '生成 Excel 表格',       labelEn: 'Generate Excel File',        icon: <FileSpreadsheet size={11} /> },
  generate_pdf:           { label: '生成 PDF 文档',         labelEn: 'Generate PDF Document',      icon: <FileText size={11} /> },
  generate_slide:         { label: '生成演示文稿',          labelEn: 'Generate Presentation',      icon: <Presentation size={11} /> },
  generate_document:      { label: '生成专业文档',          labelEn: 'Generate Document',          icon: <ScrollText size={11} /> },
  skill_creator:          { label: '创建扩展工具',          labelEn: 'Create Extension Tool',      icon: <Code2 size={11} /> },
  ask_user:               { label: '询问用户',              labelEn: 'Ask User',                   icon: <MessageCircle size={11} /> },
  run_subagent:           { label: '派发子任务',            labelEn: 'Dispatch Subtask',           icon: <Network size={11} /> },
  web_fetch:              { label: '获取网页内容',          labelEn: 'Fetch Web Content',          icon: <Globe size={11} /> },
  query_database:         { label: '执行 SQL 查询',         labelEn: 'Execute SQL Query',          icon: <Database size={11} /> },
  get_database_schema:    { label: '检索数据表结构',        labelEn: 'Get Database Schema',        icon: <Table2 size={11} /> },
  list_datasources:       { label: '列出数据源',            labelEn: 'List Datasources',           icon: <Database size={11} /> },
  suggest_card_combinations: { label: '卡片组合建议',      labelEn: 'Card Combination Suggestions', icon: <Lightbulb size={11} /> },
  plan_tasks:             { label: '规划任务列表',          labelEn: 'Plan Task List',             icon: <ListTodo size={11} /> },
  complete_task:          { label: '完成子任务',            labelEn: 'Complete Subtask',           icon: <ListChecks size={11} /> },
  run_subagents_parallel: { label: '并行子智能体',          labelEn: 'Parallel Agents',            icon: <ListTodo size={11} /> },
  run_subagents_serial:   { label: '串行子智能体',          labelEn: 'Serial Agents',              icon: <ListTodo size={11} /> },
  run_node_subagent:      { label: '汇聚节点代理',          labelEn: 'Aggregation Node Agent',     icon: <ListTodo size={11} /> },
  validate_report:        { label: '验证报表质量',          labelEn: 'Validate Report Quality',    icon: <ShieldCheck size={11} /> },
  check_data_quality:     { label: '数据质量检查',          labelEn: 'Check Data Quality',         icon: <AlertCircle size={11} /> },
};

function getArgSummary(tc: ToolCallInfo, isEn = false): string {
  const { name, args } = tc;
  if (name === 'generate_chart' || name === 'generate_chart_apex') {
    return args.title ? `"${String(args.title)}"` : '';
  }
  if (name === 'data_analysis') {
    return [args.operation, args.label].filter(Boolean).map(String).join(' · ');
  }
  if (name === 'generate_excel' && args.filename) return String(args.filename);
  if (name === 'generate_pdf' && args.title) return String(args.title);
  if (name === 'generate_slide' && args.title) return `"${String(args.title)}"`;
  if (name === 'generate_document' && args.title) return `"${String(args.title)}"`;
  if (name === 'query_database') {
    const sql = String(args.sql ?? '').replace(/\s+/g, ' ').trim();
    return sql.length > 60 ? sql.slice(0, 60) + '…' : sql;
  }
  if (name === 'get_database_schema' && args.datasource_id) return String(args.datasource_id);
  if (name === 'web_fetch' && args.url) {
    try { return new URL(String(args.url)).hostname; } catch { return String(args.url).slice(0, 40); }
  }
  if (name === 'suggest_card_combinations' && args.report_id) return String(args.report_id).slice(0, 20);
  if (name === 'plan_tasks') {
    const tasks = args.tasks;
    if (Array.isArray(tasks)) return isEn ? `${tasks.length} tasks` : `${tasks.length} 个任务`;
    return '';
  }
  if (name === 'run_subagents_parallel') {
    const tasks = args.tasks;
    if (Array.isArray(tasks)) return isEn ? `${tasks.length} parallel agents` : `并行 ${tasks.length} 个子代理`;
    return isEn ? 'parallel agents' : '并行子代理';
  }
  if (name === 'complete_task' && args.task_id) return `#${String(args.task_id)}`;
  if (name === 'validate_report' && args.report_id) return String(args.report_id).slice(0, 20);
  if (name === 'check_data_quality' && args.context) return String(args.context).slice(0, 40);
  return '';
}

/** Extract expandable detail content for a completed tool call (VSCode Copilot style) */
function getToolDetail(tc: ToolCallInfo, isEn = false): React.ReactNode | null {
  const { name, args, result } = tc;

  if (name === 'query_database') {
    const sql = String(args.sql ?? '').trim();
    let parsed: { columns: string[]; rows: unknown[][]; rowCount: number; returnedRows: number; executionMs: number } | null = null;
    try { if (result && !result.startsWith('错误')) parsed = JSON.parse(result); } catch { /* ignore */ }
    return (
      <div className="space-y-2 pt-2">
        {sql && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">SQL</div>
            <pre className="bg-gray-900 dark:bg-black/60 text-green-300 text-[11px] font-mono px-3 py-2 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
              <code>{sql}</code>
            </pre>
          </div>
        )}
        {parsed && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">
              {isEn
                ? `Result — ${parsed.rowCount} rows · ${parsed.returnedRows} returned · ${parsed.executionMs}ms`
                : `结果 — ${parsed.rowCount} 行 · ${parsed.returnedRows} 已返回 · ${parsed.executionMs}ms`}
            </div>
            {parsed.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="text-[10px] w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100/80 dark:bg-gray-700/60">
                      {parsed.columns.map((col, i) => (
                        <th key={i} className="px-2 py-1 text-left font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(parsed.rows as unknown[][]).slice(0, 5).map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-100 dark:border-gray-700/40 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 text-gray-600 dark:text-gray-400 max-w-[120px] truncate">
                            {String(cell ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {parsed.rows.length > 5 && (
                      <tr>
                        <td colSpan={parsed.columns.length} className="px-2 py-1 text-center text-gray-400 italic">
                          {isEn ? `${parsed.rows.length - 5} more rows…` : `另有 ${parsed.rows.length - 5} 行…`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (name === 'get_database_schema') {
    const preview = result ? result.slice(0, 600) : '';
    if (!preview) return null;
    return (
      <div className="pt-2">
        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{isEn ? 'Schema' : '数据表结构'}</div>
        <pre className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 px-3 py-2 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap">
          {preview}{result && result.length > 600 ? '\n…' : ''}
        </pre>
      </div>
    );
  }

  // check_data_quality: render structured quality report
  if (name === 'check_data_quality' && result && !result.startsWith('错误')) {
    try {
      const report = JSON.parse(result) as {
        passed: boolean; rowCount: number; columnCount: number;
        issues: Array<{ severity: string; code: string; column?: string; message: string; suggestion: string }>;
        summary: string;
      };
      const errorItems = report.issues.filter((i) => i.severity === 'error');
      const warnItems = report.issues.filter((i) => i.severity === 'warning');
      return (
        <div className="pt-2 space-y-2">
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${report.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {report.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {report.summary}
          </div>
          {report.issues.length > 0 && (
            <div className="space-y-1">
              {[...errorItems, ...warnItems].slice(0, 6).map((issue, i) => (
                <div key={i} className={`rounded px-2 py-1.5 text-[10px] space-y-0.5 ${
                  issue.severity === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-l-2 border-red-400'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-400'
                }`}>
                  <div className={`font-semibold ${issue.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    [{issue.severity.toUpperCase()}] {issue.code}{issue.column ? ` — ${issue.column}` : ''}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">{issue.message}</div>
                  <div className="text-gray-400 dark:text-gray-500 italic">{isEn ? 'Tip' : '建议'}: {issue.suggestion}</div>
                </div>
              ))}
              {report.issues.length > 6 && (
                <div className="text-[10px] text-gray-400 italic">{isEn ? `+${report.issues.length - 6} more…` : `另有 ${report.issues.length - 6} 条提示…`}</div>
              )}
            </div>
          )}
        </div>
      );
    } catch { /* fall through to generic */ }
  }

  if (name === 'web_fetch') {
    const url = String(args.url ?? '');
    const textStart = result ? result.indexOf('\n\n') : -1;
    const preview = textStart >= 0 ? result!.slice(textStart + 2, textStart + 402).trim() : (result ?? '').slice(0, 400).trim();
    return (
      <div className="space-y-1.5 pt-2">
        {url && (
          <div className="font-mono text-[10px] text-blue-500 dark:text-blue-400 break-all">{url}</div>
        )}
        {preview && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-4">
            {preview}{result && result.length > 402 ? '…' : ''}
          </div>
        )}
      </div>
    );
  }

  // plan_tasks: render as numbered workflow table
  if (name === 'plan_tasks') {
    const tasksList = Array.isArray(args.tasks) ? (args.tasks as unknown[]).map(String) : [];
    const rawParallelGroups = Array.isArray(args.parallel_groups) ? args.parallel_groups as unknown[][] : [];
    const groupMap = new Map<number, number>();
    rawParallelGroups.forEach((g, gi) => (g || []).forEach((idx) => groupMap.set(Number(idx), gi)));
    if (tasksList.length === 0) return null;
    return (
      <div className="pt-2 space-y-1">
        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">{isEn ? 'Task Workflow' : '任务工作流'}</div>
        {tasksList.map((task, i) => {
          const groupIdx = groupMap.get(i);
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] text-gray-400 font-mono flex-shrink-0 w-5 pt-0.5">{i + 1}.</span>
              {groupIdx !== undefined && (
                <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded px-1 py-0.5 flex-shrink-0">{isEn ? `Parallel G${groupIdx + 1}` : `并行G${groupIdx + 1}`}</span>
              )}
              <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">{task}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // run_subagent / run_subagents_parallel: render structured result
  if (name === 'run_subagent' || name === 'run_subagents_parallel') {
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      if (parsed && (parsed.status === 'success' || parsed.status === 'partial')) {
        const summary = parsed.summary as string | undefined;
        const artifacts = parsed.artifacts as Array<{ type: string; title: string }> | undefined;
        const toolsCalled = parsed.toolsCalled as string[] | undefined;
        const steps = parsed.steps as number | undefined;
        return (
          <div className="pt-2 space-y-1.5">
            {summary && (
              <div className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                {summary.slice(0, 200)}{summary.length > 200 ? '…' : ''}
              </div>
            )}
            {(artifacts && artifacts.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {artifacts.slice(0, 6).map((a, i) => (
                  <span key={i} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded px-1.5 py-0.5">
                    {a.type} · {String(a.title).slice(0, 20)}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              {typeof steps === 'number' && <span>{steps} {isEn ? 'steps' : '步'}</span>}
              {toolsCalled && toolsCalled.length > 0 && <span>{isEn ? 'Tools' : '工具'}: {toolsCalled.slice(0, 3).join(', ')}{toolsCalled.length > 3 ? '...' : ''}</span>}
            </div>
          </div>
        );
      }
    } catch { /* fall through */ }
  }

  // suggest_card_combinations: render full Markdown output (AI internal reference only)
  if (name === 'suggest_card_combinations' && result) {
    return (
      <div className="pt-2 space-y-1.5">
        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
          {isEn ? 'Card Suggestions (AI Reference)' : '卡片建议（AI 内部参考）'}
        </div>
        <div className="max-h-[280px] overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-800/40 px-3 py-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h3: ({ children }) => <h3 className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 mt-2">{children}</h3>,
              p: ({ children }) => <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1">{children}</ul>,
              li: ({ children }) => <li className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{children}</li>,
              code: ({ children }) => <code className="bg-gray-200 dark:bg-gray-700 px-0.5 rounded text-[10px] font-mono text-gray-700 dark:text-gray-300">{children}</code>,
              pre: ({ children }) => <pre className="bg-gray-900/10 dark:bg-black/20 rounded p-2 overflow-x-auto text-[10px] font-mono mt-1 mb-2 leading-relaxed">{children}</pre>,
              strong: ({ children }) => <strong className="font-semibold text-gray-600 dark:text-gray-300">{children}</strong>,
              hr: () => <hr className="border-gray-200 dark:border-gray-700 my-2" />,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-blue-400 pl-2 text-[11px] text-gray-400 italic my-1">{children}</blockquote>,
            }}
          >
            {result}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // Generic: show truncated result text for tools with meaningful longer output
  if (result && !result.startsWith('错误') && !result.startsWith('✅') && result.length > 40) {
    // Skip raw JSON results that look like plan_tasks/subagent JSON (already rendered above)
    const isJsonDump = result.startsWith('{"ok"') || result.startsWith('{"status"');
    if (isJsonDump) return null;
    const preview = result.slice(0, 280);
    return (
      <div className="pt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {preview}{result.length > 280 ? '…' : ''}
      </div>
    );
  }

  return null;
}

function isToolError(result?: string): boolean {
  if (!result) return false;
  return result.startsWith('错误:') || result.startsWith('工具执行错误:') || result.startsWith('未知工具:');
}

/** Render a tool result that may contain a __MINI_CHART__ or __WIDGET_HTML__ sentinel */
function renderToolResultInline(result?: string): React.ReactNode | null {
  if (!result) return null;

  if (result.startsWith('__MINI_CHART__')) {
    try {
      const spec = JSON.parse(result.slice('__MINI_CHART__'.length)) as MiniChartSpec;
      return (
        <div className="mt-2 p-2 bg-white dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 inline-block">
          <MiniChart spec={spec} />
        </div>
      );
    } catch {
      return null;
    }
  }

  if (result.startsWith('__WIDGET_HTML__')) {
    try {
      const payload = JSON.parse(result.slice('__WIDGET_HTML__'.length)) as {
        encoded: string;
        title?: string;
        height?: number;
      };
      const srcDoc = decodeURIComponent(escape(atob(payload.encoded)));
      const h = payload.height ?? 240;
      return (
        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {payload.title && (
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              {payload.title}
            </div>
          )}
          <iframe
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            style={{ width: '100%', height: h, border: 'none', display: 'block' }}
            title={payload.title ?? 'widget'}
          />
        </div>
      );
    } catch {
      return null;
    }
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────
   SubAgentCard: Copilot-style expandable panel for run_subagent
───────────────────────────────────────────────────────────── */
const SubAgentCard: React.FC<{ tc: ToolCallInfo }> = ({ tc }) => {
  const logs = useSubagentStore((s) => s.logs[String(tc.args.task_id ?? tc.id)] ?? []);
  const [expanded, setExpanded] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const isEn = t.app.devMode === 'Dev Mode';
  const isDone = tc.status === 'done' || tc.status === 'error';
  const isErr = isToolError(tc.result);
  const taskLabel = tc.args.task_id ? String(tc.args.task_id) : (isEn ? 'subtask' : '子任务');
  const taskDesc = tc.args.task ? String(tc.args.task).slice(0, 60) : '';

  // Auto-scroll log as new lines arrive
  useEffect(() => {
    if (expanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, expanded]);

  // Auto-collapse on success after 2s
  useEffect(() => {
    if (isDone && !isErr) {
      const t = setTimeout(() => setExpanded(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isDone, isErr]);

  return (
    <div className="rounded-xl border border-purple-200/70 dark:border-purple-700/40 overflow-hidden text-xs">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors select-none ${
          !isDone
            ? 'bg-purple-50/50 dark:bg-purple-900/10'
            : isErr
            ? 'bg-red-50/60 dark:bg-red-900/15 hover:bg-red-50'
            : 'bg-purple-50/30 dark:bg-purple-900/10 hover:bg-purple-50/60 dark:hover:bg-purple-900/20'
        }`}
      >
        {/* Status */}
        {!isDone ? (
          <span className="shrink-0 w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
        ) : isErr ? (
          <XCircle size={13} className="shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 size={13} className="shrink-0 text-purple-500" />
        )}

        <Network size={11} className="shrink-0 text-purple-400" />

        <span className={`font-medium truncate ${
          !isDone ? 'text-purple-600 dark:text-purple-400' :
          isErr ? 'text-red-600 dark:text-red-400' :
          'text-gray-500 dark:text-gray-400'
        }`}>
          {!isDone ? (isEn ? `Sub-agent running…` : `子Agent 执行中…`) : isErr ? (isEn ? `Subtask failed` : `子任务失败`) : (isEn ? `Subtask complete` : `子任务完成`)}
          {' '}
          <span className="font-mono text-[10px] opacity-70">[{taskLabel}]</span>
        </span>

        {taskDesc && (
          <span className="text-gray-400 dark:text-gray-500 truncate flex-1 text-[10px]">{taskDesc}{tc.args.task && String(tc.args.task).length > 60 ? '…' : ''}</span>
        )}

        {expanded
          ? <ChevronDown size={11} className="ml-auto shrink-0 text-gray-400" />
          : <ChevronRight size={11} className="ml-auto shrink-0 text-gray-400" />
        }
      </button>

      {/* Log panel */}
      {expanded && (
        <div className="bg-gray-950/5 dark:bg-black/20 px-3 py-2 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5">
          {logs.length === 0 ? (
            <span className="text-gray-400 italic">{isEn ? 'Waiting for sub-agent…' : '等待子Agent启动…'}</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{line}</div>
            ))
          )}
          {isErr && tc.result && (
            <div className="mt-1 text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1 whitespace-pre-wrap">{tc.result}</div>
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
};

const AgentStepsPanel: React.FC<{ toolCalls: ToolCallInfo[]; isStreaming: boolean; onRetry?: () => void }> = ({
  toolCalls,
  isStreaming,
  onRetry,
}) => {
  const allDone = toolCalls.every((t) => t.status === 'done');
  const hasError = toolCalls.some((t) => isToolError(t.result));
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useI18n();
  const isEn = t.app.devMode === 'Dev Mode'; // lightweight language detection via existing locale key

  // Auto-collapse 1.5s after all succeed, stay open on errors
  useEffect(() => {
    if (allDone && !hasError && !isStreaming) {
      const timer = setTimeout(() => setCollapsed(true), 1500);
      return () => clearTimeout(timer);
    }
    if (hasError) setCollapsed(false);
  }, [allDone, hasError, isStreaming]);

  return (
    <div className="rounded-xl border border-gray-200/70 dark:border-gray-700/40 overflow-hidden text-xs">
      {/* Header */}
      <button
        onClick={() => allDone && setCollapsed((v) => !v)}
        className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors select-none ${
          !allDone
            ? 'bg-blue-50/50 dark:bg-blue-900/10 cursor-default'
            : hasError
            ? 'bg-red-50/60 dark:bg-red-900/15 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer'
            : 'bg-gray-50/60 dark:bg-gray-700/25 hover:bg-gray-100/70 dark:hover:bg-gray-700/40 cursor-pointer'
        }`}
      >
        {/* Status icon */}
        {!allDone ? (
          <span className="shrink-0 w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        ) : hasError ? (
          <AlertCircle size={13} className="shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 size={13} className="shrink-0 text-green-500" />
        )}

        {/* Label */}
        <span
          className={`font-medium ${
            !allDone
              ? 'text-blue-600 dark:text-blue-400'
              : hasError
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {!allDone
            ? isEn
              ? `Running… (${toolCalls.filter((t) => t.status === 'running').length} tools)`
              : `执行中…（${toolCalls.filter((t) => t.status === 'running').length} 个工具）`
            : hasError
            ? isEn ? `Executed ${toolCalls.length} steps (with errors)` : `已执行 ${toolCalls.length} 步（含错误）`
            : isEn ? `Completed ${toolCalls.length} steps` : `已完成 ${toolCalls.length} 步操作`}
        </span>

        {/* Expand/collapse chevron */}
        {allDone && (
          collapsed
            ? <ChevronRight size={11} className="ml-auto shrink-0 text-gray-400" />
            : <ChevronDown  size={11} className="ml-auto shrink-0 text-gray-400" />
        )}
      </button>

      {/* Steps list */}
      {!collapsed && (
        <div className="divide-y divide-gray-100/60 dark:divide-gray-700/25">
          {toolCalls.map((tc) => {
            // run_subagent gets its own expanded panel
            if (tc.name === 'run_subagent') {
              return <SubAgentCard key={tc.id} tc={tc} />;
            }

            const meta = TOOL_META[tc.name];
            const isErr = isToolError(tc.result);
            const argSummary = getArgSummary(tc, isEn);
            const isExpanded = expandedId === tc.id;
            // Only show detail for done + no-error items
            const detail = (tc.status === 'done' && !isErr) ? getToolDetail(tc, isEn) : null;
            const hasDetail = detail !== null;

            return (
              <div key={tc.id} className={isErr ? 'bg-red-50/40 dark:bg-red-900/10' : 'bg-white/20 dark:bg-transparent'}>
                {/* Tool row — clickable when detail available */}
                <div
                  className={`flex items-start gap-2 px-3 py-2.5 ${
                    hasDetail ? 'cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors' : ''
                  }`}
                  onClick={() => hasDetail && setExpandedId(isExpanded ? null : tc.id)}
                >
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {tc.status === 'running' ? (
                      <Loader2 size={12} className="text-blue-400 animate-spin" />
                    ) : isErr ? (
                      <XCircle size={12} className="text-red-500" />
                    ) : (
                      <CheckCircle2 size={12} className="text-green-500" />
                    )}
                  </div>

                  {/* Tool info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`flex items-center gap-1 font-medium ${
                        isErr ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
                      }`}>
                        {meta?.icon ?? <Wrench size={11} />}
                        {meta ? (isEn ? meta.labelEn : meta.label) : tc.name}
                      </span>
                      {argSummary && (
                        <span className="text-gray-400 dark:text-gray-500 truncate max-w-[220px]">{argSummary}</span>
                      )}
                      {tc.status === 'running' && (
                        <span className="text-blue-400 animate-pulse">…</span>
                      )}
                    </div>

                    {/* Error detail shown inline */}
                    {isErr && tc.result && (
                      <div className="mt-1.5 space-y-1.5">
                        <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1.5 leading-relaxed whitespace-pre-wrap">
                          {tc.result}
                        </div>
                        {/* P2: Error recovery action — retry whole message */}
                        {onRetry && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={onRetry}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-600 dark:text-red-400 hover:text-white hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-700/50 rounded-lg transition-colors"
                            >
                              <RefreshCw size={9} />
                              <span>重新生成</span>
                            </button>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">工具执行失败，重新生成可自动修复</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline mini chart / widget rendering */}
                    {!isErr && renderToolResultInline(tc.result)}
                  </div>

                  {/* Expand chevron — only for done items with detail */}
                  {hasDetail && (
                    <div className="mt-0.5 ml-auto shrink-0 text-gray-300 dark:text-gray-600">
                      {isExpanded
                        ? <ChevronDown size={11} />
                        : <ChevronRight size={11} />
                      }
                    </div>
                  )}
                </div>

                {/* Expandable detail panel */}
                {isExpanded && detail && (
                  <div className="px-3 pb-3 border-t border-gray-100/80 dark:border-gray-700/30 bg-gray-50/40 dark:bg-gray-800/20">
                    {detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;

