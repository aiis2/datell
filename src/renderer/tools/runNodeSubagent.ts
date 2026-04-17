/**
 * run_node_subagent — 汇聚节点子代理
 *
 * 类似管道中的"merge"节点：收集多个已完成子代理的结果，
 * 通过一个聚合子代理生成统一输出（如合并摘要、交叉分析、综合报告等）。
 *
 * 设计参考：
 *   主代理 → [并行/串行子代理 A, B, C] → NodeSubAgent（汇聚 A+B+C 的结果）→ 最终输出
 *
 * 与 run_subagent 的区别：NodeSubAgent 的 task 中会自动注入所有 input_results 内容作为上下文。
 */
import type { AgentToolDefinition, ChatMessage, ModelConfig } from '../types';
import { useSubagentStore } from '../stores/subagentStore';

export const runNodeSubagentTool: AgentToolDefinition = {
  name: 'run_node_subagent',
  description:
    '汇聚节点：收集多个子代理的输出并通过一个聚合子代理生成统一结论。' +
    '在主代理规划的任务流水线中，当多个并行/串行子代理完成后，用此工具将它们的结果合并、分析或生成最终综合报告。' +
    '示例使用场景：并行完成"销售分析"和"人员分析"后，用 NodeSubAgent 生成"综合管理看板"。',
  parameters: [
    {
      name: 'node_id',
      type: 'string',
      description: '节点唯一标识符（如 "merge_node_1"）',
      required: true,
    },
    {
      name: 'task',
      type: 'string',
      description: '聚合任务描述，告知子代理如何整合所有收到的结果（如"将以下分析结果综合生成一份执行摘要"）',
      required: true,
    },
    {
      name: 'input_results',
      type: 'array',
      description:
        '要汇聚的子代理结果数组，每项包含：source_id（来源标识）和 result（结果文字）。' +
        '示例：[{"source_id":"task_sales","result":"销售总额 ¥12,345"},{"source_id":"task_hr","result":"出勤率 95%"}]',
      required: true,
    },
  ],
  isConcurrencySafe: () => false,

  execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
    const nodeId = String(args.node_id ?? `node-${Date.now()}`);
    const task = String(args.task ?? '');
    const rawInputs = Array.isArray(args.input_results) ? args.input_results : [];

    const inputs = rawInputs.map((r) => ({
      source_id: String((r as Record<string, unknown>).source_id ?? '?'),
      result: String((r as Record<string, unknown>).result ?? ''),
    }));

    if (!task) return '错误：task 不能为空';

    const { addLog, addTodo, updateTodo } = useSubagentStore.getState();
    const { runReactAgent } = await import('../services/reactAgent');
    const { useConfigStore } = await import('../stores/configStore');
    const configState = useConfigStore.getState();
    const model = configState.models.find((m) => m.id === configState.activeModelId) as ModelConfig | undefined;
    if (!model) return '错误：没有可用的模型配置';

    addTodo({ id: nodeId, label: `[汇聚节点] ${task.slice(0, 50)}${task.length > 50 ? '…' : ''}`, status: 'running' });
    addLog(nodeId, `▶ 汇聚节点启动，合并 ${inputs.length} 个子任务结果`);

    // Build aggregated context from all inputs
    const inputContext = inputs.map((inp, i) =>
      `--- 子任务 ${i + 1}（${inp.source_id}）---\n${inp.result.slice(0, 800)}`
    ).join('\n\n');

    const fullTask = `${task}\n\n## 汇聚的子任务结果\n\n${inputContext}`;

    const userMessage: ChatMessage = {
      id: `node-${nodeId}-${Date.now()}`,
      role: 'user',
      content: fullTask,
      timestamp: Date.now(),
      attachments: [],
      toolCalls: [],
    };

    let summary = '';
    const TIMEOUT_MS = 4 * 60 * 1000;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('NodeSubAgent 执行超时')), TIMEOUT_MS)
      );

      const agentRun = (async () => {
        for await (const ev of runReactAgent([userMessage], model, signal)) {
          if (ev.type === 'text-delta') summary += ev.content;
          else if (ev.type === 'agent-status') addLog(nodeId, `  ${ev.message}`);
        }
      })();

      await Promise.race([agentRun, timeout]);
      updateTodo(nodeId, 'done');
      addLog(nodeId, `✅ 汇聚节点完成`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      updateTodo(nodeId, 'error');
      addLog(nodeId, `❌ 节点失败: ${errMsg}`);
      return JSON.stringify({ status: 'error', node_id: nodeId, error: errMsg });
    }

    return JSON.stringify({
      status: 'success',
      node_id: nodeId,
      merged_inputs: inputs.length,
      summary: summary.slice(0, 1000),
    });
  },
};
