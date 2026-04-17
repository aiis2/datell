/**
 * KpiCard.tsx
 *
 * KPI card components that embed MiniChart SVGs.
 * These React components drive the live preview inside SettingsModal → 卡片组件.
 * They are also used to generate the corresponding HTML string (via renderCardToHtml)
 * which can be copied and pasted into reports.
 */

import React from 'react';
import {
  SparklineMiniChart,
  BarMiniChart,
  PieMiniChart,
  BulletMiniChart,
  HeatmapRowMiniChart,
  WaterfallMiniChart,
} from './MiniChartTemplates';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KpiChartType = 'sparkline' | 'bar' | 'pie' | 'bullet' | 'heatmap' | 'waterfall' | 'none';

export interface KpiCardData {
  title: string;
  value: string | number;
  unit?: string;
  /** Optional subtitle / secondary label */
  subtitle?: string;
  /** Percentage change (positive = up, negative = down) */
  trend?: number;
  trendLabel?: string;
  /** Lucide icon name (used in SVG sprite: /vendor/icons.svg#icon-<name>) */
  icon?: string;
  chartType?: KpiChartType;
  /** Raw data points for the mini chart */
  chartData?: number[];
  /** Primary color override (defaults to var(--palette-primary)) */
  primaryColor?: string;
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

const TrendBadge: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const isUp = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none ${
        isUp
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
          : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
      }`}
    >
      {isUp ? '↑' : '↓'}
      {Math.abs(value).toFixed(1)}%
      {label && <span className="font-normal ml-0.5 opacity-70">{label}</span>}
    </span>
  );
};

// ─── Mini chart dispatcher ────────────────────────────────────────────────────

const MiniChartInCard: React.FC<{
  chartType: KpiChartType;
  chartData: number[];
  color: string;
  width?: number;
  height?: number;
}> = ({ chartType, chartData, color, width = 120, height = 36 }) => {
  switch (chartType) {
    case 'sparkline':
      return <SparklineMiniChart data={chartData} width={width} height={height} color={color} filled dot />;
    case 'bar':
      return <BarMiniChart data={chartData} width={width} height={height} color={color} />;
    case 'pie':
      return <PieMiniChart data={chartData} width={Math.min(width, 40)} height={Math.min(height, 40)} />;
    case 'bullet':
      return (
        <BulletMiniChart
          value={chartData[0] ?? 0}
          target={chartData[1]}
          width={width}
          height={height * 0.6}
          color={color}
        />
      );
    case 'heatmap':
      return <HeatmapRowMiniChart data={chartData} width={width} height={height * 0.5} color={color} />;
    case 'waterfall':
      return <WaterfallMiniChart data={chartData} width={width} height={height} />;
    default:
      return null;
  }
};

// ─── Card variants ────────────────────────────────────────────────────────────

// 1. Basic KPI card
export const KpiBasicCard: React.FC<KpiCardData> = ({ title, value, unit }) => (
  <div className="flex flex-col gap-1 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-none">{title}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
  </div>
);

// 2. KPI with trend badge + icon
export const KpiWithTrendCard: React.FC<KpiCardData> = ({
  title, value, unit, trend, trendLabel, icon,
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      {icon && (
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${primaryColor}18` }}>
          <svg width="15" height="15" style={{ color: primaryColor }}>
            <use href={`/vendor/icons.svg#icon-${icon}`} />
          </svg>
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
    {trend !== undefined && <TrendBadge value={trend} label={trendLabel} />}
  </div>
);

// 3. KPI with sparkline
export const KpiSparklineCard: React.FC<KpiCardData> = ({
  title, value, unit, trend, trendLabel,
  chartData = [10, 25, 18, 32, 27, 38, 45],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      {trend !== undefined && <TrendBadge value={trend} label={trendLabel} />}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
    <div className="w-full mt-1">
      <SparklineMiniChart data={chartData} width={140} height={36} color={primaryColor} filled dot />
    </div>
  </div>
);

// 4. KPI with mini bar chart
export const KpiBarCard: React.FC<KpiCardData> = ({
  title, value, unit, trend, trendLabel,
  chartData = [6, 8, 5, 9, 7, 10, 8],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      {trend !== undefined && <TrendBadge value={trend} label={trendLabel} />}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
    <div className="w-full mt-1">
      <BarMiniChart data={chartData} width={140} height={36} color={primaryColor} />
    </div>
  </div>
);

// 5. KPI comparison: this period vs last period / target
export const KpiComparisonCard: React.FC<KpiCardData & { compareValue?: string | number; compareLabel?: string }> = ({
  title, value, unit, trend,
  compareValue, compareLabel = '上期',
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
    {(compareValue !== undefined || trend !== undefined) && (
      <div className="flex items-center justify-between text-xs text-gray-400">
        {compareValue !== undefined && (
          <span>{compareLabel}: <span className="font-medium text-gray-500">{compareValue}{unit}</span></span>
        )}
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
    )}
    {compareValue !== undefined && (
      <BulletMiniChart
        value={Number(value) / (Number(compareValue) * 1.3)}
        target={Number(compareValue) / (Number(compareValue) * 1.3)}
        width={140}
        height={14}
        color={primaryColor}
      />
    )}
  </div>
);

// 6. Metric gauge (donut) card
export const MetricGaugeCard: React.FC<KpiCardData> = ({
  title, value, unit, subtitle,
  chartData = [72, 28],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <PieMiniChart data={chartData} width={52} height={52} colors={[primaryColor, '#e2e8f0']} innerRadiusFrac={0.6} />
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{title}</span>
      <span className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">
        {value}{unit}
      </span>
      <span className="text-xs text-gray-400">{subtitle ?? '目标达成率'}</span>
    </div>
  </div>
);

// 7. Stat card with large icon
export const StatCardIcon: React.FC<KpiCardData> = ({
  title, value, unit, trend, icon,
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <span
      className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
      style={{ background: `${primaryColor}1a` }}
    >
      <svg width="20" height="20" style={{ color: primaryColor, fill: primaryColor }}>
        <use href={`/vendor/icons.svg#icon-${icon || 'bar-chart-2'}`} />
      </svg>
    </span>
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{title}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {trend !== undefined && <TrendBadge value={trend} />}
    </div>
  </div>
);

// 8. Progress card
export const ProgressCard: React.FC<KpiCardData & { progress?: number; progressLabel?: string }> = ({
  title, value, unit, progress = 0.68, progressLabel,
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[180px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      <span className="text-xs font-semibold" style={{ color: primaryColor }}>{Math.round(progress * 100)}%</span>
    </div>
    <BulletMiniChart value={progress} width={180} height={14} color={primaryColor} />
    <div className="flex items-baseline gap-1 justify-between">
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {progressLabel && <span className="text-xs text-gray-400">{progressLabel}</span>}
    </div>
  </div>
);

// 9. Rank list card
export const RankListCard: React.FC<{
  title: string;
  items: Array<{ label: string; value: string | number; unit?: string; pct?: number }>;
  primaryColor?: string;
}> = ({
  title,
  items = [],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[200px]">
    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</span>
    <div className="space-y-1.5">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0"
            style={{ background: i < 3 ? primaryColor : '#e2e8f0', color: i < 3 ? 'white' : '#64748b' }}
          >
            {i + 1}
          </span>
          <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{item.label}</span>
          {item.pct !== undefined && (
            <div className="w-16">
              <BulletMiniChart value={item.pct} width={64} height={8} color={primaryColor} />
            </div>
          )}
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
            {item.value}{item.unit}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// 10. Alert / status card
export type AlertLevel = 'success' | 'warning' | 'danger' | 'info';

export const AlertCard: React.FC<{
  title: string;
  message: string;
  level?: AlertLevel;
  value?: string | number;
  unit?: string;
}> = ({ title, message, level = 'info', value, unit }) => {
  const cfg: Record<AlertLevel, { bg: string; border: string; text: string; dot: string }> = {
    success: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
    warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
    danger: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-700', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
    info: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  };
  const c = cfg[level];
  return (
    <div className={`flex flex-col gap-1.5 p-4 rounded-xl border ${c.bg} ${c.border} shadow-sm min-w-[160px]`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
        <span className={`text-xs font-semibold ${c.text}`}>{title}</span>
        {value !== undefined && (
          <span className={`ml-auto text-sm font-bold ${c.text}`}>{value}{unit}</span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{message}</p>
    </div>
  );
};

// 11. Heatmap activity card
export const HeatmapCard: React.FC<KpiCardData> = ({
  title, value, unit,
  chartData = [0.1, 0.3, 0.8, 0.5, 0.9, 0.4, 0.7, 0.2, 0.6, 0.85, 0.3, 0.95, 0.45, 0.7],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{value}</span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
    <HeatmapRowMiniChart data={chartData} width={140} height={16} color={primaryColor} />
    <span className="text-[10px] text-gray-400">近 {chartData.length} 日活跃度</span>
  </div>
);

// 12. Waterfall card
export const WaterfallCard: React.FC<KpiCardData> = ({
  title, value, unit,
  chartData = [100, 23, -15, 12, -8, 18],
  primaryColor = 'var(--palette-primary, #3b82f6)',
}) => (
  <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[160px]">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</span>
      {unit && <span className="text-sm text-gray-400">{unit}</span>}
    </div>
    <WaterfallMiniChart data={chartData} width={140} height={40} positiveColor={primaryColor} />
  </div>
);

// ─── Export all card variants for the component library ───────────────────────

export const CARD_COMPONENTS = {
  KpiBasicCard,
  KpiWithTrendCard,
  KpiSparklineCard,
  KpiBarCard,
  KpiComparisonCard,
  MetricGaugeCard,
  StatCardIcon,
  ProgressCard,
  AlertCard,
  HeatmapCard,
  WaterfallCard,
  RankListCard,
} as const;

export type CardComponentName = keyof typeof CARD_COMPONENTS;
