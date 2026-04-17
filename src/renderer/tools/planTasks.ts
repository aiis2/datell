import type { AgentToolDefinition } from '../types';
import { useSubagentStore } from '../stores/subagentStore';

/**
 * plan_tasks — model announces a structured TODO list before execution.
 * Creates todos in subagentStore so the AgentTodoPanel can display them.
 * Returns the list with assigned IDs so the model can reference them later.
 *
 * D-03 enhancement: track expected task IDs in a module-level set so
 * complete_task can validate that only declared tasks are marked done.
 */

/** Session-scoped set of task IDs declared in the most recent plan_tasks call */
export const activePlanTaskIds = new Set<string>();
/** Monotonic plan counter to detect stale complete_task calls across multiple plans */
export let activePlanVersion = 0;

export const planTasksTool: AgentToolDefinition = {
  name: 'plan_tasks',
  description:
    '在执行复杂任务前，声明任务计划列表。调用此工具会在界面显示"进度面板"（类似 Copilot 任务进度）。' +
    '当流程包含 2 步以上操作时，在开始执行前必须先调用此工具声明计划，让用户看到进度。' +
    '声明后立即开始执行各步骤工具，每完成一个主要步骤调用 complete_task 标记完成。' +
    '支持通过 parallel_groups 声明哪些任务可并行（同组任务同时执行，用 run_subagents_parallel）。' +
    '重要约束：plan_tasks 声明的每个步骤都必须实际执行，不可跳过。',
  parameters: [
    {
      name: 'tasks',
      type: 'array',
      description: '任务步骤列表，每项是步骤描述字符串，例如 ["读取并分析数据", "生成销售趋势图表", "导出 Excel 汇总"]',
      required: true,
    },
    {
      name: 'parallel_groups',
      type: 'array',
      description:
        '可选：声明哪些任务可以并行执行。数组中每项是一个任务索引数组（0-based）。' +
        '例如 [[1,2],[4,5]] 表示 tasks[1]和tasks[2] 可同时执行，tasks[4]和tasks[5] 可同时执行。' +
        '未被包含的任务默认串行执行。使用 run_subagents_parallel 工具并行执行这些组。',
      required: false,
    },
  ],

  execute: async (args: Record<string, unknown>): Promise<string> => {
    const rawTasks = args.tasks;
    const tasks: string[] = Array.isArray(rawTasks)
      ? rawTasks.map((t) => String(t))
      : typeof rawTasks === 'string'
      ? [rawTasks]
      : [];

    if (tasks.length === 0) return '错误：tasks 不能为空数组';

    // Parse parallel groups
    const rawParallelGroups = args.parallel_groups;
    const parallelGroups: number[][] = Array.isArray(rawParallelGroups)
      ? (rawParallelGroups as unknown[]).map((g) =>
          Array.isArray(g) ? (g as unknown[]).map((i) => Number(i)) : []
        )
      : [];

    // Build parallel group mapping: taskIdx → groupKey
    const taskGroupMap = new Map<number, string>();
    parallelGroups.forEach((group, gi) => {
      group.forEach((taskIdx) => {
        if (taskIdx >= 0 && taskIdx < tasks.length) {
          taskGroupMap.set(taskIdx, `pg-${gi}`);
        }
      });
    });

    const { clearTodos, addTodo } = useSubagentStore.getState();
    clearTodos();

    // D-03: Reset tracking for new plan
    activePlanTaskIds.clear();
    activePlanVersion++;

    const assigned: Array<{ id: string; label: string; parallelGroup?: string }> = [];
    tasks.forEach((label, idx) => {
      const id = `task_${idx}`;
      const parallelGroup = taskGroupMap.get(idx);
      addTodo({
        id,
        label: label.slice(0, 80),
        status: 'pending',
        parallelGroup,
        stepIndex: idx + 1,
      });
      assigned.push({ id, label, ...(parallelGroup ? { parallelGroup } : {}) });
      activePlanTaskIds.add(id);
    });

    // Mark the first task(s) as running immediately
    // If the first task is part of a parallel group, mark all group members running
    useSubagentStore.getState().updateTodo('task_0', 'running');
    const firstGroup = taskGroupMap.get(0);
    if (firstGroup) {
      tasks.forEach((_label, idx) => {
        if (idx !== 0 && taskGroupMap.get(idx) === firstGroup) {
          useSubagentStore.getState().updateTodo(`task_${idx}`, 'running');
        }
      });
    }

    const parallelHint = parallelGroups.length > 0
      ? ` 并行组：${parallelGroups.map((g, i) => `G${i + 1}=[${g.map((idx) => `task_${idx}`).join(',')}]`).join(', ')}。并行组内任务请用 run_subagents_parallel 工具同时执行。`
      : '';

    return JSON.stringify({
      ok: true,
      tasks: assigned,
      constraint: `所有 ${tasks.length} 个步骤都必须按序执行后调用 complete_task 标记完成，不可跳过任何步骤。${parallelHint}`,
    });
  },
  isConcurrencySafe: () => false,
  getActivityDescription: (args) => {
    const tasks = Array.isArray(args.tasks) ? args.tasks as Array<unknown> : [];
    return `规划任务: ${tasks.length} 个步骤`;
  },
};
