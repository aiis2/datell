/**
 * MiniChartTemplates.tsx
 *
 * Pure-SVG inline mini chart components for use inside KPI cards and report previews.
 * No external dependencies — renders fully offline and in exported HTML bundles.
 *
 * Components exported:
 *   SparklineMiniChart   – polyline trend (sparkline)
 *   BarMiniChart         – vertical mini bar chart
 *   HBarMiniChart        – horizontal mini bar chart
 *   PieMiniChart         – donut / pie chart
 *   BulletMiniChart      – bullet (progress vs target) chart
 *   HeatmapRowMiniChart  – single-row heat map
 *   WaterfallMiniChart   – waterfall chart (up/down bars)
 *
 * All components accept an optional `color` prop that defaults to
 * `var(--palette-primary, #3b82f6)`.
 */

import React from 'react';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function normalise(data: number[]): number[] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v) => (v - min) / range);
}

/** Scale an array of 0-1 normalised values to [lo, hi] (SVG coords are top-down) */
function scaleY(norm: number[], hi: number, lo: number): number[] {
  return norm.map((v) => hi - v * (hi - lo));
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

export interface SparklineProps {
  data: number[];
  /** SVG element width */
  width?: number;
  /** SVG element height */
  height?: number;
  /** Stroke color (CSS value or var()) */
  color?: string;
  /** Fill area under the curve */
  filled?: boolean;
  /** Show an endpoint dot */
  dot?: boolean;
  strokeWidth?: number;
  className?: string;
}

export const SparklineMiniChart: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 40,
  color = 'var(--palette-primary, #3b82f6)',
  filled = false,
  dot = true,
  strokeWidth = 2,
  className,
}) => {
  if (!data || data.length < 2) return null;
  const padY = strokeWidth + 3;
  const norm = normalise(data);
  const ys = scaleY(norm, height - padY, padY);
  const step = width / (data.length - 1);

  const points = ys.map((y, i) => `${i * step},${y}`).join(' ');
  const lastX = (data.length - 1) * step;
  const lastY = ys[ys.length - 1];

  const fillPath = filled
    ? `M0,${height} ` + ys.map((y, i) => `L${i * step},${y}`).join(' ') + ` L${lastX},${height} Z`
    : undefined;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      {filled && fillPath && (
        <path d={fillPath} fill={color} fillOpacity={0.12} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <circle cx={lastX} cy={lastY} r={strokeWidth + 1.5} fill={color} />
      )}
    </svg>
  );
};

// ─── Vertical Bar ─────────────────────────────────────────────────────────────

export interface BarMiniChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Color for the last / highlighted bar */
  highlightColor?: string;
  /** 0-based index to highlight (-1 = last) */
  highlightIndex?: number;
  barGap?: number;
  className?: string;
}

export const BarMiniChart: React.FC<BarMiniChartProps> = ({
  data,
  width = 120,
  height = 40,
  color = 'var(--palette-primary, #3b82f6)',
  highlightColor,
  highlightIndex = -1,
  barGap = 2,
  className,
}) => {
  if (!data || data.length === 0) return null;
  const hi = highlightIndex < 0 ? data.length - 1 : highlightIndex;
  const max = Math.max(...data, 0) || 1;
  const barW = (width - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * (height - 2));
        const x = i * (barW + barGap);
        const y = height - barH;
        const fill = i === hi ? (highlightColor ?? color) : color;
        return <rect key={i} x={x} y={y} width={barW} height={barH} rx={1} fill={fill} fillOpacity={i === hi ? 1 : 0.55} />;
      })}
    </svg>
  );
};

// ─── Horizontal Bar ───────────────────────────────────────────────────────────

export interface HBarMiniChartProps {
  /** [0, 1] progress values */
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  trackColor?: string;
  className?: string;
}

export const HBarMiniChart: React.FC<HBarMiniChartProps> = ({
  data,
  width = 120,
  height = 32,
  color = 'var(--palette-primary, #3b82f6)',
  trackColor = 'rgba(0,0,0,0.08)',
  className,
}) => {
  if (!data || data.length === 0) return null;
  const trackH = 6;
  const rowH = height / data.length;
  const barY = (rowH - trackH) / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {data.map((v, i) => {
        const pct = Math.min(1, Math.max(0, v));
        const y = i * rowH + barY;
        return (
          <g key={i}>
            <rect x={0} y={y} width={width} height={trackH} rx={trackH / 2} fill={trackColor} />
            <rect x={0} y={y} width={pct * width} height={trackH} rx={trackH / 2} fill={color} />
          </g>
        );
      })}
    </svg>
  );
};

// ─── Donut / Pie ──────────────────────────────────────────────────────────────

export interface PieMiniChartProps {
  /** values (sum will be normalised to 100%) */
  data: number[];
  width?: number;
  height?: number;
  /** array of colors; wraps if fewer than data.length */
  colors?: string[];
  /** 0 = full pie, >0 = donut hole radius fraction (0–0.8) */
  innerRadiusFrac?: number;
  className?: string;
}

export const PieMiniChart: React.FC<PieMiniChartProps> = ({
  data,
  width = 40,
  height = 40,
  colors,
  innerRadiusFrac = 0.55,
  className,
}) => {
  if (!data || data.length === 0) return null;

  const defaultColors = [
    'var(--palette-color-1, #3b82f6)',
    'var(--palette-color-2, #10b981)',
    'var(--palette-color-3, #f59e0b)',
    'var(--palette-color-4, #ef4444)',
    'var(--palette-color-5, #8b5cf6)',
  ];
  const palette = colors || defaultColors;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy) - 1;
  const innerR = r * Math.max(0, Math.min(0.8, innerRadiusFrac));

  const total = data.reduce((a, b) => a + b, 0) || 1;
  let startAngle = -Math.PI / 2;

  const slices = data.map((v, i) => {
    const angle = (v / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const d = innerR > 0
      ? `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${large},0 ${ix2},${iy2} Z`
      : `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
    const slice = { d, color: palette[i % palette.length] };
    startAngle = endAngle;
    return slice;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth="0.5" />
      ))}
    </svg>
  );
};

// ─── Bullet Chart ─────────────────────────────────────────────────────────────

export interface BulletMiniChartProps {
  /** actual value (0–1 ratio) */
  value: number;
  /** target value (0–1 ratio) */
  target?: number;
  width?: number;
  height?: number;
  color?: string;
  trackColor?: string;
  targetColor?: string;
  className?: string;
}

export const BulletMiniChart: React.FC<BulletMiniChartProps> = ({
  value,
  target,
  width = 120,
  height = 20,
  color = 'var(--palette-primary, #3b82f6)',
  trackColor = 'rgba(0,0,0,0.08)',
  targetColor = '#ef4444',
  className,
}) => {
  const trackH = 8;
  const y = (height - trackH) / 2;
  const pct = Math.min(1, Math.max(0, value));
  const tgt = target !== undefined ? Math.min(1, Math.max(0, target)) : undefined;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {/* track */}
      <rect x={0} y={y} width={width} height={trackH} rx={trackH / 2} fill={trackColor} />
      {/* fill */}
      <rect x={0} y={y} width={pct * width} height={trackH} rx={trackH / 2} fill={color} />
      {/* target marker */}
      {tgt !== undefined && (
        <rect x={tgt * width - 1} y={y - 2} width={2} height={trackH + 4} rx={1} fill={targetColor} />
      )}
    </svg>
  );
};

// ─── Heatmap Row ──────────────────────────────────────────────────────────────

export interface HeatmapRowProps {
  /** 0–1 activity values for each cell */
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Cell gap in px */
  gap?: number;
  className?: string;
}

export const HeatmapRowMiniChart: React.FC<HeatmapRowProps> = ({
  data,
  width = 120,
  height = 16,
  color = 'var(--palette-primary, #3b82f6)',
  gap = 1.5,
  className,
}) => {
  if (!data || data.length === 0) return null;
  const cellW = (width - gap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {data.map((v, i) => {
        const pct = Math.min(1, Math.max(0, v));
        const x = i * (cellW + gap);
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={cellW}
            height={height}
            rx={2}
            fill={color}
            fillOpacity={0.08 + pct * 0.92}
          />
        );
      })}
    </svg>
  );
};

// ─── Waterfall ────────────────────────────────────────────────────────────────

export interface WaterfallMiniChartProps {
  /** positive = income, negative = expense */
  data: number[];
  width?: number;
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
  totalColor?: string;
  /** last bar is shown as total */
  showTotal?: boolean;
  barGap?: number;
  className?: string;
}

export const WaterfallMiniChart: React.FC<WaterfallMiniChartProps> = ({
  data,
  width = 120,
  height = 40,
  positiveColor = 'var(--palette-primary, #3b82f6)',
  negativeColor = '#ef4444',
  totalColor = '#64748b',
  showTotal = false,
  barGap = 2,
  className,
}) => {
  if (!data || data.length === 0) return null;

  const n = data.length;
  const barW = (width - barGap * (n - 1)) / n;
  const pad = 3;

  // Running totals
  const floats: { y: number; h: number; isNeg: boolean; isTotal: boolean }[] = [];
  let cumulative = 0;
  let runningMax = 0;
  let runningMin = 0;

  const cumValues: number[] = [];
  let c = 0;
  for (let i = 0; i < n; i++) {
    c += data[i];
    cumValues.push(c);
    runningMax = Math.max(runningMax, c, 0);
    runningMin = Math.min(runningMin, c, 0);
  }

  const range = runningMax - runningMin || 1;
  cumulative = 0;

  for (let i = 0; i < n; i++) {
    const isTotal = showTotal && i === n - 1;
    const isNeg = data[i] < 0;
    const hi = ((runningMax - (isTotal ? 0 : cumulative)) / range) * (height - pad * 2) + pad;
    const barH = Math.max(2, (Math.abs(data[i]) / range) * (height - pad * 2));
    const y = isNeg ? hi : hi - barH;
    floats.push({ y, h: barH, isNeg, isTotal });
    if (!isTotal) cumulative += data[i];
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {data.map((_, i) => {
        const { y, h, isNeg, isTotal } = floats[i];
        const x = i * (barW + barGap);
        const fill = isTotal ? totalColor : isNeg ? negativeColor : positiveColor;
        return <rect key={i} x={x} y={y} width={barW} height={h} rx={1} fill={fill} fillOpacity={0.85} />;
      })}
    </svg>
  );
};
