/**
 * run_subagents_parallel — 并行启动多个子代理
 *
 * 用于将多个独立任务分配给并行运行的子代理，提高执行效率。
 * 每个子代理拥有独立的执行上下文，互不干扰。
 * 最终返回所有子代理结果的汇总。
 */
import type { AgentToolDefinition, ChatMessage, ModelConfig } from '../types';
import { useSubagentStore } from '../stores/subagentStore';

export interface ParallelTask {
  task_id: string;
  task: string;
  context?: string;
}

export const runSubagentsParallelTool: AgentToolDefinition = {
  name: 'run_subagents_parallel',
  description:
    '并行启动多个子代理，同时执行多个独立任务（无数据依赖关系的任务）。' +
    '比多次调用 run_subagent 效率更高，适合"分治"场景：如同时生成多个分析模块、并行获取多个数据维度。' +
    '返回所有子代理的执行结果汇总。注意：所有子任务必须彼此独立（无前后依赖），否则应使用串行 run_subagent。',
  parameters: [
    {
      name: 'tasks',
      type: 'array',
      description:
        '并行任务数组，每项包含：task_id（唯一标识符）、task（完整任务描述）、context（可选上下文）。' +
        '示例：[{"task_id":"task_sales","task":"生成销售趋势图表"},{"task_id":"task_kpi","task":"计算关键KPI指标"}]',
      required: true,
    },
  ],

  execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
    const rawTasks = args.tasks;
    const tasks: ParallelTask[] = Array.isArray(rawTasks)
      ? rawTasks.map((t) => ({
          task_id: String((t as Record<string, unknown>).task_id ?? `parallel-${Date.now()}`),
          task: String((t as Record<string, unknown>).task ?? ''),
          context: (t as Record<string, unknown>).context
            ? String((t as Record<string, unknown>).context)
            : undefined,
        }))
      : [];

    if (tasks.length === 0) return '错误：tasks 数组不能为空';
    if (tasks.length === 1) {
      // Fallback to single task behavior for safety
      const { runSubagentTool } = await import('./runSubagent');
      return runSubagentTool.execute(tasks[0] as unknown as Record<string, unknown>, signal);
    }

    const { addLog, addTodo, updateTodo } = useSubagentStore.getState();
    const { runReactAgent } = await import('../services/reactAgent');
    const { useConfigStore } = await import('../stores/configStore');

    const configState = useConfigStore.getState();
    const model = configState.models.find((m) => m.id === configState.activeModelId) as ModelConfig | undefined;
    if (!model) return '错误：没有可用的模型配置，请在设置中配置模型';

    // Register all tasks as running
    for (const t of tasks) {
      addLog(t.task_id, `🚀 并行启动：${t.task.slice(0, 80)}${t.task.length > 80 ? '…' : ''}`);
      addTodo({ id: t.task_id, label: t.task.slice(0, 60) + (t.task.length > 60 ? '…' : ''), status: 'running', parallelGroup: 'parallel-batch' });
    }

    const SUBAGENT_TIMEOUT_MS = 3 * 60 * 1000;

    // Run all tasks in parallel
    const taskPromises = tasks.map(async (t): Promise<{ task_id: string; result: Record<string, unknown> }> => {
      const timeoutController = new AbortController();
      const timeoutHandle = setTimeout(() => timeoutController.abort(), SUBAGENT_TIMEOUT_MS);

      let combinedSignal: AbortSignal;
      if (signal) {
        combinedSignal = typeof AbortSignal.any === 'function'
          ? AbortSignal.any([signal, timeoutController.signal])
          : timeoutController.signal;
      } else {
        combinedSignal = timeoutController.signal;
      }

      const userMessage: ChatMessage = {
        id: `parallel-msg-${t.task_id}-${Date.now()}`,
        role: 'user',
        content: t.context ? `${t.task}\n\n## 补充上下文\n${t.context}` : t.task,
        timestamp: Date.now(),
        attachments: [],
        toolCalls: [],
      };

      let finalText = '';
      let stepCount = 0;
      const artifacts: Array<{ type: string; title: string }> = [];
      const toolsCalled: string[] = [];

      try {
        for await (const event of runReactAgent([userMessage], model, combinedSignal)) {
          if (event.type === 'text-delta') {
            finalText += event.content;
          } else if (event.type === 'tool-call') {
            stepCount++;
            const titleHint = event.args.title ? `："${String(event.args.title).slice(0, 40)}"` : '';
            addLog(t.task_id, `  ⚙️ [步骤${stepCount}] 调用 ${event.name}${titleHint}`);
            if (!toolsCalled.includes(event.name)) toolsCalled.push(event.name);
          } else if (event.type === 'tool-result') {
            const preview = String(event.result ?? '').slice(0, 60).replace(/\n/g, ' ');
            addLog(t.task_id, `  ✓ 完成 → ${preview}${String(event.result ?? '').length > 60 ? '…' : ''}`);
          } else if (event.type === 'done') {
            break;
          } else if (event.type === 'error') {
            addLog(t.task_id, `  ❌ 错误：${event.message}`);
            updateTodo(t.task_id, 'error');
            clearTimeout(timeoutHandle);
            return { task_id: t.task_id, result: { status: 'error', error: event.message } };
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(t.task_id, `❌ 执行异常：${msg}`);
        updateTodo(t.task_id, 'error');
        clearTimeout(timeoutHandle);
        return { task_id: t.task_id, result: { status: 'error', error: msg } };
      }

      clearTimeout(timeoutHandle);
      addLog(t.task_id, `✅ 并行任务完成（共 ${stepCount} 步${artifacts.length > 0 ? `，${artifacts.length} 个产出物` : ''}）`);
      updateTodo(t.task_id, 'done');

      return {
        task_id: t.task_id,
        result: {
          status: 'success',
          summary: finalText.trim() || `子代理已完成 ${stepCount} 步操作`,
          artifacts,
          toolsCalled,
          steps: stepCount,
        },
      };
    });

    const allResults = await Promise.all(taskPromises);
    const successCount = allResults.filter((r) => r.result.status === 'success').length;
    const errorCount = allResults.filter((r) => r.result.status === 'error').length;

    const resultMap: Record<string, unknown> = {};
    for (const r of allResults) {
      resultMap[r.task_id] = r.result;
    }

    return JSON.stringify({
      status: errorCount === 0 ? 'success' : 'partial',
      summary: `并行执行完成：${successCount} 成功，${errorCount} 失败，共 ${tasks.length} 个子任务`,
      results: resultMap,
    });
  },

  isConcurrencySafe: () => false,
  getActivityDescription: (args) => {
    const tasks = Array.isArray(args.tasks) ? (args.tasks as Array<Record<string, unknown>>) : [];
    return `并行启动 ${tasks.length} 个子代理`;
  },
};
