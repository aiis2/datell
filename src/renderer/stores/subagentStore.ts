import { create } from 'zustand';

export interface AgentTodo {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  /** Optional parallel group key — tasks with same group run simultaneously */
  parallelGroup?: string;
  /** Optional step index within plan (1-based) */
  stepIndex?: number;
}

interface SubagentState {
  /** Map of callId → progress log lines */
  logs: Record<string, string[]>;
  addLog: (callId: string, text: string) => void;
  clearLogs: (callId: string) => void;
  /** Agent todo list for the current streaming session */
  todos: AgentTodo[];
  addTodo: (todo: AgentTodo) => void;
  updateTodo: (id: string, status: AgentTodo['status']) => void;
  clearTodos: () => void;
}

export const useSubagentStore = create<SubagentState>((set) => ({
  logs: {},
  addLog: (callId, text) =>
    set((s) => ({
      logs: {
        ...s.logs,
        [callId]: [...(s.logs[callId] ?? []), text],
      },
    })),
  clearLogs: (callId) =>
    set((s) => {
      const next = { ...s.logs };
      delete next[callId];
      return { logs: next };
    }),
  todos: [],
  addTodo: (todo) => set((s) => ({ todos: [...s.todos, todo] })),
  updateTodo: (id, status) =>
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, status } : t)) })),
  clearTodos: () => set({ todos: [] }),
}));

