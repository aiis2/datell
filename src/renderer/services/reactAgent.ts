import type { ChatMessage, ModelConfig, StreamEvent } from '../types';
import { streamChat, toolsToJsonSchema } from './llmService';
import { buildSystemPrompt } from '../prompts/systemPrompt';
import { getAllTools } from '../tools';
import { suggestCardCombinationsTool } from '../tools/suggestCardCombinations';
import { useConfigStore } from '../stores/configStore';
import { useReportStore } from '../stores/reportStore';
import { useDatasourceStore } from '../stores/datasourceStore';
import { buildMemoryContext } from './memoryService';
import { retrieveSystemComponents, formatSystemComponentsPrompt } from './systemRagService';
import { BUILT_IN_PRESETS } from '../types/reportPresets';
import { activePlanTaskIds } from '../tools/planTasks';

const MAX_TOOL_STEPS = 20; // legacy fallback — actual limit read from configStore at runtime

/** Get a localized status message for a given tool name. */
function getToolStatusMessage(toolName: string, isEnglish = false): string {
  type StatusEntry = { zh: string; en: string };
  const statusMap: Record<string, StatusEntry> = {
    generate_chart:            { zh: '正在生成图表…',               en: 'Generating chart…' },
    generate_chart_apex:       { zh: '正在生成图表…',               en: 'Generating chart…' },
    generate_table_vtable:     { zh: '正在生成表格…',               en: 'Generating table…' },
    data_analysis:             { zh: '正在分析数据…',               en: 'Analyzing data…' },
    query_database:            { zh: '正在查询数据库…',             en: 'Querying database…' },
    get_database_schema:       { zh: '正在读取表结构…',             en: 'Reading schema…' },
    generate_excel:            { zh: '正在生成 Excel…',             en: 'Generating Excel…' },
    generate_pdf:              { zh: '正在生成 PDF…',               en: 'Generating PDF…' },
    generate_slide:            { zh: '正在生成幻灯片…',             en: 'Generating slides…' },
    generate_document:         { zh: '正在生成文档…',               en: 'Generating document…' },
    plan_tasks:                { zh: '正在规划任务…',               en: 'Planning tasks…' },
    complete_task:             { zh: '正在执行任务…',               en: 'Completing task…' },
    ask_user:                  { zh: '等待用户输入…',               en: 'Waiting for input…' },
    show_mini_chart:           { zh: '正在生成迷你图表…',           en: 'Generating mini chart…' },
    show_widget:               { zh: '正在生成数据卡片…',           en: 'Generating data card…' },
    search_assets:             { zh: '正在搜索图表素材…',           en: 'Searching assets…' },
    suggest_card_combinations: { zh: '正在分析卡片组合，生成优化建议…', en: 'Analyzing card layout…' },
    check_data_quality:        { zh: '正在检查数据质量…',           en: 'Checking data quality…' },
    run_subagent:              { zh: '正在启动子智能体…',           en: 'Starting sub-agent…' },
    run_subagents_parallel:    { zh: '正在并行启动多个子智能体…',   en: 'Running agents in parallel…' },
    run_subagents_serial:      { zh: '正在串行执行子智能体流水线…', en: 'Running agent pipeline…' },
    run_node_subagent:         { zh: '正在汇聚子智能体结果…',       en: 'Aggregating agent results…' },
    web_fetch:                 { zh: '正在获取网页内容…',           en: 'Fetching web content…' },
    skill_creator:             { zh: '正在创建技能…',               en: 'Creating skill…' },
  };
  const entry = statusMap[toolName];
  if (entry) return isEnglish ? entry.en : entry.zh;
  return isEnglish ? `Running ${toolName}…` : `正在调用 ${toolName}…`;
}

/**
 * Run the ReAct agent loop: stream LLM output, execute tool calls,
 * feed results back, and repeat until the model produces a final text response.
 *
 * @param onAskUser  AG2UI callback: called when the model invokes ask_user.
 *                   Must return the user's textual answer.
 */
export async function* runReactAgent(
  messages: ChatMessage[],
  config: ModelConfig,
  signal?: AbortSignal,
  onAskUser?: (callId: string, question: string, context?: string, options?: string[]) => Promise<string>
): AsyncGenerator<StreamEvent> {
  console.log('[reactAgent] START provider=', config.provider, 'modelId=', config.modelId,
    'typeof streamChat=', typeof streamChat, 'typeof buildSystemPrompt=', typeof buildSystemPrompt);
  const tools = getAllTools();
  const toolDefs = toolsToJsonSchema(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  );
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Build file metadata list for the system prompt.
  // Full content is already appended to each user message via textSuffix below,
  // so we only inject a brief inventory here to avoid duplicating potentially large tables.
  const fileContext = messages
    .filter((m) => m.attachments?.length)
    .flatMap((m) => m.attachments || [])
    .map((a) => {
      if (a.type === 'image') return `[图片: ${a.name} (${(a.size / 1024).toFixed(0)} KB)]`;
      const rowMatch = a.textContent?.match(/总行数:\s*(\d+)/);
      const rowInfo = rowMatch ? `, 约 ${rowMatch[1]} 行` : '';
      return `[文件: ${a.name} (${a.type}, ${(a.size / 1024).toFixed(0)} KB${rowInfo})]`;
    })
    .join('\n');

  // Collect enabled user system prompt hints (hallucination correction rules)
  const configState = useConfigStore.getState();
  const enabledUserPrompts = (configState.userSystemPrompts || [])
    .filter((p) => p.enabled)
    .map((p) => p.content);

  // Get selected template HTML if any
  const reportState = useReportStore.getState();
  const selectedTemplate = reportState.selectedTemplateId
    ? reportState.templates.find((t) => t.id === reportState.selectedTemplateId)
    : undefined;

  // Load memory context (long-term + short-term) to inject into system prompt
  console.log('[reactAgent] calling buildMemoryContext...');
  const memoryContext = await buildMemoryContext();
  console.log('[reactAgent] buildMemoryContext OK, len=', memoryContext.length);

  // Build datasource context if user has selected one
  const dsState = useDatasourceStore.getState();
  const activeDsId = dsState.activeDatasourceId;
  const activeDatasource = activeDsId ? dsState.datasources.find((d) => d.id === activeDsId) : undefined;
  const datasourceContext = activeDatasource
    ? `\n## 当前激活数据源（用户已在输入框选择）
用户已选择以下数据库作为本次分析的数据来源，请优先从该数据库查询数据生成报表：
- **数据源名称**: ${activeDatasource.name}
- **数据库类型**: ${activeDatasource.type}
- **连接信息**: ${activeDatasource.host}:${activeDatasource.port}/${activeDatasource.database}
- **数据源ID（工具调用必须使用此ID）**: \`${activeDatasource.id}\`

**强制执行流程**：
1. **第一步：获取表结构** — 调用 \`get_database_schema\` 工具（datasourceId: "${activeDatasource.id}"）了解可用的表和字段
2. **第二步：查询数据** — 根据用户需求调用 \`query_database\` 工具（datasourceId: "${activeDatasource.id}"）进行 SQL 查询
3. **第三步：综合分析** — 结合数据库查询结果、用户上传的截图/文件描述，生成完整分析报表
4. SQL 安全要求：只允许 SELECT 查询，禁止 INSERT/UPDATE/DELETE/DROP 等写操作`
    : '';

  console.log('[reactAgent] calling buildSystemPrompt...');
  // DIAGNOSTIC: log the actual function identity and argument types
  console.log('[reactAgent] buildSystemPrompt.toString[:80]:', buildSystemPrompt.toString().substring(0, 80));
  console.log('[reactAgent] args types: preferredChartEngine=', typeof configState.preferredChartEngine, configState.preferredChartEngine,
    ' memoryContext-type=', typeof memoryContext, ' memoryContext-len=', memoryContext?.length ?? 0,
    ' userPrompts-isArr=', Array.isArray(enabledUserPrompts), ' userPrompts-len=', enabledUserPrompts.length);

  // Detect poster mode — skip card RAG injection to avoid multi-card suggestions polluting poster layout
  const currentLayoutId = configState.reportLayoutId;
  const isPosterLayout = currentLayoutId === 'universal/poster-single' || currentLayoutId === 'universal/poster-wide';

  // Query System RAG for relevant cards and layouts to inject into the system prompt
  // Skip card retrieval in poster mode: card recommendations would cause AI to generate multi-card layout
  const userMessage = messages.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? '';
  const userMessageText = typeof userMessage === 'string' ? userMessage : '';
  console.log('[reactAgent] querying System RAG for:', userMessageText.slice(0, 80), '| posterMode=', isPosterLayout);
  let systemComponentsContext = '';
  if (!isPosterLayout) {
    const { cards: ragCards, layouts: ragLayouts } = await retrieveSystemComponents(userMessageText, {
      topKCards: 15,
      topKLayouts: 5,
    });
    systemComponentsContext = formatSystemComponentsPrompt(ragCards, ragLayouts);
    console.log('[reactAgent] System RAG: cards=', ragCards.length, 'layouts=', ragLayouts.length,
      'contextLen=', systemComponentsContext.length);
  } else {
    console.log('[reactAgent] System RAG: SKIPPED (poster mode)');
  }

  let systemPrompt: string;
  try {
    // Resolve active preset name + modifier for system prompt injection
    const activePreset = configState.activePresetId
      ? BUILT_IN_PRESETS.find((p) => p.id === configState.activePresetId)
      : undefined;

    systemPrompt = buildSystemPrompt({
      currentTime: new Date().toLocaleString('zh-CN'),
      fileContext: fileContext || undefined,
      userPrompts: enabledUserPrompts.length > 0 ? enabledUserPrompts : undefined,
      templateHtml: selectedTemplate?.html,
      memoryContext: memoryContext || undefined,
      preferredChartEngine: configState.preferredChartEngine,
      datasourceContext: datasourceContext || undefined,
      systemComponentsContext: systemComponentsContext || undefined,
      activePresetName: activePreset?.name,
      presetPromptModifier: activePreset?.promptModifier,
      language: configState.language,
      reportLayoutId: currentLayoutId,
    });
  } catch (bspErr: unknown) {
    console.error('[reactAgent] buildSystemPrompt THREW:', bspErr);
    console.error('[reactAgent] bspErr type:', typeof bspErr, bspErr instanceof TypeError ? 'TypeError' : '');
    throw bspErr;
  }
  console.log('[reactAgent] buildSystemPrompt OK, type=', typeof systemPrompt, 'len=', systemPrompt.length);

  // Build normalized messages for the LLM
  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  type NormalizedMsg = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | ContentPart[];
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  };

  const normalizedMessages: NormalizedMsg[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => {
      const normalized: NormalizedMsg = { role: m.role, content: m.content };

      if (m.attachments?.length) {
        const textAttachments = m.attachments.filter((a) => a.type !== 'image');
        const imageAttachments = m.attachments.filter((a) => a.type === 'image' && a.data);

        const textSuffix = textAttachments
          .map((a) => `\n\n[附件: ${a.name}]\n${a.textContent || ''}`)
          .join('');

        if (imageAttachments.length > 0) {
          // Build multimodal content parts — send actual image data to the model
          const parts: ContentPart[] = [];
          const textContent = m.content + textSuffix;
          if (textContent.trim()) {
            parts.push({ type: 'text', text: textContent });
          }
          for (const img of imageAttachments) {
            parts.push({ type: 'image_url', image_url: { url: img.data } });
          }
          normalized.content = parts;
        } else {
          normalized.content = m.content + textSuffix;
        }
      }

      return normalized;
    }),
  ];

  // For English mode: inject a per-turn language reminder at the end of every user message.
  // This is the most reliable technique for Qwen3-series thinking models which default thinking to Chinese.
  if (configState.language === 'en-US') {
    for (const msg of normalizedMessages) {
      if (msg.role !== 'user') continue;
      const LANG_HINT = '\n\n[CRITICAL: Think and respond in English ONLY. Your entire <think>...</think> reasoning must be in English.]';
      if (typeof msg.content === 'string') {
        msg.content = msg.content + LANG_HINT;
      } else if (Array.isArray(msg.content)) {
        const lastPart = msg.content[msg.content.length - 1] as { type: string; text?: string };
        if (lastPart?.type === 'text' && lastPart.text !== undefined) {
          lastPart.text = lastPart.text + LANG_HINT;
        } else {
          (msg.content as Array<{ type: string; text: string }>).push({ type: 'text', text: LANG_HINT });
        }
      }
    }
  }


  let steps = 0;
  const configuredMax = useConfigStore.getState().reactMaxSteps;
  const effectiveMax = configuredMax === -1 ? Infinity : (configuredMax > 0 ? configuredMax : MAX_TOOL_STEPS);

  /** Rough token estimate: characters ÷ 4 (adequate for progress display). */
  function estimateTokens(msgs: Array<{ content: unknown }>): number {
    let chars = 0;
    for (const m of msgs) {
      if (typeof m.content === 'string') chars += m.content.length;
      else if (Array.isArray(m.content)) {
        for (const part of m.content as Array<{ text?: string }>) {
          if (part.text) chars += part.text.length;
        }
      }
    }
    return Math.ceil(chars / 4);
  }

  /**
   * Auto-compact: when the context window exceeds the threshold, summarise the
   * middle turns (keeping system prompt + first user message + last 3 rounds intact)
   * and replace them with a single summary message. This prevents unbounded context growth.
   */
  const COMPACT_TOKEN_THRESHOLD = 80000;
  let lastCompactedAt = 0; // step index of the last compaction to avoid tight loops

  // Read resilience config once (changes mid-run ignored — intentional for stability)
  const toolTimeoutMs = useConfigStore.getState().toolExecutionTimeoutMs ?? 120000;

  // Constants for LLM retry logic
  const LLM_MAX_ATTEMPTS = 3;
  const LLM_RETRY_BASE_MS = 1500;
  /** Matches transient / retryable error messages from LLM providers */
  const RETRYABLE_ERROR_RE = /rate.?limit|too.?many.?request|429|503|overload|service.?unavail|ECONNREFUSED|ETIMEDOUT/i;

  async function maybeCompact(): Promise<void> {
    const estimatedNow = estimateTokens(normalizedMessages);
    if (estimatedNow < COMPACT_TOKEN_THRESHOLD) return;
    if (steps - lastCompactedAt < 3) return; // prevent compaction every step
    lastCompactedAt = steps;

    // Keep: system prompt (index 0), keep last 6 messages (≈3 turns), compact the middle
    const KEEP_TAIL = 6;
    if (normalizedMessages.length <= 2 + KEEP_TAIL) return; // nothing to compact

    const systemMsg = normalizedMessages[0];
    const tail = normalizedMessages.slice(-KEEP_TAIL);
    const toSummarise = normalizedMessages.slice(1, normalizedMessages.length - KEEP_TAIL);

    const transcript = toSummarise
      .map((m) => {
        const role = m.role.toUpperCase();
        const text = typeof m.content === 'string'
          ? m.content.slice(0, 800)
          : useConfigStore.getState().language === 'en-US' ? '(non-text content)' : '(非文本内容)';
        return `[${role}]: ${text}`;
      })
      .join('\n\n');

    const isCompactEn = useConfigStore.getState().language === 'en-US';
    const summaryPrompt = isCompactEn
      ? `Briefly summarize the following conversation history in English (focus on: completed analyses, generated report titles and key data, user-confirmed decisions, important errors and solutions). Keep under 400 words.\n\n---\n${transcript}\n---`
      : `请用中文简洁地总结以下对话历史（重点保留：已完成的分析、生成的报告标题和关键数据、用户已确认的决策、重要错误和解决方案）。摘要不超过 500 字。\n\n---\n${transcript}\n---`;

    try {
      let summary = '';
      const summaryStream = streamChat(
        config,
        [{ role: 'user', content: summaryPrompt }],
        [],
        signal
      );
      for await (const ev of summaryStream) {
        if (ev.type === 'text-delta') summary += ev.content;
      }
      if (summary.trim()) {
        normalizedMessages.splice(
          1,
          normalizedMessages.length - 1 - KEEP_TAIL,
          { role: 'system', content: isCompactEn
            ? `[Conversation History Summary (compressed ${toSummarise.length} messages)]\n${summary.trim()}`
            : `[对话历史摘要（已压缩 ${toSummarise.length} 条消息）]\n${summary.trim()}` }
        );
      }
    } catch {
      // Compact failure is non-fatal — continue with uncompacted messages
    }
  }

  while (steps < effectiveMax) {
    steps++;

    // Emit initial status on first step, "evaluating" on subsequent steps
    const isEnglish = useConfigStore.getState().language === 'en-US';
    yield { type: 'agent-status', message: steps === 1 ? (isEnglish ? 'Preparing…' : '正在准备…') : (isEnglish ? 'Evaluating…' : '正在评估…') };

    // Auto-compact context window if approaching token limits
    await maybeCompact();

    // Emit turn-info so the UI can show step progress
    yield {
      type: 'turn-info',
      current: steps,
      max: effectiveMax === Infinity ? -1 : effectiveMax,
      estimatedTokens: estimateTokens(normalizedMessages),
    };

    let hasToolCalls = false;
    const pendingToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    console.log('[reactAgent] step', steps, 'calling streamChat, typeof streamChat=', typeof streamChat,
      'msgs=', normalizedMessages.length, 'lastRole=', normalizedMessages[normalizedMessages.length-1]?.role);

    // Retry transient LLM errors (rate limits / 5xx / network) with exponential backoff
    for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        const retryDelayMs = LLM_RETRY_BASE_MS * (attempt - 1);
        yield { type: 'text-delta' as const, content: isEnglish ? `\n\n_(\u26a1 Retry ${attempt - 1}, waiting ${retryDelayMs / 1000}s\u2026)_\n\n` : `\n\n_(\u26a1 \u7b2c ${attempt - 1} \u6b21\u91cd\u8bd5\uff0c\u7b49\u5f85 ${retryDelayMs / 1000}s\u2026)_\n\n` };
        await new Promise<void>((r) => setTimeout(r, retryDelayMs));
        if (signal?.aborted) return;
      }

      let stream: AsyncGenerator<StreamEvent>;
      try {
        stream = streamChat(config, normalizedMessages, toolDefs, signal);
      } catch (e) {
        console.error('[reactAgent] streamChat() THREW synchronously:', e);
        throw e;
      }

      let gotContent = false;
      let shouldRetry = false;
      let emittedThinkStatus = false;
      let emittedTextStatus = false;

      for await (const event of stream) {
        if (signal?.aborted) return;

        if (event.type === 'text-delta') {
          gotContent = true;
          if (!emittedTextStatus) {
            emittedTextStatus = true;
            yield { type: 'agent-status', message: isEnglish ? 'Thinking…' : '正在思考…' };
          }
          yield event;
        } else if (event.type === 'think-delta') {
          if (!emittedThinkStatus) {
            emittedThinkStatus = true;
            yield { type: 'agent-status', message: isEnglish ? 'Reasoning…' : '正在推理…' };
          }
          yield event;
        } else if (event.type === 'tool-call') {
          gotContent = true;
          hasToolCalls = true;
          pendingToolCalls.push({ id: event.id, name: event.name, args: event.args });
          yield { type: 'agent-status', message: getToolStatusMessage(event.name, isEnglish) };
          yield event;
        } else if (event.type === 'error') {
          console.error('[reactAgent] step', steps, 'error event:', event.message);
          if (!gotContent && attempt < LLM_MAX_ATTEMPTS && RETRYABLE_ERROR_RE.test(event.message || '')) {
            console.warn('[reactAgent] transient error, will retry:', event.message, 'attempt=', attempt);
            shouldRetry = true;
            break; // break inner for-await — outer loop will retry
          }
          yield event;
          return;
        }
      }

      if (!shouldRetry) break; // successful or non-retryable — exit retry loop
    }

    console.log('[reactAgent] step', steps, 'done: hasToolCalls=', hasToolCalls,
      'pendingToolCalls=', pendingToolCalls.map(t => t.name));

    if (!hasToolCalls) {
      yield { type: 'done' };
      return;
    }

    // Execute tool calls and add results to messages
    const toolCallsForMsg = pendingToolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    }));

    // Add assistant message with tool calls
    normalizedMessages.push({
      role: 'assistant',
      content: '',
      tool_calls: toolCallsForMsg,
    });

    // Partition calls:
    //   1. ask_user  → always sequential & interactive (handled by UI callback)
    //   2. concurrency-safe tools → run in parallel via Promise.allSettled
    //   3. non-concurrency-safe tools → run serially in call order
    const askUserCalls = pendingToolCalls.filter((tc) => tc.name === 'ask_user');
    const otherCalls = pendingToolCalls.filter((tc) => tc.name !== 'ask_user');
    const safeCalls = otherCalls.filter((tc) => toolMap.get(tc.name)?.isConcurrencySafe?.() === true);
    const serialCalls = otherCalls.filter((tc) => toolMap.get(tc.name)?.isConcurrencySafe?.() !== true);

    // Results map: callId → result string (preserves order even though execution may be parallel)
    const results = new Map<string, string>();

    /** Execute a single tool call, respecting validateInput and maxResultSizeChars. */
    async function executeTool(tc: { id: string; name: string; args: Record<string, unknown> }): Promise<{ id: string; result: string }> {
      const tool = toolMap.get(tc.name);
      if (!tool) return { id: tc.id, result: `未知工具: ${tc.name}` };

      // Run validateInput if defined
      if (tool.validateInput) {
        const validation = tool.validateInput(tc.args);
        if (!validation.valid) {
          return { id: tc.id, result: `工具参数验证失败: ${validation.error ?? '参数无效'}` };
        }
      }

      try {
        const execPromise = tool.execute(tc.args, signal);
        let result: string;
        if (toolTimeoutMs > 0) {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`\u5de5\u5177\u6267\u884c\u8d85\u65f6\uff08${toolTimeoutMs / 1000}\u79d2\uff09\uff0c\u5df2\u81ea\u52a8\u53d6\u6d88`)), toolTimeoutMs)
          );
          result = await Promise.race([execPromise, timeoutPromise]);
        } else {
          result = await execPromise;
        }
        // Truncate oversized results to avoid flooding the context window
        const limit = tool.maxResultSizeChars;
        if (limit && result.length > limit) {
          result = result.slice(0, limit) + `\n\n…（结果已截断，原始长度 ${result.length} 字符，已保留前 ${limit} 字符）`;
        }
        return { id: tc.id, result };
      } catch (err) {
        return { id: tc.id, result: `工具执行错误: ${err instanceof Error ? err.message : '未知错误'}` };
      }
    }

    // Handle ask_user calls sequentially first
    for (const tc of askUserCalls) {
      const question = String(tc.args.question ?? '');
      const context = tc.args.context ? String(tc.args.context) : undefined;
      const options = Array.isArray(tc.args.options) ? (tc.args.options as string[]) : undefined;
      yield { type: 'ask-user', callId: tc.id, question, options };
      yield { type: 'agent-status', message: isEnglish ? 'Waiting for your input…' : '等待用户输入…' };
      let result: string;
      if (onAskUser) {
        try {
          result = await onAskUser(tc.id, question, context, options);
        } catch {
          result = '(用户取消了回答)';
        }
      } else {
        result = '(ask_user 未配置回调，跳过交互)';
      }
      // If the user stopped streaming, bail out immediately
      if (result === '__ABORT__' || signal?.aborted) return;
      results.set(tc.id, result);
    }

    // Execute serial (state-modifying) tools one by one in call order
    for (const tc of serialCalls) {
      const { id, result } = await executeTool(tc);
      results.set(id, result);
    }

    // Execute concurrency-safe tools in parallel
    if (safeCalls.length > 0) {
      const settled = await Promise.allSettled(safeCalls.map((tc) => executeTool(tc)));
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          results.set(outcome.value.id, outcome.value.result);
        }
      }
    }

    // Emit tool-result events and push to messages in original call order
    for (const tc of pendingToolCalls) {
      const result = results.get(tc.id) ?? '(工具未返回结果)';
      yield { type: 'tool-result', callId: tc.id, result };
      normalizedMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }

    // D-05: Framework-level post-hook — after a successful chart generation,
    // run validate_report silently. suggest_card_combinations is now called by AI
    // as a pre-planning step BEFORE generate_chart (not as post-output).
    const chartToolNames = new Set(['generate_chart', 'generate_chart_apex']);
    const planStillRunning = activePlanTaskIds.size > 0;
    if (!planStillRunning) {
      for (const tc of pendingToolCalls) {
        if (!chartToolNames.has(tc.name)) continue;
        const res = results.get(tc.id) ?? '';
        const succeeded = !res.includes('错误') && !res.includes('失败') && res.includes('✅');
        if (succeeded) {
          // Auto-execute validate_report silently (don't inject into agent response)
          try {
            yield { type: 'agent-status', message: isEnglish ? 'Validating report quality…' : '正在自动校验报表质量…' };
            const validateTool = toolMap.get('validate_report');
            if (validateTool) {
              const validateResult = await validateTool.execute({});
              // Only inject if there are ERROR-level issues that require fixing
              if (validateResult && validateResult.includes('[ERROR]')) {
                normalizedMessages.push({
                  role: 'user',
                  content:
                    `[系统报表质量检查 — 框架自动执行]\n\n` +
                    validateResult +
                    `\n\n检测到报表质量错误，请修复后重新生成。`,
                });
              }
            }
          } catch { /* non-critical */ }
          break;
        }
      }
    }
  } // end while (steps < effectiveMax)

  yield { type: 'text-delta', content: `\n\n⚠️ 已达到最大工具调用步数限制（${steps} 步）。如需继续，请在设置中调高 ReAct 步数限制。` };
  yield { type: 'done' };
}
