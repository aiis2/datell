/**
 * SvgLayoutPreview.tsx
 *
 * Renders a programmatic SVG wireframe for a given layout type.
 * Used in the Layout Templates tab to give users a visual preview of
 * the structure before selecting a layout.
 */

import React from 'react';
import type { LayoutPreviewType } from '../utils/layoutManifest';

/** Color constants for the wireframe */
const WF = {
  bg: '#f8fafc',
  card: '#e2e8f0',
  cardDark: '#cbd5e1',
  accent: '#3b82f6',
  block: '#dde4f0',
  text: '#94a3b8',
  line: '#cbd5e1',
  header: '#c7d7f4',
};

interface SvgWireframeProps {
  previewType: LayoutPreviewType;
  width?: number;
  height?: number;
}

/** Renders an SVG wireframe matching the layout's structure */
export const SvgWireframe: React.FC<SvgWireframeProps> = ({
  previewType,
  width = 240,
  height = 160,
}) => {
  const vw = 240;
  const vh = 160;

  const renderContent = () => {
    switch (previewType) {
      case '1col':
        return (
          <>
            {/* Header KPI */}
            <rect x="8" y="8" width="224" height="22" rx="3" fill={WF.header} />
            {/* Stacked full-width blocks */}
            <rect x="8" y="36" width="224" height="36" rx="3" fill={WF.card} />
            <rect x="8" y="78" width="224" height="36" rx="3" fill={WF.card} />
            <rect x="8" y="120" width="224" height="32" rx="3" fill={WF.block} />
          </>
        );

      case '2col':
        return (
          <>
            {/* KPI row */}
            <rect x="8" y="8" width="52" height="20" rx="3" fill={WF.header} />
            <rect x="66" y="8" width="52" height="20" rx="3" fill={WF.header} />
            <rect x="124" y="8" width="52" height="20" rx="3" fill={WF.header} />
            <rect x="182" y="8" width="50" height="20" rx="3" fill={WF.header} />
            {/* Two column charts */}
            <rect x="8" y="34" width="110" height="70" rx="3" fill={WF.card} />
            <rect x="124" y="34" width="108" height="70" rx="3" fill={WF.card} />
            {/* Bottom full width */}
            <rect x="8" y="110" width="224" height="42" rx="3" fill={WF.block} />
          </>
        );

      case '3col':
        return (
          <>
            {/* KPI row (6 items) */}
            <rect x="8" y="8" width="32" height="18" rx="2" fill={WF.header} />
            <rect x="46" y="8" width="32" height="18" rx="2" fill={WF.header} />
            <rect x="84" y="8" width="32" height="18" rx="2" fill={WF.header} />
            <rect x="122" y="8" width="32" height="18" rx="2" fill={WF.header} />
            <rect x="160" y="8" width="32" height="18" rx="2" fill={WF.header} />
            <rect x="198" y="8" width="34" height="18" rx="2" fill={WF.header} />
            {/* Three column charts */}
            <rect x="8" y="32" width="70" height="65" rx="3" fill={WF.card} />
            <rect x="84" y="32" width="70" height="65" rx="3" fill={WF.card} />
            <rect x="160" y="32" width="72" height="65" rx="3" fill={WF.card} />
            {/* Bottom */}
            <rect x="8" y="103" width="224" height="49" rx="3" fill={WF.block} />
          </>
        );

      case 'bento':
        return (
          <>
            {/* Large span card */}
            <rect x="8" y="8" width="145" height="72" rx="3" fill={WF.accent} opacity="0.3" />
            {/* Side cards */}
            <rect x="159" y="8" width="73" height="34" rx="3" fill={WF.card} />
            <rect x="159" y="46" width="73" height="34" rx="3" fill={WF.header} />
            {/* Bottom row */}
            <rect x="8" y="86" width="70" height="66" rx="3" fill={WF.card} />
            <rect x="84" y="86" width="70" height="66" rx="3" fill={WF.cardDark} />
            <rect x="160" y="86" width="72" height="30" rx="3" fill={WF.header} />
            <rect x="160" y="122" width="72" height="30" rx="3" fill={WF.block} />
          </>
        );

      case 'magazine':
        return (
          <>
            {/* Header */}
            <rect x="8" y="8" width="224" height="18" rx="3" fill={WF.header} />
            {/* Main 2/3 + aside 1/3 */}
            <rect x="8" y="32" width="146" height="120" rx="3" fill={WF.card} />
            <rect x="160" y="32" width="72" height="55" rx="3" fill={WF.cardDark} />
            <rect x="160" y="93" width="72" height="59" rx="3" fill={WF.block} />
          </>
        );

      case 'a4':
        return (
          <>
            {/* A4 portrait with header */}
            <rect x="8" y="8" width="224" height="24" rx="3" fill={WF.accent} opacity="0.4" />
            <rect x="8" y="38" width="108" height="50" rx="3" fill={WF.card} />
            <rect x="122" y="38" width="110" height="50" rx="3" fill={WF.card} />
            <rect x="8" y="94" width="224" height="32" rx="3" fill={WF.block} />
            <rect x="8" y="132" width="108" height="20" rx="3" fill={WF.cardDark} />
            <rect x="122" y="132" width="110" height="20" rx="3" fill={WF.cardDark} />
          </>
        );

      case 'mobile':
        return (
          <>
            {/* Narrow single column */}
            <rect x="60" y="8" width="120" height="18" rx="3" fill={WF.header} />
            <rect x="60" y="32" width="56" height="28" rx="3" fill={WF.card} />
            <rect x="124" y="32" width="56" height="28" rx="3" fill={WF.card} />
            <rect x="60" y="66" width="120" height="45" rx="3" fill={WF.cardDark} />
            <rect x="60" y="117" width="120" height="35" rx="3" fill={WF.block} />
          </>
        );

      case 'compact':
        return (
          <>
            {/* Dense grid */}
            {[0,1,2,3].map((i) => (
              <rect key={i} x={8 + i * 57} y="8" width="50" height="16" rx="2" fill={WF.header} />
            ))}
            {[0,1,2,3].map((i) => (
              <rect key={i} x={8 + i * 57} y="30" width="50" height="40" rx="2" fill={i % 2 === 0 ? WF.card : WF.cardDark} />
            ))}
            {[0,1,2,3].map((i) => (
              <rect key={i} x={8 + i * 57} y="76" width="50" height="40" rx="2" fill={i % 2 === 1 ? WF.card : WF.cardDark} />
            ))}
            {[0,1,2,3].map((i) => (
              <rect key={i} x={8 + i * 57} y="122" width="50" height="30" rx="2" fill={WF.block} />
            ))}
          </>
        );

      case 'kpi-3col':
        return (
          <>
            {/* 3 large KPI cards */}
            <rect x="8" y="8" width="70" height="52" rx="3" fill={WF.header} />
            <rect x="84" y="8" width="70" height="52" rx="3" fill={WF.header} />
            <rect x="160" y="8" width="72" height="52" rx="3" fill={WF.header} />
            {/* Main chart */}
            <rect x="8" y="66" width="145" height="86" rx="3" fill={WF.card} />
            {/* Side metrics */}
            <rect x="159" y="66" width="73" height="40" rx="3" fill={WF.cardDark} />
            <rect x="159" y="112" width="73" height="40" rx="3" fill={WF.block} />
          </>
        );

      case 'timeline':
        return (
          <>
            {/* Timeline vertical line */}
            <line x1="40" y1="8" x2="40" y2="152" stroke={WF.accent} strokeWidth="2" opacity="0.5" />
            {/* Timeline items */}
            {[8, 46, 84, 122].map((y, i) => (
              <g key={i}>
                <circle cx="40" cy={y + 10} r="5" fill={WF.accent} opacity="0.7" />
                <rect x="54" y={y} width="178" height="28" rx="3" fill={i % 2 === 0 ? WF.card : WF.block} />
              </g>
            ))}
          </>
        );

      case 'matrix':
        return (
          <>
            {/* Header row */}
            <rect x="8" y="8" width="224" height="20" rx="3" fill={WF.header} />
            {/* Matrix grid */}
            {[0,1,2,3].map((row) =>
              [0,1,2,3].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={8 + col * 56}
                  y={34 + row * 30}
                  width="50"
                  height="24"
                  rx="2"
                  fill={`rgba(59,130,246,${0.1 + (row * 4 + col) * 0.04})`}
                  stroke={WF.line}
                  strokeWidth="0.5"
                />
              ))
            )}
          </>
        );

      case 'map':
        return (
          <>
            {/* KPI row */}
            <rect x="8" y="8" width="70" height="18" rx="2" fill={WF.header} />
            <rect x="84" y="8" width="70" height="18" rx="2" fill={WF.header} />
            <rect x="160" y="8" width="72" height="18" rx="2" fill={WF.header} />
            {/* Map area */}
            <rect x="8" y="32" width="160" height="120" rx="3" fill="#dbeafe" />
            {/* Map decorations */}
            <ellipse cx="88" cy="92" rx="50" ry="34" fill="#93c5fd" opacity="0.4" />
            <circle cx="88" cy="85" r="6" fill={WF.accent} opacity="0.8" />
            <circle cx="110" cy="105" r="4" fill="#ef4444" opacity="0.6" />
            <circle cx="65" cy="75" r="3" fill="#10b981" opacity="0.7" />
            {/* Side legend */}
            <rect x="174" y="32" width="58" height="120" rx="3" fill={WF.card} />
            {[0,1,2,3].map((i) => (
              <rect key={i} x="180" y={40 + i * 26} width="46" height="16" rx="2" fill={WF.block} />
            ))}
          </>
        );

      case 'candlestick':
        return (
          <>
            {/* Price KPIs */}
            <rect x="8" y="8" width="52" height="20" rx="2" fill={WF.header} />
            <rect x="66" y="8" width="52" height="20" rx="2" fill="#d1fae5" />
            <rect x="124" y="8" width="52" height="20" rx="2" fill="#fee2e2" />
            <rect x="182" y="8" width="50" height="20" rx="2" fill={WF.header} />
            {/* Candlestick chart */}
            <rect x="8" y="34" width="224" height="80" rx="3" fill="#f8fbff" stroke={WF.line} strokeWidth="0.5" />
            {[20,38,56,74,92,110,128,146,164,182,200].map((x, i) => {
              const green = i % 3 !== 1;
              const bodyH = 8 + (i * 3) % 18;
              const bodyY = 55 - bodyH / 2 + (i * 5) % 20;
              return (
                <g key={i}>
                  <line x1={x + 8} y1={42} x2={x + 8} y2={108} stroke={green ? '#10b981' : '#ef4444'} strokeWidth="1" opacity="0.6" />
                  <rect x={x + 2} y={bodyY} width="14" height={bodyH} rx="1" fill={green ? '#10b981' : '#ef4444'} opacity="0.8" />
                </g>
              );
            })}
            {/* Volume bar bottom */}
            <rect x="8" y="120" width="224" height="32" rx="3" fill={WF.block} />
          </>
        );

      case 'funnel':
        return (
          <>
            {/* KPI row */}
            <rect x="8" y="8" width="224" height="18" rx="3" fill={WF.header} />
            {/* Funnel stages */}
            {[
              { w: 224, label: '曝光' },
              { w: 180, label: '点击' },
              { w: 140, label: '加购' },
              { w: 100, label: '下单' },
              { w: 70, label: '支付' },
            ].map(({ w }, i) => (
              <rect
                key={i}
                x={8 + (224 - w) / 2}
                y={32 + i * 24}
                width={w}
                height="18"
                rx="3"
                fill={WF.accent}
                opacity={0.8 - i * 0.12}
              />
            ))}
            {/* Right side metrics */}
            <rect x="8" y="152" width="224" height="8" rx="3" fill={WF.block} />
          </>
        );

      case 'calendar':
        return (
          <>
            {/* Month header */}
            <rect x="8" y="8" width="224" height="22" rx="3" fill={WF.header} />
            {/* Week days */}
            {['一','二','三','四','五','六','日'].map((_, i) => (
              <rect key={i} x={8 + i * 32} y="36" width="28" height="14" rx="2" fill={WF.cardDark} />
            ))}
            {/* Calendar cells (5 weeks × 7 days) */}
            {Array.from({ length: 35 }).map((_, i) => (
              <rect
                key={i}
                x={8 + (i % 7) * 32}
                y={56 + Math.floor(i / 7) * 20}
                width="28"
                height="16"
                rx="2"
                fill={i === 10 ? WF.accent : i % 7 >= 5 ? '#fee2e2' : WF.block}
                opacity={i === 10 ? 0.9 : 0.7}
              />
            ))}
          </>
        );

      case 'flow':
        return (
          <>
            {/* Process flow left-to-right */}
            {/* Nodes */}
            {[8, 68, 128, 188].map((x, i) => (
              <g key={i}>
                <rect x={x} y="40" width="46" height="30" rx="4" fill={i === 0 ? WF.accent : i === 3 ? '#10b981' : WF.card} opacity={i === 0 || i === 3 ? 0.8 : 1} />
              </g>
            ))}
            {/* Arrows */}
            {[54, 114, 174].map((x) => (
              <g key={x}>
                <line x1={x} y1="55" x2={x + 8} y2="55" stroke={WF.accent} strokeWidth="1.5" />
                <polygon points={`${x+8},51 ${x+14},55 ${x+8},59`} fill={WF.accent} opacity="0.7" />
              </g>
            ))}
            {/* Sub-flow */}
            <rect x="8" y="90" width="225" height="22" rx="3" fill={WF.block} />
            <rect x="8" y="118" width="225" height="22" rx="3" fill={WF.cardDark} />
            {/* Step indicators */}
            {[28, 88, 148, 208].map((x, i) => (
              <circle key={i} cx={x} cy="148" r="7" fill={WF.accent} opacity={0.3 + i * 0.2} />
            ))}
          </>
        );

      case 'poster':
        return (
          <>
            {/* Poster: single full-page card with creative layout */}
            {/* Background gradient band */}
            <rect x="0" y="0" width="240" height="160" rx="4" fill={WF.bg} />
            <rect x="0" y="0" width="240" height="54" rx="4" fill={WF.accent} opacity="0.18" />
            {/* Title block */}
            <rect x="18" y="12" width="130" height="14" rx="3" fill={WF.accent} opacity="0.7" />
            <rect x="18" y="32" width="80" height="8" rx="2" fill={WF.text} opacity="0.35" />
            {/* Image placeholder on right */}
            <rect x="168" y="8" width="56" height="44" rx="6" fill={WF.header} />
            <circle cx="196" cy="30" r="10" fill={WF.accent} opacity="0.25" />
            <line x1="176" y1="44" x2="216" y2="20" stroke={WF.accent} strokeWidth="1" opacity="0.2" />
            {/* Stats row */}
            <rect x="18" y="62" width="44" height="28" rx="4" fill={WF.card} />
            <rect x="68" y="62" width="44" height="28" rx="4" fill={WF.card} />
            <rect x="118" y="62" width="44" height="28" rx="4" fill={WF.card} />
            <rect x="168" y="62" width="56" height="28" rx="4" fill={WF.cardDark} />
            {/* Main content area */}
            <rect x="18" y="98" width="140" height="40" rx="3" fill={WF.block} />
            <rect x="164" y="98" width="60" height="18" rx="3" fill={WF.card} />
            <rect x="164" y="120" width="60" height="18" rx="3" fill={WF.cardDark} />
            {/* Decorative dots */}
            <circle cx="22" cy="150" r="3" fill={WF.accent} opacity="0.5" />
            <circle cx="32" cy="150" r="3" fill={WF.accent} opacity="0.3" />
            <circle cx="42" cy="150" r="3" fill={WF.accent} opacity="0.2" />
          </>
        );

      case 'poster-wide':
        return (
          <>
            {/* Wide poster: 16:9 single card creative layout */}
            <rect x="0" y="0" width="240" height="160" rx="4" fill={WF.bg} />
            {/* Left accent strip */}
            <rect x="0" y="0" width="70" height="160" rx="4" fill={WF.accent} opacity="0.14" />
            {/* Logo / title block */}
            <rect x="10" y="16" width="50" height="10" rx="2" fill={WF.accent} opacity="0.65" />
            <rect x="10" y="32" width="50" height="6" rx="2" fill={WF.text} opacity="0.3" />
            {/* Large image/chart area center */}
            <rect x="80" y="8" width="100" height="90" rx="5" fill={WF.card} />
            <ellipse cx="130" cy="53" rx="30" ry="22" fill={WF.accent} opacity="0.2" />
            {[90,110,130,150,160].map((x, i) => (
              <rect key={i} x={x - 4} y={80 - [28,20,36,16,30][i]} width="10" height={[28,20,36,16,30][i]} rx="2" fill={WF.accent} opacity={0.4 + i * 0.1} />
            ))}
            {/* Right sidebar */}
            <rect x="186" y="8" width="46" height="40" rx="4" fill={WF.header} />
            <rect x="186" y="54" width="46" height="40" rx="4" fill={WF.cardDark} />
            {/* Bottom bar */}
            <rect x="80" y="104" width="152" height="20" rx="3" fill={WF.block} />
            {/* Left lower stats */}
            <rect x="10" y="60" width="50" height="22" rx="3" fill={WF.card} />
            <rect x="10" y="88" width="50" height="22" rx="3" fill={WF.cardDark} />
            <rect x="10" y="116" width="50" height="16" rx="3" fill={WF.header} />
            {/* Divider */}
            <line x1="74" y1="4" x2="74" y2="156" stroke={WF.line} strokeWidth="1" />
          </>
        );

      default:
        // Fallback: 2col layout
        return (
          <>
            <rect x="8" y="8" width="224" height="22" rx="3" fill={WF.header} />
            <rect x="8" y="36" width="110" height="70" rx="3" fill={WF.card} />
            <rect x="124" y="36" width="108" height="70" rx="3" fill={WF.card} />
            <rect x="8" y="110" width="224" height="42" rx="3" fill={WF.block} />
          </>
        );
    }
  };

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width={width}
      height={height}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {/* Background */}
      <rect x="0" y="0" width={vw} height={vh} rx="4" fill={WF.bg} />
      {renderContent()}
    </svg>
  );
};

// ── Layout Preview Modal ──────────────────────────────────────────────────────

interface LayoutPreviewModalProps {
  name: string;
  description?: string;
  previewType: LayoutPreviewType;
  category?: string;
  tags?: string[];
  onClose: () => void;
}

export const LayoutPreviewModal: React.FC<LayoutPreviewModalProps> = ({
  name,
  description,
  previewType,
  category,
  tags,
  onClose,
}) => (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{name}</h3>
            {category && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                {category}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* SVG Preview */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex items-center justify-center mb-4">
          <SvgWireframe previewType={previewType} width={400} height={266} />
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{description}</p>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </>
);
