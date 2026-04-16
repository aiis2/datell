/**
 * Tech-13: 布局编辑模式类型定义
 */

/** 单个卡片在网格中的布局描述 */
export interface CardLayoutDescriptor {
  /** 卡片的 DOM id 或 data-card-id */
  cardId: string;
  /** 卡片标题（用于 UI 显示） */
  label: string;
  /** 卡片类型：kpi / chart / table / filter / custom */
  type: 'kpi' | 'chart' | 'table' | 'filter' | 'custom';
  /** 网格列起始位置 (1-based, -1 = auto) */
  colStart: number;
  /** 网格列跨度 (-1 = full width) */
  colSpan: number;
  /** 网格行跨度（'auto' = 自适应高度） */
  rowSpan: number | 'auto';
  /** 最小高度 (px) */
  minHeight: number;
}

/** 完整的用户自定义布局 */
export interface CustomLayout {
  id: string;
  name: string;
  createdAt: number;
  /** 网格总列数 */
  gridColumns: number;
  /** 网格行高 (px)，'auto' = 自适应 */
  gridRowHeight: number | 'auto';
  /** 各卡片布局描述，按视觉排列顺序 */
  cards: CardLayoutDescriptor[];
  /** 源布局 ID（null = 从零开始） */
  baseLayoutId: string | null;
}
