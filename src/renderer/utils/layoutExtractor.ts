/**
 * layoutExtractor — 从 iframe DOM 提取卡片列表及其当前布局位置
 */
import type { CardLayoutDescriptor } from '../types/layout';

export function extractCardsFromIframe(iframeDoc: Document): CardLayoutDescriptor[] {
  const cards: CardLayoutDescriptor[] = [];

  // 1. 提取 KPI 卡片
  iframeDoc.querySelectorAll('.grid-kpi > .card, .zone-kpi > .card').forEach((el, i) => {
    cards.push({
      cardId: el.id || `kpi-${i}`,
      label: el.querySelector('h3, .kpi-label, .stat-label')?.textContent?.trim() || `KPI ${i + 1}`,
      type: 'kpi',
      colStart: -1,
      colSpan: 1,
      rowSpan: 1,
      minHeight: 80,
    });
  });

  // 2. 提取筛选控件卡片
  iframeDoc.querySelectorAll('.zone-filter > .card, .filter-bar').forEach((el, i) => {
    cards.push({
      cardId: el.id || `filter-${i}`,
      label: '筛选控件',
      type: 'filter',
      colStart: -1,
      colSpan: -1,
      rowSpan: 1,
      minHeight: 60,
    });
  });

  // 3. 提取图表和表格卡片
  iframeDoc.querySelectorAll('.grid-charts > .card, .zone-content > .card').forEach((el, i) => {
    const hasTable = !!el.querySelector('table');
    cards.push({
      cardId: el.id || `card-${i}`,
      label: el.querySelector('h3, h4, .card-title')?.textContent?.trim() || `卡片 ${i + 1}`,
      type: hasTable ? 'table' : 'chart',
      colStart: -1,
      colSpan: hasTable ? -1 : 1,
      rowSpan: 'auto',
      minHeight: hasTable ? 200 : 260,
    });
  });

  return cards;
}

/**
 * 从当前布局 CSS 推断网格列数
 */
export function detectGridColumns(iframeDoc: Document): number {
  const gridEl = iframeDoc.querySelector('.grid-charts, .zone-content');
  if (!gridEl) return 2;
  const style = iframeDoc.defaultView?.getComputedStyle(gridEl);
  if (!style) return 2;
  const cols = style.gridTemplateColumns;
  if (!cols) return 2;
  // Count the number of tracks
  return cols.split(/\s+/).filter((s) => s && s !== 'none').length || 2;
}
