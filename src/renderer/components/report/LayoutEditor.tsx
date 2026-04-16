/**
 * LayoutEditor — Tech-13 编辑模式主组件
 * 覆盖在 iframe 上方，提供拖拽排序 + 调整尺寸功能
 */
import React, { useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Maximize2, Minimize2, Table2, BarChart2, CreditCard, Filter } from 'lucide-react';
import { useLayoutEditorStore } from '../../stores/layoutEditorStore';
import { generatePreviewCSS } from '../../utils/layoutCSSGenerator';
import type { CardLayoutDescriptor } from '../../types/layout';

interface Props {
  /** Ref to shell iframe for CSS injection */
  shellRef: React.RefObject<HTMLIFrameElement | null>;
}

/** Icon for each card type */
const typeIcons: Record<string, React.ReactNode> = {
  kpi: <CreditCard size={14} />,
  chart: <BarChart2 size={14} />,
  table: <Table2 size={14} />,
  filter: <Filter size={14} />,
  custom: <BarChart2 size={14} />,
};

/** Color accent per card type */
const typeColors: Record<string, string> = {
  kpi: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
  chart: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  table: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
  filter: 'border-purple-400 bg-purple-50 dark:bg-purple-900/20',
  custom: 'border-gray-400 bg-gray-50 dark:bg-gray-700/30',
};

// ─── Sortable Card ───────────────────────────────────────────

interface SortableCardProps {
  card: CardLayoutDescriptor;
  gridColumns: number;
  onResize: (cardId: string, colSpan: number) => void;
}

const SortableCard: React.FC<SortableCardProps> = ({ card, gridColumns, onResize }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.cardId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: card.colSpan === -1 || card.colSpan >= gridColumns
      ? '1 / -1'
      : `span ${Math.min(card.colSpan, gridColumns)}`,
  };

  const handleWider = useCallback(() => {
    const next = card.colSpan === -1 ? 1 : Math.min(card.colSpan + 1, gridColumns);
    onResize(card.cardId, next === gridColumns ? -1 : next);
  }, [card.cardId, card.colSpan, gridColumns, onResize]);

  const handleNarrower = useCallback(() => {
    if (card.type === 'table') return; // Table stays full width
    const current = card.colSpan === -1 ? gridColumns : card.colSpan;
    const next = Math.max(1, current - 1);
    onResize(card.cardId, next);
  }, [card.cardId, card.colSpan, card.type, gridColumns, onResize]);

  const effectiveSpan = card.colSpan === -1 ? gridColumns : card.colSpan;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-2 border-dashed rounded-xl p-3 flex items-center gap-2 cursor-move select-none
        ${typeColors[card.type] || typeColors.custom}
        ${isDragging ? 'ring-2 ring-blue-400 shadow-lg z-10' : 'hover:shadow-md'}
        transition-shadow`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing"
        title="拖拽排序"
      >
        <GripVertical size={16} />
      </button>

      {/* Card info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {typeIcons[card.type]}
          <span className="text-sm font-medium truncate">{card.label}</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {card.type === 'table' ? '全宽' : `${effectiveSpan}/${gridColumns} 列`}
        </div>
      </div>

      {/* Resize controls */}
      {card.type !== 'table' && card.type !== 'filter' && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleNarrower}
            disabled={effectiveSpan <= 1}
            className="w-6 h-6 flex items-center justify-center rounded bg-white/70 dark:bg-gray-700/70 text-xs hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="缩小"
          >
            <Minimize2 size={12} />
          </button>
          <button
            onClick={handleWider}
            disabled={card.colSpan === -1}
            className="w-6 h-6 flex items-center justify-center rounded bg-white/70 dark:bg-gray-700/70 text-xs hover:bg-white dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="放大"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main LayoutEditor ───────────────────────────────────────

const LayoutEditor: React.FC<Props> = ({ shellRef }) => {
  const { cards, gridColumns, editing, resizeCard } = useLayoutEditorStore();
  const store = useLayoutEditorStore;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const injectCSS = useCallback(
    (updatedCards: CardLayoutDescriptor[]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const css = generatePreviewCSS(updatedCards, gridColumns);
        shellRef.current?.contentWindow?.postMessage(
          { type: 'inject-custom-css', css },
          '*',
        );
      }, 80);
    },
    [gridColumns, shellRef],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const currentCards = store.getState().cards;
      const oldIndex = currentCards.findIndex((c) => c.cardId === active.id);
      const newIndex = currentCards.findIndex((c) => c.cardId === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      store.getState().moveCard(oldIndex, newIndex);
      injectCSS(store.getState().cards);
    },
    [store, injectCSS],
  );

  const handleResize = useCallback(
    (cardId: string, colSpan: number) => {
      resizeCard(cardId, colSpan, 'auto');
      injectCSS(store.getState().cards);
    },
    [resizeCard, store, injectCSS],
  );

  if (!editing || cards.length === 0) return null;

  return (
    <div className="absolute inset-0 z-20 bg-white/95 dark:bg-gray-900/95 overflow-auto p-4 backdrop-blur-sm">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.cardId)} strategy={rectSortingStrategy}>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
          >
            {cards.map((card) => (
              <SortableCard
                key={card.cardId}
                card={card}
                gridColumns={gridColumns}
                onResize={handleResize}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default LayoutEditor;
