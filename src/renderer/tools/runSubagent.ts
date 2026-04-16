import type { AgentToolDefinition, ChatMessage, ModelConfig } from '../types';
import { useSubagentStore } from '../stores/subagentStore';

export const runSubagentTool: AgentToolDefinition = {
  name: 'run_subagent',
  description:
    '派发一个独立子任务给子Agent执行。子Agent具有完整的工具调用能力（生成报表、数据分析等），可与主Agent并行运行。' +
    '适合将大任务拆分为多个独立子任务并行处理，例如同时生成多个不同维度的报表。' +
    '返回子Agent完成后的文字摘要结果。',
  parameters: [
    {
      name: 'task_id',
      type: 'string',
      description: '此子任务的唯一标识符（如 "task_revenue"、"task_attendance"），用于UI追踪',
      required: true,
    },
    {
      name: 'task',
      type: 'string',
      description: '子Agent需要完成的完整任务描述，需足够详细以便独立执行',
      required: true,
    },
    {
      name: 'context',
      type: 'string',
      description: '额外的上下文信息（如相关数据摘要、已有结果等），可选',
      required: false,
    },
  ],

  execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
    const callId = String(args.task_id ?? `sub-${Date.now()}`);
    const task = String(args.task ?? '');
    const context = args.context ? String(args.context) : '';

    if (!task.trim()) return '错误：子任务描述不能为空';

    const { addLog, addTodo, updateTodo } = useSubagentStore.getState();
    addLog(callId, `🚀 开始执行：${task.slice(0, 80)}${task.length > 80 ? '…' : ''}`);
    addTodo({ id: callId, label: task.slice(0, 60) + (task.length > 60 ? '…' : ''), status: 'running' });

    // Lazy-import to avoid circular dependency at module load time
    const { runReactAgent } = await import('../services/reactAgent');
    const { useConfigStore } = await import('../stores/configStore');

    const configState = useConfigStore.getState();
    const isEn = configState.language === 'en-US';
    const model = configState.models.find((m) => m.id === configState.activeModelId) as ModelConfig | undefined;
    if (!model) {
      addLog(callId, isEn ? '❌ No model configured' : '❌ 没有可用的模型配置');
      return isEn ? 'Error: No model configuration available. Please configure a model in Settings.' : '错误：没有可用的模型配置，请在设置中配置模型';
    }

    const userMessage: ChatMessage = {
      id: `sub-msg-${Date.now()}`,
      role: 'user',
      content: context ? `${task}\n\n## 补充上下文\n${context}` : task,
      timestamp: Date.now(),
      attachments: [],
      toolCalls: [],
    };

    let finalText = '';
    let stepCount = 0;
    const artifacts: Array<{ type: 'report' | 'excel' | 'pdf' | 'slide' | 'document'; title: string }> = [];
    const toolsCalled: string[] = [];
    // Track pending tool calls by id so tool-result events can look up name/args
    const pendingCallMap = new Map<string, { name: string; args: Record<string, unknown> }>();

    // Subagent timeout: 3 minutes max per subagent
    const SUBAGENT_TIMEOUT_MS = 3 * 60 * 1000;
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), SUBAGENT_TIMEOUT_MS);

    // Properly combine parent + timeout via AbortSignal.any if available, else fallback
    let combinedSignal: AbortSignal;
    if (signal) {
      combinedSignal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutController.signal])
        : (signal.aborted ? signal : timeoutController.signal);
    } else {
      combinedSignal = timeoutController.signal;
    }

    try {
      for await (const event of runReactAgent([userMessage], model, combinedSignal)) {
        if (event.type === 'text-delta') {
          finalText += event.content;
        } else if (event.type === 'tool-call') {
          stepCount++;
          const titleHint = event.args.title ? `："${String(event.args.title).slice(0, 40)}"` : '';
          addLog(callId, `  ⚙️ [步骤${stepCount}] 调用 ${event.name}${titleHint}`);
          if (!toolsCalled.includes(event.name)) toolsCalled.push(event.name);
          pendingCallMap.set(event.id, { name: event.name, args: event.args });
        } else if (event.type === 'tool-result') {
          const preview = String(event.result ?? '').slice(0, 60).replace(/\n/g, ' ');
          addLog(callId, `  ✓ 完成 → ${preview}${String(event.result ?? '').length > 60 ? '…' : ''}`);
          // Track artifacts produced by chart/excel/pdf/slide tools
          const resultStr = String(event.result ?? '');
          const pendingCall = pendingCallMap.get(event.callId);
          const toolName = pendingCall?.name ?? '';
          const toolArgs = pendingCall?.args ?? {};
          if (toolName === 'generate_chart' || toolName === 'generate_chart_apex') {
            if (!resultStr.includes('错误') && !resultStr.includes('失败')) {
              const titleMatch = resultStr.match(/报表 "(.+?)" 已生成/);
              artifacts.push({ type: 'report', title: titleMatch?.[1] ?? '报表' });
            }
          } else if (toolName === 'generate_excel') {
            if (!resultStr.includes('错误')) artifacts.push({ type: 'excel', title: String(toolArgs.filename ?? 'Excel') });
          } else if (toolName === 'generate_pdf') {
            if (!resultStr.includes('错误')) artifacts.push({ type: 'pdf', title: String(toolArgs.title ?? 'PDF') });
          } else if (toolName === 'generate_slide') {
            if (!resultStr.includes('错误')) artifacts.push({ type: 'slide', title: String(toolArgs.title ?? '幻灯片') });
          } else if (toolName === 'generate_document') {
            if (!resultStr.includes('错误')) artifacts.push({ type: 'document', title: String(toolArgs.title ?? '文档') });
          }
        } else if (event.type === 'error') {
          addLog(callId, isEn ? `  ❌ Error: ${event.message}` : `  ❌ 错误：${event.message}`);
          return isEn ? `Subtask error: ${event.message}` : `子任务错误：${event.message}`;
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = timeoutController.signal.aborted && !signal?.aborted;
      addLog(callId, isTimeout
        ? (isEn ? '⏰ Subtask timed out (3-minute limit)' : '⏰ 子任务超时（3分钟限制）')
        : (isEn ? `❌ Execution error: ${msg}` : `❌ 执行异常：${msg}`));
      updateTodo(callId, 'error');
      clearTimeout(timeoutHandle);
      const errMsg = isTimeout
        ? (isEn ? 'Subtask timed out: exceeded 3-minute limit' : '子任务超时：执行超过3分钟限制')
        : (isEn ? `Subtask execution error: ${msg}` : `子任务执行异常：${msg}`);
      return `[SUBAGENT_ERROR] ${errMsg}`;
    }

    clearTimeout(timeoutHandle);

    addLog(callId, isEn
      ? `✅ Task complete (${stepCount} tool steps${artifacts.length > 0 ? `, ${artifacts.length} artifact(s) generated` : ''})`
      : `✅ 任务完成（共 ${stepCount} 步工具调用${artifacts.length > 0 ? `，生成 ${artifacts.length} 个产出物` : ''}）`);
    updateTodo(callId, 'done');

    // Return structured result so coordinator Agent can review artifacts
    const result = {
      status: 'success' as const,
      summary: finalText.trim() || (isEn ? `Sub-agent completed ${stepCount} steps` : `子Agent已完成 ${stepCount} 步操作`),
      artifacts,
      toolsCalled,
      steps: stepCount,
    };
    return JSON.stringify(result);
  },
  isConcurrencySafe: () => false,
  getActivityDescription: (args) => {
    const agents = Array.isArray(args.agents) ? args.agents as Array<{name?: string}> : [];
    if (agents.length > 0) {
      return `启动子代理: ${agents.map((a) => a.name ?? '').join(', ')}`;
    }
    return '启动子代理任务...';
  },
};
