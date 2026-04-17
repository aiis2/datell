/**
 * run_subagents_serial — 串行执行多个子代理（前一个结果注入下一个上下文）
 *
 * 适用于有顺序依赖的多步骤分析流水线：
 *   步骤1 → 步骤2（使用步骤1的结果）→ 步骤3 → ...
 *
 * 与 run_subagents_parallel 的区别：
 *   - 串行：前后有依赖，结果传递，一个完成后下一个才开始
 *   - 并行：互相独立，同时运行
 */
import type { AgentToolDefinition, ModelConfig } from '../types';
import { useSubagentStore } from '../stores/subagentStore';

export const runSubagentsSerialTool: AgentToolDefinition = {
  name: 'run_subagents_serial',
  description:
    '串行执行多个子代理，每个子代理完成后将结果传递给下一个子代理的上下文。' +
    '适用于有前后依赖的流水线任务，如：先分析数据 → 再根据分析结果生成报表 → 再根据报表生成摘要。' +
    '相比直接串行调用多个 run_subagent，此工具会自动将前一步结果注入下一步的上下文中。',
  parameters: [
    {
      name: 'stages',
      type: 'array',
      description:
        '串行阶段数组，按顺序执行。每项包含：stage_id（唯一标识）、task（任务描述）、context（可选额外上下文，前置结果会自动追加）。' +
        '示例：[{"stage_id":"analyze","task":"分析销售数据并提取关键指标"},{"stage_id":"report","task":"根据分析结果生成可视化报表"}]',
      required: true,
    },
  ],
  isConcurrencySafe: () => false,

  execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
    const rawStages = args.stages;
    if (!Array.isArray(rawStages) || rawStages.length === 0) return '错误：stages 数组不能为空';

    const stages = rawStages.map((s) => ({
      stage_id: String((s as Record<string, unknown>).stage_id ?? `stage-${Date.now()}`),
      task: String((s as Record<string, unknown>).task ?? ''),
      context: (s as Record<string, unknown>).context
        ? String((s as Record<string, unknown>).context)
        : undefined,
    }));

    const { addLog, addTodo, updateTodo } = useSubagentStore.getState();
    const { runReactAgent } = await import('../services/reactAgent');
    const { useConfigStore } = await import('../stores/configStore');
    const configState = useConfigStore.getState();
    const model = configState.models.find((m) => m.id === configState.activeModelId) as ModelConfig | undefined;
    if (!model) return '错误：没有可用的模型配置，请在设置中配置模型';

    // Register all stages as pending
    for (const s of stages) {
      addTodo({ id: s.stage_id, label: `[串行] ${s.task.slice(0, 55)}${s.task.length > 55 ? '…' : ''}`, status: 'pending' });
    }

    const TIMEOUT_MS = 3 * 60 * 1000;
    const stageResults: Array<{ stage_id: string; summary: string }> = [];
    let previousResult = '';

    for (const stage of stages) {
      if (signal?.aborted) break;

      updateTodo(stage.stage_id, 'running');
      addLog(stage.stage_id, `▶ 串行执行：${stage.task.slice(0, 80)}`);

      // Inject previous result into context
      const contextWithPrev = previousResult
        ? `${stage.context ? stage.context + '\n\n' : ''}[上一阶段结果摘要]\n${previousResult.slice(0, 600)}`
        : (stage.context ?? '');

      const taskText = contextWithPrev
        ? `${stage.task}\n\n---\n上下文：${contextWithPrev}`
        : stage.task;

      let summary = '';
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('子代理执行超时')), TIMEOUT_MS)
        );

        const agentRun = (async () => {
          const messages = [{ id: `serial-${stage.stage_id}-${Date.now()}`, role: 'user' as const, content: taskText, timestamp: Date.now(), attachments: [], toolCalls: [] }];
          for await (const ev of runReactAgent(messages, model, signal)) {
            if (ev.type === 'text-delta') summary += ev.content;
            else if (ev.type === 'agent-status') {
              addLog(stage.stage_id, `  ${ev.message}`);
            }
          }
        })();

        await Promise.race([agentRun, timeout]);
        previousResult = summary.slice(0, 800);
        updateTodo(stage.stage_id, 'done');
        stageResults.push({ stage_id: stage.stage_id, summary: summary.slice(0, 500) });
        addLog(stage.stage_id, `✅ 阶段完成`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        updateTodo(stage.stage_id, 'error');
        addLog(stage.stage_id, `❌ 阶段失败: ${errMsg}`);
        stageResults.push({ stage_id: stage.stage_id, summary: `[STAGE_ERROR] ${errMsg}` });
        previousResult = `[前一阶段失败：${errMsg}]`;
      }
    }

    const final = stageResults.map((r, i) => `阶段 ${i + 1} (${r.stage_id}): ${r.summary}`).join('\n\n');
    return JSON.stringify({
      status: stageResults.every((r) => !r.summary.startsWith('[STAGE_ERROR]')) ? 'success' : 'partial',
      stages: stageResults.length,
      summary: final.slice(0, 1000),
      lastResult: previousResult,
    });
  },
};
