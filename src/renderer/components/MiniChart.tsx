/**
 * MiniChart.tsx — Lightweight inline SVG chart components for chat messages.
 * Used by the show_mini_chart agent tool to render sparklines, bar charts,
 * pie charts, and metric cards directly inside the chat bubble.
 */

import React from 'react';

// ─── Shared Helpers ────────────────────────────────────────────────────────

const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

function minMax(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max };
}

function normalize(v: number, min: number, max: number, height: number): number {
  if (max === min) return height / 2;
  return height - ((v - min) / (max - min)) * height;
}

// ─── Sparkline ─────────────────────────────────────────────────────────────

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Show area fill under the line */
  fill?: boolean;
  label?: string;
  unit?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 160,
  height = 48,
  color = '#3b82f6',
  fill = true,
  label,
  unit,
}) => {
  if (!data || data.length < 2) return null;

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const { min, max } = minMax(data);
  const step = w / (data.length - 1);

  const points = data.map((v, i) => ({
    x: pad + i * step,
    y: pad + normalize(v, min, max, h),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(pad + h).toFixed(1)} L${pad},${(pad + h).toFixed(1)} Z`;

  const last = data[data.length - 1];
  const delta = data.length >= 2 ? last - data[data.length - 2] : 0;
  const trend = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const trendColor = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#6b7280';

  return (
    <div className="inline-flex flex-col gap-0.5">
      {label && (
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium truncate max-w-[160px]">{label}</span>
      )}
      <div className="flex items-center gap-2">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
          {fill && (
            <path d={areaPath} fill={color} fillOpacity="0.12" />
          )}
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* Last point dot */}
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} />
        </svg>
        <div className="flex flex-col items-start gap-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums leading-tight">
            {last.toLocaleString()}{unit ? <span className="text-[10px] text-gray-400 ml-0.5 font-normal">{unit}</span> : null}
          </span>
          <span className="text-[11px] font-medium tabular-nums leading-tight" style={{ color: trendColor }}>{trend}</span>
        </div>
      </div>
    </div>
  );
};

// ─── MiniBarChart ──────────────────────────────────────────────────────────

export interface MiniBarChartProps {
  labels: string[];
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  unit?: string;
  title?: string;
}

export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  labels,
  values,
  width = 200,
  height = 80,
  color = '#3b82f6',
  unit,
  title,
}) => {
  if (!values || values.length === 0) return null;
  const n = Math.min(labels.length, values.length);
  const padX = 4;
  const padTop = 4;
  const padBottom = 20; // space for labels
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const { min: rawMin, max } = minMax(values.slice(0, n));
  const min = Math.min(0, rawMin); // always start from 0 if all positives
  const barW = (innerW / n) * 0.65;
  const gap = (innerW / n) * 0.35;

  return (
    <div className="inline-flex flex-col gap-0.5">
      {title && <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium truncate">{title}</span>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
        {Array.from({ length: n }).map((_, i) => {
          const x = padX + i * (innerW / n) + gap / 2;
          const barH = max === min ? innerH * 0.5 : ((values[i] - min) / (max - min)) * innerH;
          const y = padTop + innerH - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx="2" fill={color} fillOpacity="0.85" />
              <text
                x={x + barW / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize="9"
                fill="currentColor"
                className="text-gray-400"
                style={{ fill: '#9ca3af' }}
              >
                {labels[i].length > 5 ? labels[i].slice(0, 5) + '…' : labels[i]}
              </text>
            </g>
          );
        })}
        {/* value labels on top */}
        {Array.from({ length: n }).map((_, i) => {
          const x = padX + i * (innerW / n) + gap / 2;
          const barH = max === min ? innerH * 0.5 : ((values[i] - min) / (max - min)) * innerH;
          const y = padTop + innerH - barH;
          return (
            <text key={`lbl-${i}`} x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="8" style={{ fill: color }}>
              {values[i] >= 1000 ? (values[i] / 1000).toFixed(1) + 'k' : values[i]}
            </text>
          );
        })}
      </svg>
      {unit && <span className="text-[10px] text-gray-400 text-right">{unit}</span>}
    </div>
  );
};

// ─── MiniPieChart ──────────────────────────────────────────────────────────

export interface MiniPieChartProps {
  labels: string[];
  values: number[];
  size?: number;
  title?: string;
}

export const MiniPieChart: React.FC<MiniPieChartProps> = ({
  labels,
  values,
  size = 80,
  title,
}) => {
  if (!values || values.length === 0) return null;
  const n = Math.min(labels.length, values.length);
  const total = values.slice(0, n).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  let cumAngle = -Math.PI / 2;
  const slices = Array.from({ length: n }).map((_, i) => {
    const angle = (values[i] / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return {
      d: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
      color: palette[i % palette.length],
      label: labels[i],
      pct: ((values[i] / total) * 100).toFixed(1),
    };
  });

  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex flex-col gap-0.5">
        {title && <span className="text-[11px] text-gray-400 font-medium mb-1">{title}</span>}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} fillOpacity="0.9" stroke="white" strokeWidth="0.5" />
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-[80px]">{s.label}</span>
            <span className="text-[11px] text-gray-400 tabular-nums ml-auto pl-1">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MetricCard ────────────────────────────────────────────────────────────

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;     // change value (can be negative)
  deltaLabel?: string;
  color?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  color = '#3b82f6',
}) => {
  const isDeltaPositive = delta !== undefined && delta >= 0;
  const deltaColor = delta === undefined ? undefined : isDeltaPositive ? '#10b981' : '#ef4444';
  const deltaSymbol = delta !== undefined ? (delta >= 0 ? '▲' : '▼') : null;

  return (
    <div
      className="inline-flex flex-col gap-0.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium truncate max-w-[120px]">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-tight">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {unit && <span className="text-[11px] text-gray-400 font-normal">{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: deltaColor }}>
            {deltaSymbol} {Math.abs(delta).toLocaleString()}
          </span>
          {deltaLabel && (
            <span className="text-[11px] text-gray-400">{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── MiniTableChart ────────────────────────────────────────────────────────
// Renders a compact table with optional sparkline per row

export interface MiniTableChartProps {
  columns: string[];
  rows: (string | number)[][];
  title?: string;
  maxRows?: number;
}

export const MiniTableChart: React.FC<MiniTableChartProps> = ({
  columns,
  rows,
  title,
  maxRows = 8,
}) => {
  const visible = rows.slice(0, maxRows);
  return (
    <div className="inline-block">
      {title && <div className="text-[11px] text-gray-400 font-medium mb-1">{title}</div>}
      <table className="text-[11px] border-collapse">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="pr-3 pb-1 text-left text-gray-400 dark:text-gray-500 font-semibold whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, ri) => (
            <tr key={ri} className="even:bg-gray-50/50 dark:even:bg-gray-800/30">
              {row.map((cell, ci) => (
                <td key={ci} className="pr-3 py-0.5 text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
                  {typeof cell === 'number' ? cell.toLocaleString() : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className="text-[10px] text-gray-400 mt-1">还有 {rows.length - maxRows} 行…</div>
      )}
    </div>
  );
};

// ─── MiniChart dispatcher ──────────────────────────────────────────────────
// The main entry point called from MessageBubble when rendering tool results.

export interface MiniChartSpec {
  type: 'sparkline' | 'bar' | 'pie' | 'metric' | 'table';
  title?: string;
  // sparkline / bar / pie
  labels?: string[];
  values?: number[];
  // sparkline specific
  data?: number[];
  fill?: boolean;
  color?: string;
  unit?: string;
  // metric specific
  label?: string;
  value?: string | number;
  delta?: number;
  deltaLabel?: string;
  // table specific
  columns?: string[];
  rows?: (string | number)[][];
}

export const MiniChart: React.FC<{ spec: MiniChartSpec }> = ({ spec }) => {
  switch (spec.type) {
    case 'sparkline':
      return (
        <Sparkline
          data={spec.data ?? spec.values ?? []}
          label={spec.title ?? spec.label}
          unit={spec.unit}
          color={spec.color}
          fill={spec.fill !== false}
        />
      );
    case 'bar':
      return (
        <MiniBarChart
          labels={spec.labels ?? []}
          values={spec.values ?? []}
          title={spec.title}
          unit={spec.unit}
          color={spec.color}
        />
      );
    case 'pie':
      return (
        <MiniPieChart
          labels={spec.labels ?? []}
          values={spec.values ?? []}
          title={spec.title}
        />
      );
    case 'metric':
      return (
        <MetricCard
          label={spec.label ?? spec.title ?? ''}
          value={spec.value ?? 0}
          unit={spec.unit}
          delta={spec.delta}
          deltaLabel={spec.deltaLabel}
          color={spec.color}
        />
      );
    case 'table':
      return (
        <MiniTableChart
          columns={spec.columns ?? []}
          rows={spec.rows ?? []}
          title={spec.title}
        />
      );
    default:
      return null;
  }
};
