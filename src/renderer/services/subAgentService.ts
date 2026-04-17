/**
 * Sub-Agent parallel execution engine.
 *
 * The main (coordinator) agent may call dispatch_subagents to fan out
 * independent tasks to N sub-agents running in parallel.  Each sub-agent
 * uses the same LLM config but a fresh context restricted to its task.
 *
 * Sub-agents can call tools (generate_chart, data_analysis, etc.) but
 * cannot themselves dispatch further sub-agents (max 1 level deep).
 */

import type { ModelConfig, StreamEvent, SubAgentTask, SubAgentStatus } from '../types';
import { streamChat, toolsToJsonSchema } from './llmService';
import { getAllTools } from '../tools';
import { useConfigStore } from '../stores/configStore';
import { buildSystemPrompt } from '../prompts/systemPrompt';

export interface SubAgentDispatchItem {
  id: string;
  name: string;
  description: string;
  task: string;
}

export interface SubAgentResult {
  id: string;
  result: string;
  error?: string;
}

export type SubAgentUpdateCallback = (
  taskId: string,
  status: SubAgentStatus,
  partialContent?: string,
  result?: string,
  error?: string,
) => void;

const SUB_AGENT_MAX_STEPS = 8;

/**
 * Run a single sub-agent task to completion.
 * Yields text/tool events via the update callback.
 * Returns the final text result.
 */
async function runSingleSubAgent(
  item: SubAgentDispatchItem,
  config: ModelConfig,
  signal: AbortSignal,
  onUpdate: SubAgentUpdateCallback,
): Promise<string> {
  const tools = getAllTools().filter((t) => t.name !== 'dispatch_subagents' && t.name !== 'ask_user');
  const toolDefs = toolsToJsonSchema(
    tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
  );
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const language = useConfigStore.getState().language;
  const systemPrompt = buildSystemPrompt({
    currentTime: new Date().toLocaleString(language === 'en-US' ? 'en-US' : 'zh-CN'),
    language,
  });

  type ContentPart = { type: 'text'; text: string };
  type NormalizedMsg = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | ContentPart[];
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  };

  const normalizedMessages: NormalizedMsg[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: item.task },
  ];

  let finalText = '';
  let steps = 0;
  let accumulated = '';

  onUpdate(item.id, 'running', '', undefined, undefined);

  while (steps < SUB_AGENT_MAX_STEPS) {
    steps++;
    let hasToolCalls = false;
    const pendingToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    const stream = streamChat(config, normalizedMessages, toolDefs, signal);

    for await (const event of stream) {
      if (signal.aborted) {
        onUpdate(item.id, 'error', accumulated, undefined, '已中止');
        return accumulated;
      }

      if (event.type === 'text-delta') {
        accumulated += event.content;
        finalText += event.content;
        onUpdate(item.id, 'running', accumulated);
      } else if (event.type === 'tool-call') {
        hasToolCalls = true;
        pendingToolCalls.push({ id: event.id, name: event.name, args: event.args });
      } else if (event.type === 'error') {
        onUpdate(item.id, 'error', accumulated, undefined, event.message);
        return accumulated || `错误: ${event.message}`;
      }
    }

    if (!hasToolCalls) {
      break;
    }

    // Process tool calls
    const toolCallsForMsg = pendingToolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    }));

    normalizedMessages.push({
      role: 'assistant',
      content: accumulated || '',
      tool_calls: toolCallsForMsg,
    });
    accumulated = '';
    finalText = '';

    for (const tc of pendingToolCalls) {
      const tool = toolMap.get(tc.name);
      let result: string;
      if (tool) {
        try {
          result = await tool.execute(tc.args);
        } catch (err) {
          result = `工具执行错误: ${err instanceof Error ? err.message : '未知错误'}`;
        }
      } else {
        result = `未知工具: ${tc.name}`;
      }

      normalizedMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  onUpdate(item.id, 'done', accumulated, accumulated, undefined);
  return accumulated;
}

/**
 * Dispatch multiple sub-agent tasks in parallel and collect results.
 * Progress callbacks are fired as each agent progresses.
 */
export async function dispatchSubAgents(
  items: SubAgentDispatchItem[],
  config: ModelConfig,
  signal: AbortSignal,
  onTaskUpdate: SubAgentUpdateCallback,
): Promise<SubAgentResult[]> {
  const promises = items.map(async (item): Promise<SubAgentResult> => {
    try {
      const result = await runSingleSubAgent(item, config, signal, onTaskUpdate);
      return { id: item.id, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : '未知错误';
      onTaskUpdate(item.id, 'error', '', undefined, error);
      return { id: item.id, result: `执行失败: ${error}`, error };
    }
  });

  return Promise.all(promises);
}
