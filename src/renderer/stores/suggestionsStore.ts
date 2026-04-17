/**
 * suggestionsStore.ts — Tech-10 Phase 1
 * Zustand store that manages AI-generated quick-action suggestions.
 * After each agent response, suggestions are parsed from the message and stored here.
 * UI components (QuickActionsBar — future Phase 2) read from this store.
 */
import { create } from 'zustand';

export interface Suggestion {
  id: string;
  label: string;
  /** Primary action type */
  action: 'filter:apply' | 'chart:focus' | 'layout:change' | 'kpi:add' | 'drill:down' | 'report:generate' | string;
  /** Optional payload passed to the action handler */
  payload?: Record<string, unknown>;
  /** Optional Tabler icon name (without "icon-" prefix) */
  icon?: string;
  /** Whether AI flags this as highly recommended */
  autoSelect?: boolean;
}

interface SuggestionsState {
  /** Current list of suggestions (max 6, refreshed each agent turn) */
  suggestions: Suggestion[];
  /** IDs of suggestions selected by the user */
  selected: Set<string>;
  /** Whether the bar is visible */
  visible: boolean;

  setSuggestions: (items: Suggestion[]) => void;
  clearSuggestions: () => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelected: () => void;
  setVisible: (v: boolean) => void;
}

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  suggestions: [],
  selected: new Set(),
  visible: false,

  setSuggestions: (items) => {
    const capped = items.slice(0, 6);
    const autoSelected = new Set(
      capped.filter((s) => s.autoSelect).map((s) => s.id)
    );
    set({ suggestions: capped, selected: autoSelected, visible: capped.length > 0 });
  },

  clearSuggestions: () => set({ suggestions: [], selected: new Set(), visible: false }),

  toggleSelected: (id) => {
    const { selected } = get();
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selected: next });
  },

  selectAll: () => {
    const { suggestions } = get();
    set({ selected: new Set(suggestions.map((s) => s.id)) });
  },

  clearSelected: () => set({ selected: new Set() }),

  setVisible: (v) => set({ visible: v }),
}));

/**
 * Parse suggestion chips from an AI assistant message text.
 * Looks for a JSON block in the message with format:
 *   <!-- suggestions: [...] -->
 * or a fenced code block ```json { "suggestions": [...] } ```
 *
 * Returns empty array if nothing found (non-throwing).
 */
export function parseSuggestionsFromMessage(text: string): Suggestion[] {
  if (!text) return [];

  // Pattern 1: HTML comment <!-- suggestions: [...] -->
  const commentMatch = text.match(/<!--\s*suggestions:\s*(\[[\s\S]*?\])\s*-->/i);
  if (commentMatch) {
    try {
      return JSON.parse(commentMatch[1]) as Suggestion[];
    } catch {
      // ignore parse error
    }
  }

  // Pattern 2: fenced JSON block with "suggestions" key
  const fenceMatch = text.match(/```(?:json)?\s*\{[\s\S]*?"suggestions"\s*:\s*(\[[\s\S]*?\])/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as Suggestion[];
    } catch {
      // ignore parse error
    }
  }

  return [];
}
