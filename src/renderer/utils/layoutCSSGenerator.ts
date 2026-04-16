/**
 * layoutCSSGenerator — 将 CustomLayout 转换为 CSS 文本
 */
import type { CardLayoutDescriptor, CustomLayout } from '../types/layout';

/**
 * 从 CustomLayout 生成可注入 iframe 的 CSS
 */
export function generateLayoutCSS(layout: CustomLayout): string {
  const lines: string[] = [];
  lines.push(`/* 自定义布局: ${layout.name} — 自动生成 */`);
  lines.push(`:root {`);
  lines.push(`  --layout-chart-cols: repeat(${layout.gridColumns}, 1fr);`);
  if (typeof layout.gridRowHeight === 'number') {
    lines.push(`  --layout-chart-max-height: ${layout.gridRowHeight}px;`);
  }
  lines.push(`}`);
  lines.push(``);
  lines.push(`.grid-charts, .zone-content {`);
  lines.push(`  grid-template-columns: repeat(${layout.gridColumns}, 1fr) !important;`);
  lines.push(`}`);
  lines.push(``);

  // Per-card positioning
  layout.cards.forEach((card, index) => {
    const selector = buildCardSelector(card, index);
    const rules = buildCardRules(card, layout.gridColumns);
    if (rules.length > 0) {
      lines.push(`${selector} {`);
      rules.forEach((r) => lines.push(`  ${r}`));
      lines.push(`}`);
      lines.push(``);
    }
  });

  return lines.join('\n');
}

/**
 * 从当前编辑状态生成实时预览 CSS（用于每次拖拽/resize后注入）
 */
export function generatePreviewCSS(
  cards: CardLayoutDescriptor[],
  gridColumns: number,
): string {
  const lines: string[] = [];
  lines.push(`/* 编辑模式实时预览 */`);
  lines.push(`.grid-charts, .zone-content {`);
  lines.push(`  grid-template-columns: repeat(${gridColumns}, 1fr) !important;`);
  lines.push(`}`);
  lines.push(``);

  cards.forEach((card, index) => {
    const selector = buildCardSelector(card, index);
    const rules = buildCardRules(card, gridColumns);
    if (rules.length > 0) {
      lines.push(`${selector} { ${rules.join(' ')} }`);
    }
  });

  return lines.join('\n');
}

function buildCardSelector(card: CardLayoutDescriptor, index: number): string {
  if (card.cardId.startsWith('kpi-')) {
    const n = parseInt(card.cardId.split('-')[1], 10);
    return `.grid-kpi > .card:nth-child(${n + 1}), .zone-kpi > .card:nth-child(${n + 1})`;
  }
  if (card.cardId.startsWith('filter-')) {
    return `.zone-filter > .card:nth-child(${parseInt(card.cardId.split('-')[1], 10) + 1})`;
  }
  // Prefer ID selector, fallback to nth-child
  const escapedId = CSS.escape(card.cardId);
  const nth = index + 1;
  return `#${escapedId}, .grid-charts > .card:nth-child(${nth}), .zone-content > .card:nth-child(${nth})`;
}

function buildCardRules(card: CardLayoutDescriptor, gridColumns: number): string[] {
  const rules: string[] = [];
  if (card.colSpan === -1 || card.colSpan >= gridColumns) {
    rules.push('grid-column: 1 / -1 !important;');
  } else if (card.colSpan > 1) {
    rules.push(`grid-column: span ${card.colSpan} !important;`);
  }
  if (typeof card.rowSpan === 'number' && card.rowSpan > 1) {
    rules.push(`grid-row: span ${card.rowSpan} !important;`);
  }
  return rules;
}
