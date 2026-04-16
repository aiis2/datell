import type { AgentToolDefinition } from '../types';
import { useSubagentStore } from '../stores/subagentStore';
import { activePlanTaskIds } from './planTasks';
import { useConfigStore } from '../stores/configStore';

/**
 * complete_task — mark a planned task as done and auto-advance to next.
 * D-03: validates task_id exists in the current plan to prevent phantom completions.
 */
export const completeTaskTool: AgentToolDefinition = {
  name: 'complete_task',
  description:
    '标记 plan_tasks 中声明的某个步骤为已完成，并自动将下一个待办步骤设为"进行中"。' +
    '每完成一个主要步骤工具调用后，立即调用此工具更新进度。' +
    '注意：只有在实际执行了该步骤的工具调用之后，才能标记为完成。',
  parameters: [
    {
      name: 'task_id',
      type: 'string',
      description: 'plan_tasks 返回的任务 ID，格式为 "task_0"、"task_1" 等',
      required: true,
    },
  ],

  execute: async (args: Record<string, unknown>): Promise<string> => {
    const taskId = String(args.task_id ?? '');
    const isEn = useConfigStore.getState().language === 'en-US';
    if (!taskId) return isEn ? 'Error: task_id cannot be empty' : '错误：task_id 不能为空';

    // D-03: Validate against current plan
    if (activePlanTaskIds.size > 0 && !activePlanTaskIds.has(taskId)) {
      return isEn
        ? `⚠️ Warning: task ${taskId} is not in the current plan. Please ensure you call complete_task after executing the tool call. Valid task IDs: ${[...activePlanTaskIds].join(', ')}`
        : `⚠️ 警告：任务 ${taskId} 不在当前计划中。请确保在执行工具调用后再调用 complete_task。有效任务 ID：${[...activePlanTaskIds].join(', ')}`;
    }

    const store = useSubagentStore.getState();
    const idx = store.todos.findIndex((t) => t.id === taskId);
    if (idx === -1) return isEn ? `Task ${taskId} does not exist` : `任务 ${taskId} 不存在`;

    store.updateTodo(taskId, 'done');

    // Re-read fresh state after the update to avoid stale closure
    const freshTodos = useSubagentStore.getState().todos;
    const completedTodo = freshTodos.find((t) => t.id === taskId);

    // For parallel group members: only advance to next step when ALL group members are done
    let shouldAdvance = true;
    if (completedTodo?.parallelGroup) {
      const groupMembers = freshTodos.filter(
        (t) => t.parallelGroup === completedTodo.parallelGroup
      );
      shouldAdvance = groupMembers.every((t) => t.status === 'done' || t.status === 'error');
    }

    if (shouldAdvance) {
      // Find last index in this group (or just the completed task's index)
      let groupLastIdx = idx;
      if (completedTodo?.parallelGroup) {
        freshTodos.forEach((t, i) => {
          if (t.parallelGroup === completedTodo.parallelGroup) groupLastIdx = Math.max(groupLastIdx, i);
        });
      }
      const nextTask = freshTodos.find((t, i) => i > groupLastIdx && t.status === 'pending');
      if (nextTask) {
        useSubagentStore.getState().updateTodo(nextTask.id, 'running');
        // If next task is in a parallel group, mark all its group members running too
        if (nextTask.parallelGroup) {
          freshTodos
            .filter(
              (t) => t.parallelGroup === nextTask.parallelGroup &&
                t.id !== nextTask.id &&
                t.status === 'pending'
            )
            .forEach((t) => useSubagentStore.getState().updateTodo(t.id, 'running'));
        }
      }
    }

    // Check if all tasks are now complete
    const allDone = freshTodos.every((t) => t.status === 'done' || t.status === 'error');
    if (allDone) {
      return isEn
        ? `Task ${taskId} complete. All ${freshTodos.length} steps finished.`
        : `任务 ${taskId} 已完成。所有 ${freshTodos.length} 个步骤均已完成。`;
    }

    const remaining = freshTodos.filter((t) => t.status === 'pending').length;
    return isEn
      ? `Task ${taskId} complete. ${remaining} steps remaining.`
      : `任务 ${taskId} 已完成，还有 ${remaining} 个步骤待执行。`;
  },
  isConcurrencySafe: () => false,
  getActivityDescription: (args) => {
    const isEn = useConfigStore.getState().language === 'en-US';
    return isEn ? `Complete task: ${String(args.task_id ?? '')}` : `完成任务: ${String(args.task_id ?? '')}`;
  },
};
