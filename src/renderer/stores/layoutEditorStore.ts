/**
 * layoutEditorStore — Zustand store for Tech-13 report edit mode
 */
import { create } from 'zustand';
import type { CardLayoutDescriptor, CustomLayout } from '../types/layout';

interface LayoutEditorState {
  /** 是否处于编辑模式 */
  editing: boolean;
  /** 当前编辑中的卡片列表 */
  cards: CardLayoutDescriptor[];
  /** 网格总列数 */
  gridColumns: number;
  /** 正在拖拽的卡片 ID */
  activeCardId: string | null;
  /** 编辑前的快照（用于「取消」恢复） */
  snapshot: CardLayoutDescriptor[] | null;

  enterEditMode: (cards: CardLayoutDescriptor[], gridCols: number) => void;
  exitEditMode: () => void;
  cancelEdit: () => void;
  moveCard: (fromIndex: number, toIndex: number) => void;
  resizeCard: (cardId: string, colSpan: number, rowSpan: number | 'auto') => void;
  setActiveCard: (id: string | null) => void;
}

export const useLayoutEditorStore = create<LayoutEditorState>((set, get) => ({
  editing: false,
  cards: [],
  gridColumns: 2,
  activeCardId: null,
  snapshot: null,

  enterEditMode: (cards, gridCols) =>
    set({
      editing: true,
      cards: cards.map((c) => ({ ...c })),
      gridColumns: gridCols,
      snapshot: cards.map((c) => ({ ...c })),
      activeCardId: null,
    }),

  exitEditMode: () =>
    set({ editing: false, cards: [], snapshot: null, activeCardId: null }),

  cancelEdit: () => {
    const { snapshot } = get();
    set({
      editing: false,
      cards: snapshot ? snapshot.map((c) => ({ ...c })) : [],
      snapshot: null,
      activeCardId: null,
    });
  },

  moveCard: (fromIndex, toIndex) =>
    set((state) => {
      const next = [...state.cards];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { cards: next };
    }),

  resizeCard: (cardId, colSpan, rowSpan) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.cardId === cardId ? { ...c, colSpan, rowSpan } : c,
      ),
    })),

  setActiveCard: (id) => set({ activeCardId: id }),
}));
