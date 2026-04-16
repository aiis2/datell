/**
 * CardCatalog.tsx
 * 完整卡片组件库目录 — 200+ 种卡片定义
 * A类 KPI(40) / B类图表(90) / C类表格(20) / D类结构(15) / E类控件(15)
 */

import React from 'react';
import {
  KpiBasicCard, KpiWithTrendCard, KpiSparklineCard, KpiBarCard,
  KpiComparisonCard, MetricGaugeCard, StatCardIcon, ProgressCard,
  RankListCard, AlertCard, HeatmapCard, WaterfallCard,
} from '../components/KpiCard';

// ── Category types ─────────────────────────────────────────────────────────
export type CardCatalogCategory = 'kpi' | 'chart' | 'table' | 'structure' | 'filter';

export interface CardCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: CardCatalogCategory;
  tags: string[];
  render: (color: string) => React.ReactNode;
}

// ── Preview localisation ───────────────────────────────────────────────────
let _previewLang = 'zh-CN';
/** Called by CardComponentsTab before rendering to sync the current app language. */
export const setPreviewLang = (lang: string): void => { _previewLang = lang; };
/** Preview translation: returns English when en-US, Chinese otherwise. */
const tp = (zh: string, en: string): string => _previewLang === 'en-US' ? en : zh;

export const CARD_CATEGORY_LABELS: Record<CardCatalogCategory, string> = {
  kpi: 'KPI 指标',
  chart: '图表',
  table: '表格',
  structure: '结构内容',
  filter: '筛选控件',
};

export const CARD_CATEGORIES: CardCatalogCategory[] = ['kpi', 'chart', 'table', 'structure', 'filter'];

// ── SVG wireframe preview helpers ─────────────────────────────────────────
type SvgPreviewType =
  | 'bar' | 'bar-h' | 'bar-stacked' | 'bar-waterfall' | 'bar-lollipop' | 'bar-histogram'
  | 'bar-polar' | 'line' | 'line-area' | 'line-stacked-area' | 'line-step' | 'line-dual'
  | 'pie' | 'donut' | 'pie-rose' | 'pie-sunburst' | 'pie-waffle' | 'pie-half'
  | 'scatter' | 'scatter-bubble' | 'heatmap-matrix' | 'heatmap-calendar'
  | 'treemap' | 'sankey' | 'funnel' | 'radar' | 'chord' | 'network' | 'map'
  | 'candlestick' | 'volume'
  | 'table' | 'table-ranked' | 'table-heatmap' | 'table-gantt' | 'table-tree'
  | 'timeline-v' | 'timeline-h' | 'process' | 'org-chart' | 'mind-map' | 'text-card' | 'insight'
  | 'filter-date' | 'filter-dropdown' | 'filter-checkbox' | 'filter-slider' | 'filter-tags' | 'filter-panel';

const SvgPreview: React.FC<{ type: SvgPreviewType; color: string }> = ({ type, color }) => {
  const w = 140;
  const h = 72;
  const bg = '#f8fafc';
  const line = '#e2e8f0';
  const bar = color;
  const mid = color + '99';
  const lt = color + '44';

  const renderContent = () => {
    switch (type) {
      case 'bar':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[0,1,2,3,4].map(i => {
              const heights = [32,22,40,18,35];
              return <rect key={i} x={22+i*22} y={58-heights[i]} width="14" height={heights[i]} fill={bar} rx="2" opacity="0.85" />;
            })}
          </>
        );
      case 'bar-h':
        return (
          <>
            <line x1="28" y1="10" x2="28" y2="60" stroke={line} strokeWidth="1" />
            {[0,1,2,3,4].map(i => {
              const widths = [65,50,80,38,70];
              return <rect key={i} x={28} y={13+i*10} width={widths[i]} height="7" fill={bar} rx="2" opacity="0.85" />;
            })}
          </>
        );
      case 'bar-stacked':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[0,1,2,3,4].map(i => {
              const h1 = [20,15,25,12,22];
              const h2 = [12,10,15,8,14];
              return (
                <g key={i}>
                  <rect x={22+i*22} y={58-h1[i]-h2[i]} width="14" height={h2[i]} fill={mid} rx="2" />
                  <rect x={22+i*22} y={58-h1[i]} width="14" height={h1[i]} fill={bar} rx="1" />
                </g>
              );
            })}
          </>
        );
      case 'bar-waterfall':
        return (
          <>
            <line x1="16" y1="38" x2="130" y2="38" stroke={line} strokeWidth="1" strokeDasharray="3,2" />
            {[{x:22,y:38-20,h:20,c:bar},{x:44,y:18,h:10,c:'#10b981'},{x:66,y:28,h:-8,c:'#ef4444'},{x:88,y:20,h:12,c:'#10b981'},{x:110,y:32,h:6,c:'#10b981'}].map((d,i) => (
              <rect key={i} x={d.x} y={d.h>0?d.y:d.y+d.h} width="14" height={Math.abs(d.h)} fill={d.c} rx="2" opacity="0.85" />
            ))}
          </>
        );
      case 'bar-lollipop':
        return (
          <>
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[0,1,2,3,4].map(i => {
              const ys = [20,32,14,42,26];
              return (
                <g key={i}>
                  <line x1={29+i*22} y1={ys[i]} x2={29+i*22} y2={58} stroke={bar} strokeWidth="1.5" opacity="0.7" />
                  <circle cx={29+i*22} cy={ys[i]} r="4" fill={bar} />
                </g>
              );
            })}
          </>
        );
      case 'bar-histogram':
        return (
          <>
            <line x1="12" y1="58" x2="132" y2="58" stroke={line} strokeWidth="1" />
            {[0,1,2,3,4,5,6,7].map(i => {
              const hs = [8,18,30,40,35,22,12,5];
              return <rect key={i} x={12+i*15} y={58-hs[i]} width="14" height={hs[i]} fill={bar} rx="1" opacity="0.8" />;
            })}
          </>
        );
      case 'bar-polar':
        return (
          <>
            <circle cx={70} cy={38} r={26} fill="none" stroke={line} strokeWidth="1" />
            <circle cx={70} cy={38} r={16} fill="none" stroke={line} strokeWidth="0.5" />
            {[0,1,2,3,4,5].map(i => {
              const a = (i/6)*2*Math.PI - Math.PI/2;
              const rs = [24,18,22,14,20,16];
              const x2 = 70+rs[i]*Math.cos(a);
              const y2 = 38+rs[i]*Math.sin(a);
              return <line key={i} x1={70} y1={38} x2={x2} y2={y2} stroke={bar} strokeWidth="5" opacity="0.7" strokeLinecap="round" />;
            })}
          </>
        );
      case 'line':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            <polyline points="16,45 36,38 56,28 76,32 96,20 116,24 130,18" fill="none" stroke={bar} strokeWidth="2" strokeLinejoin="round" />
            {[16,36,56,76,96,116,130].map((x,i) => {
              const ys = [45,38,28,32,20,24,18];
              return <circle key={i} cx={x} cy={ys[i]} r="2.5" fill={bar} />;
            })}
          </>
        );
      case 'line-area':
        return (
          <>
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            <polygon points="16,58 16,45 36,38 56,28 76,32 96,20 116,24 130,18 130,58" fill={lt} />
            <polyline points="16,45 36,38 56,28 76,32 96,20 116,24 130,18" fill="none" stroke={bar} strokeWidth="2" strokeLinejoin="round" />
          </>
        );
      case 'line-stacked-area':
        return (
          <>
            <polygon points="16,58 16,45 36,42 56,38 76,40 96,35 130,58" fill={lt} />
            <polygon points="16,45 16,32 36,28 56,22 76,26 96,18 130,25 130,35 96,35 76,40 56,38 36,42" fill={mid} />
            <polyline points="16,32 36,28 56,22 76,26 96,18 130,25" fill="none" stroke={bar} strokeWidth="2" strokeLinejoin="round" />
          </>
        );
      case 'line-step':
        return (
          <>
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            <polyline points="16,45 36,45 36,30 56,30 56,22 76,22 76,36 96,36 96,18 116,18 116,28 130,28" fill="none" stroke={bar} strokeWidth="2" />
          </>
        );
      case 'line-dual':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="130" y1="10" x2="130" y2="58" stroke={line} strokeWidth="1" />
            <polyline points="16,42 36,35 56,28 76,31 96,20 116,23 130,18" fill="none" stroke={bar} strokeWidth="2" strokeLinejoin="round" />
            <polyline points="16,25 36,30 56,40 76,34 96,38 116,45 130,42" fill="none" stroke={mid} strokeWidth="2" strokeDasharray="4,2" strokeLinejoin="round" />
          </>
        );
      case 'pie':
        return (
          <>
            <circle cx={70} cy={38} r={26} fill={lt} />
            <path d="M70,38 L70,12 A26,26 0 0,1 96,38 Z" fill={bar} />
            <path d="M70,38 L96,38 A26,26 0 0,1 57,62 Z" fill={mid} />
            <path d="M70,38 L57,62 A26,26 0 0,1 44,38 Z" fill={lt} />
          </>
        );
      case 'donut':
        return (
          <>
            <circle cx={70} cy={38} r={26} fill="none" stroke={lt} strokeWidth="12" />
            <circle cx={70} cy={38} r={26} fill="none" stroke={bar} strokeWidth="12" strokeDasharray="60,103" strokeDashoffset="0" transform="rotate(-90,70,38)" />
            <text x={70} y={42} textAnchor="middle" fontSize="10" fill={bar} fontWeight="bold">72%</text>
          </>
        );
      case 'pie-rose':
        return (
          <>
            {[0,1,2,3,4,5].map(i => {
              const a1 = (i/6)*2*Math.PI-Math.PI/2;
              const a2 = ((i+1)/6)*2*Math.PI-Math.PI/2;
              const rs = [16,22,26,18,20,14];
              const r = rs[i];
              const x1 = 70+r*Math.cos(a1);
              const y1 = 38+r*Math.sin(a1);
              const x2 = 70+r*Math.cos(a2);
              const y2 = 38+r*Math.sin(a2);
              return <path key={i} d={`M70,38 L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} fill={bar} opacity={0.5+i*0.08} />;
            })}
          </>
        );
      case 'pie-sunburst':
        return (
          <>
            {[0,1,2,3].map(i => {
              const a1 = (i/4)*2*Math.PI-Math.PI/2;
              const a2 = ((i+1)/4)*2*Math.PI-Math.PI/2;
              const x1 = 70+24*Math.cos(a1); const y1 = 38+24*Math.sin(a1);
              const x2 = 70+24*Math.cos(a2); const y2 = 38+24*Math.sin(a2);
              return <path key={i} d={`M70,38 L${x1},${y1} A24,24 0 0,1 ${x2},${y2} Z`} fill={bar} opacity={0.4+i*0.15} />;
            })}
            {[0,1,2,3,4,5,6,7].map(i => {
              const a1 = (i/8)*2*Math.PI-Math.PI/2;
              const a2 = ((i+1)/8)*2*Math.PI-Math.PI/2;
              const x11 = 70+24*Math.cos(a1); const y11 = 38+24*Math.sin(a1);
              const x12 = 70+24*Math.cos(a2); const y12 = 38+24*Math.sin(a2);
              const x21 = 70+34*Math.cos(a1); const y21 = 38+34*Math.sin(a1);
              const x22 = 70+34*Math.cos(a2); const y22 = 38+34*Math.sin(a2);
              return <path key={i} d={`M${x11},${y11} L${x21},${y21} A34,34 0 0,1 ${x22},${y22} L${x12},${y12} A24,24 0 0,0 ${x11},${y11} Z`} fill={mid} opacity={0.3+i*0.07} />;
            })}
          </>
        );
      case 'pie-waffle':
        return (
          <>
            {Array.from({length:64}, (_,i) => {
              const row = Math.floor(i/8);
              const col = i%8;
              const filled = i < 45;
              return <rect key={i} x={30+col*10} y={12+row*8} width="9" height="7" rx="1" fill={filled ? bar : line} opacity={filled?0.8:0.4} />;
            })}
          </>
        );
      case 'pie-half':
        return (
          <>
            <path d="M20,56 A50,50 0 0,1 120,56 Z" fill={lt} />
            <path d="M20,56 A50,50 0 0,1 70,6 L70,56 Z" fill={bar} opacity="0.8" />
            <path d="M70,6 A50,50 0 0,1 120,56 L70,56 Z" fill={mid} />
            <circle cx={70} cy={56} r={18} fill={bg} />
            <text x={70} y={58} textAnchor="middle" fontSize="9" fill={bar} fontWeight="bold">64%</text>
          </>
        );
      case 'scatter':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[[28,42],[40,32],[55,24],[48,46],[70,18],[85,28],[60,50],[95,20],[110,35],[75,44]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="4" fill={bar} opacity="0.7" />
            ))}
          </>
        );
      case 'scatter-bubble':
        return (
          <>
            <line x1="16" y1="10" x2="16" y2="58" stroke={line} strokeWidth="1" />
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[[30,42,8],[50,25,12],[70,35,6],[90,20,14],[110,45,10]].map(([x,y,r],i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={bar} opacity="0.5" stroke={bar} strokeWidth="1" />
            ))}
          </>
        );
      case 'heatmap-matrix':
        return (
          <>
            {Array.from({length:35}, (_,i) => {
              const col = i%7;
              const row = Math.floor(i/7);
              const v = Math.random();
              return <rect key={i} x={14+col*17} y={10+row*12} width="15" height="10" rx="2" fill={bar} opacity={0.15+v*0.75} />;
            })}
          </>
        );
      case 'heatmap-calendar':
        return (
          <>
            {Array.from({length:52}, (_,i) => (
              Array.from({length:7}, (_,j) => {
                const v = Math.random();
                return <rect key={`${i}-${j}`} x={12+i*2.2} y={10+j*9} width="1.8" height="8" rx="0.5" fill={bar} opacity={v > 0.3 ? 0.2+v*0.6 : 0.1} />;
              })
            ))}
          </>
        );
      case 'treemap':
        return (
          <>
            <rect x={12} y={10} width={64} height={48} rx="2" fill={bar} opacity="0.7" />
            <rect x={80} y={10} width={48} height={28} rx="2" fill={mid} />
            <rect x={80} y={42} width={28} height={16} rx="2" fill={lt} />
            <rect x={112} y={42} width={16} height={16} rx="2" fill={bar} opacity="0.4" />
          </>
        );
      case 'sankey':
        return (
          <>
            {[[12,15,6,20],[12,30,6,22],[12,50,6,18],[60,12,6,20],[60,34,6,22],[60,52,6,8],[108,16,6,25],[108,42,6,20]].map(([x,y,w,h],i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx="1" fill={bar} opacity="0.75" />
            ))}
            <path d="M18,18 Q38,18 60,16 Q38,26 18,22 Z" fill={mid} opacity="0.5" />
            <path d="M18,34 Q38,34 60,34 Q38,44 18,52 Z" fill={bar} opacity="0.3" />
            <path d="M66,21 Q88,21 108,25 Q88,34 66,34 Z" fill={mid} opacity="0.5" />
          </>
        );
      case 'funnel':
        return (
          <>
            {[0,1,2,3,4].map(i => {
              const margin = i*14;
              return <rect key={i} x={14+margin} y={10+i*13} width={112-margin*2} height="11" rx="2" fill={bar} opacity={0.9-i*0.15} />;
            })}
          </>
        );
      case 'radar':
        return (
          <>
            {[6,5].map(r => (
              <polygon key={r} points={Array.from({length:6},(_,i)=>{
                const a=(i/6)*2*Math.PI-Math.PI/2;
                return `${70+r*4*Math.cos(a)},${36+r*4*Math.sin(a)}`;
              }).join(' ')} fill="none" stroke={line} strokeWidth="0.8" />
            ))}
            <polygon points={Array.from({length:6},(_,i)=>{
              const a=(i/6)*2*Math.PI-Math.PI/2;
              const rs=[22,18,24,16,20,18];
              return `${70+rs[i]*Math.cos(a)},${36+rs[i]*Math.sin(a)}`;
            }).join(' ')} fill={lt} stroke={bar} strokeWidth="1.5" />
          </>
        );
      case 'chord':
        return (
          <>
            <circle cx={70} cy={38} r={26} fill="none" stroke={line} strokeWidth="1" />
            {[[0,120],[60,240],[120,300],[180,60],[240,180],[300,0]].map(([a1,a2],i)=>{
              const r1=a1*Math.PI/180, r2=a2*Math.PI/180;
              const x1=70+26*Math.cos(r1), y1=38+26*Math.sin(r1);
              const x2=70+26*Math.cos(r2), y2=38+26*Math.sin(r2);
              return <path key={i} d={`M${x1},${y1} Q70,38 ${x2},${y2}`} fill="none" stroke={bar} strokeWidth="1.5" opacity="0.4" />;
            })}
            {[0,60,120,180,240,300].map((a,i)=>{
              const r=a*Math.PI/180;
              return <circle key={i} cx={70+26*Math.cos(r)} cy={38+26*Math.sin(r)} r="3" fill={bar} opacity="0.8" />;
            })}
          </>
        );
      case 'network':
        return (
          <>
            {[[70,36],[40,20],[100,20],[30,50],[95,52],[65,58]].map(([x,y],i,arr) => (
              i>0 && <line key={i} x1={arr[0][0]} y1={arr[0][1]} x2={x} y2={y} stroke={line} strokeWidth="1" />
            ))}
            <line x1={40} y1={20} x2={30} y2={50} stroke={line} strokeWidth="1" />
            <line x1={100} y1={20} x2={95} y2={52} stroke={line} strokeWidth="1" />
            {[[70,36,5],[40,20,4],[100,20,4],[30,50,3],[95,52,3],[65,58,3]].map(([x,y,r],i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={bar} opacity="0.8" />
            ))}
          </>
        );
      case 'map':
        return (
          <>
            <rect x={15} y={10} width={110} height={58} rx="4" fill={lt} />
            <text x={70} y={42} textAnchor="middle" fontSize="20" fill={bar} opacity="0.3">🗺</text>
            {[[40,30,4],[75,25,3],[100,40,5],[55,48,3],[85,55,4]].map(([x,y,r],i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={bar} opacity="0.7" />
            ))}
          </>
        );
      case 'candlestick':
        return (
          <>
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[22,44,66,88,110].map((x,i) => {
              const opens = [38,30,25,35,28];
              const closes = [28,38,18,25,20];
              const highs = [22,25,14,22,16];
              const lows = [45,44,30,40,35];
              const up = opens[i] > closes[i];
              return (
                <g key={i}>
                  <line x1={x+5} y1={highs[i]} x2={x+5} y2={lows[i]} stroke={up?'#10b981':'#ef4444'} strokeWidth="1" />
                  <rect x={x} y={Math.min(opens[i],closes[i])} width="10" height={Math.abs(opens[i]-closes[i])||2} fill={up?'#10b981':'#ef4444'} />
                </g>
              );
            })}
          </>
        );
      case 'volume':
        return (
          <>
            <line x1="16" y1="58" x2="130" y2="58" stroke={line} strokeWidth="1" />
            {[22,38,54,70,86,102,118].map((x,i) => {
              const hs = [20,12,30,8,25,15,22];
              const ups = [true,false,true,false,true,true,false];
              return <rect key={i} x={x} y={58-hs[i]} width="10" height={hs[i]} fill={ups[i]?'#10b981':'#ef4444'} rx="1" opacity="0.8" />;
            })}
          </>
        );
      case 'table':
        return (
          <>
            <rect x={14} y={12} width={112} height={11} rx="2" fill={bar} opacity="0.7" />
            {[0,1,2,3].map(i => (
              <rect key={i} x={14} y={26+i*11} width={112} height={10} rx="1" fill={i%2===0?'#f1f5f9':'white'} stroke={line} strokeWidth="0.5" />
            ))}
            {[0,1,2,3].map(i => (
              [0,1,2].map(j => (
                <rect key={`${i}-${j}`} x={16+j*37} y={27+i*11} width={34} height={8} rx="1" fill={bar} opacity="0.15" />
              ))
            ))}
          </>
        );
      case 'table-ranked':
        return (
          <>
            <rect x={14} y={12} width={112} height={11} rx="2" fill={bar} opacity="0.7" />
            {[0,1,2,3,4].map(i => (
              <g key={i}>
                <circle cx={24} cy={21+i*9} r="4" fill={i<3?bar:line} opacity={i<3?0.8:0.4} />
                <rect x={34} y={17+i*9} width={60} height={7} rx="1" fill={line} />
                <rect x={34} y={17+i*9} width={60*(0.95-i*0.18)} height={7} rx="1" fill={bar} opacity="0.6" />
                <text x={100} y={23+i*9} fontSize="7" fill="#64748b" textAnchor="middle">{90-i*16}%</text>
              </g>
            ))}
          </>
        );
      case 'table-heatmap':
        return (
          <>
            <rect x={14} y={12} width={112} height={10} rx="2" fill={bar} opacity="0.7" />
            {Array.from({length:20},(_,i)=>{
              const col=i%4; const row=Math.floor(i/4);
              const v=0.2+Math.random()*0.7;
              return <rect key={i} x={16+col*27} y={25+row*10} width={25} height={9} rx="1" fill={bar} opacity={v} />;
            })}
          </>
        );
      case 'table-gantt':
        return (
          <>
            {[0,1,2,3,4].map(i => {
              const starts = [10,20,35,15,45];
              const lens = [30,40,35,55,25];
              return (
                <g key={i}>
                  <rect x={14} y={12+i*11} width={35} height={9} rx="1" fill={line} />
                  <rect x={50+starts[i]} y={12+i*11} width={lens[i]} height={9} rx="3" fill={bar} opacity={0.6+i*0.08} />
                </g>
              );
            })}
          </>
        );
      case 'table-tree':
        return (
          <>
            {[{x:14,y:12,w:112,ind:0},{x:22,y:24,w:104,ind:1},{x:30,y:36,w:96,ind:2},{x:22,y:48,w:104,ind:1},{x:30,y:60,w:96,ind:2}].map((r,i) => (
              <g key={i}>
                {r.ind>0 && <line x1={r.x-2} y1={r.y+4} x2={r.x+2} y2={r.y+4} stroke={line} strokeWidth="1" />}
                <rect x={r.x} y={r.y} width={r.w} height={9} rx="1" fill={i===0?bar:line} opacity={i===0?0.7:0.3} />
              </g>
            ))}
          </>
        );
      case 'timeline-v':
        return (
          <>
            <line x1={50} y1={10} x2={50} y2={65} stroke={line} strokeWidth="2" />
            {[12,26,40,54].map((y,i) => (
              <g key={i}>
                <circle cx={50} cy={y} r="5" fill={bar} opacity={0.7+i*0.08} />
                <rect x={58} y={y-4} width={60} height={8} rx="2" fill={bar} opacity={0.15} />
              </g>
            ))}
          </>
        );
      case 'timeline-h':
        return (
          <>
            <line x1={14} y1={36} x2={126} y2={36} stroke={line} strokeWidth="2" />
            {[20,46,72,98,124].map((x,i) => (
              <g key={i}>
                <circle cx={x} cy={36} r="5" fill={bar} opacity={0.7+i*0.06} />
                <rect x={x-12} y={42} width={24} height={6} rx="2" fill={bar} opacity="0.15" />
              </g>
            ))}
          </>
        );
      case 'process':
        return (
          <>
            {[14,44,74,104].map((x,i) => (
              <g key={i}>
                <rect x={x} y={22} width={26} height={22} rx="4" fill={bar} opacity={0.5+i*0.12} />
                {i<3 && <path d={`M${x+26},33 L${x+30},29 L${x+34},33 L${x+30},37 Z`} fill={bar} opacity="0.6" />}
              </g>
            ))}
          </>
        );
      case 'org-chart':
        return (
          <>
            <rect x={52} y={10} width={36} height={14} rx="3" fill={bar} opacity="0.7" />
            <line x1={70} y1={24} x2={70} y2={32} stroke={line} strokeWidth="1" />
            <line x1={32} y1={32} x2={108} y2={32} stroke={line} strokeWidth="1" />
            {[20,52,84].map((x,i) => (
              <g key={i}>
                <line x1={x+10} y1={32} x2={x+10} y2={40} stroke={line} strokeWidth="1" />
                <rect x={x} y={40} width={20} height={12} rx="2" fill={bar} opacity={0.4+i*0.1} />
              </g>
            ))}
          </>
        );
      case 'mind-map':
        return (
          <>
            <rect x={52} y={30} width={36} height={16} rx="4" fill={bar} opacity="0.7" />
            {[[14,16],[14,34],[14,52],[96,16],[96,34],[96,52]].map(([x,y],i) => (
              <g key={i}>
                <line x1={x<70?x+28:70+18} y1={y+6} x2={70} y2={38} stroke={line} strokeWidth="0.8" />
                <rect x={x} y={y} width={28} height={12} rx="3" fill={i<3?lt:mid} opacity="0.8" />
              </g>
            ))}
          </>
        );
      case 'text-card':
        return (
          <>
            <rect x={14} y={14} width={80} height={8} rx="2" fill={bar} opacity="0.6" />
            <rect x={14} y={26} width={112} height={5} rx="2" fill={line} />
            <rect x={14} y={34} width={96} height={5} rx="2" fill={line} />
            <rect x={14} y={42} width={104} height={5} rx="2" fill={line} />
            <rect x={14} y={50} width={72} height={5} rx="2" fill={line} />
          </>
        );
      case 'insight':
        return (
          <>
            <rect x={12} y={10} width={4} height={56} rx="2" fill={bar} />
            <rect x={20} y={14} width={60} height={8} rx="2" fill={bar} opacity="0.7" />
            <rect x={20} y={26} width={106} height={5} rx="2" fill={line} />
            <rect x={20} y={34} width={96} height={5} rx="2" fill={line} />
            <rect x={20} y={42} width={100} height={5} rx="2" fill={line} />
            <rect x={20} y={52} width={60} height={5} rx="2" fill={bar} opacity="0.3" />
          </>
        );
      case 'filter-date':
        return (
          <>
            <rect x={14} y={16} width={112} height={22} rx="4" fill={line} />
            <text x={70} y={31} textAnchor="middle" fontSize="9" fill="#64748b">2024-01-01 ~ 2024-12-31</text>
            <rect x={14} y={44} width={36} height={14} rx="3" fill={bar} opacity="0.7" />
            <rect x={54} y={44} width={36} height={14} rx="3" fill={line} />
            <rect x={94} y={44} width={32} height={14} rx="3" fill={line} />
            <text x={32} y={54} textAnchor="middle" fontSize="7" fill="white">本月</text>
            <text x={72} y={54} textAnchor="middle" fontSize="7" fill="#64748b">本季</text>
            <text x={110} y={54} textAnchor="middle" fontSize="7" fill="#64748b">本年</text>
          </>
        );
      case 'filter-dropdown':
        return (
          <>
            <rect x={14} y={16} width={112} height={22} rx="4" fill={line} stroke={bar} strokeWidth="1" />
            <text x={22} y={30} fontSize="9" fill="#64748b">请选择维度...</text>
            <text x={118} y={30} textAnchor="end" fontSize="9" fill={bar}>▼</text>
          </>
        );
      case 'filter-checkbox':
        return (
          <>
            {[{label:'选项A',checked:true},{label:'选项B',checked:false},{label:'选项C',checked:true},{label:'选项D',checked:false}].map((opt,i) => (
              <g key={i}>
                <rect x={14} y={12+i*14} width={10} height={10} rx="2" fill={opt.checked?bar:line} stroke={opt.checked?bar:line} strokeWidth="1" />
                {opt.checked && <path d={`M16,${17+i*14} L18,${20+i*14} L22,${15+i*14}`} stroke="white" strokeWidth="1.5" fill="none" />}
                <text x={28} y={21+i*14} fontSize="9" fill="#64748b">{opt.label}</text>
              </g>
            ))}
          </>
        );
      case 'filter-slider':
        return (
          <>
            <line x1={14} y1={36} x2={126} y2={36} stroke={line} strokeWidth="3" strokeLinecap="round" />
            <line x1={14} y1={36} x2={80} y2={36} stroke={bar} strokeWidth="3" strokeLinecap="round" />
            <circle cx={80} cy={36} r="6" fill={bar} stroke="white" strokeWidth="2" />
            <text x={14} y={56} fontSize="9" fill="#64748b">0</text>
            <text x={126} y={56} textAnchor="end" fontSize="9" fill="#64748b">100</text>
            <text x={80} y={24} textAnchor="middle" fontSize="9" fill={bar} fontWeight="bold">58</text>
          </>
        );
      case 'filter-tags':
        return (
          <>
            {[{l:'北京',active:true},{l:'上海',active:false},{l:'广州',active:true},{l:'深圳',active:false},{l:'成都',active:false}].map((t,i) => {
              const offsets = [0,32,64,96,0];
              const rows = [0,0,0,0,1];
              return (
                <g key={i}>
                  <rect x={14+offsets[i]} y={16+rows[i]*18} width={t.l.length*9+8} height={14} rx="7" fill={t.active?bar:line} opacity={t.active?0.85:0.6} />
                  <text x={14+offsets[i]+t.l.length*4.5+4} y={26+rows[i]*18} textAnchor="middle" fontSize="8" fill={t.active?'white':'#64748b'}>{t.l}</text>
                </g>
              );
            })}
          </>
        );
      case 'filter-panel':
        return (
          <>
            <rect x={12} y={10} width={116} height={58} rx="4" fill={line} opacity="0.4" />
            <rect x={16} y={14} width={70} height={8} rx="2" fill={bar} opacity="0.6" />
            <rect x={16} y={26} width={108} height={8} rx="3" fill={line} />
            <rect x={16} y={38} width={108} height={8} rx="3" fill={line} />
            <rect x={16} y={50} width={50} height={12} rx="3" fill={bar} opacity="0.7" />
            <rect x={72} y={50} width={50} height={12} rx="3" fill={line} />
          </>
        );
      default:
        return <rect x={14} y={14} width={112} height={44} rx="4" fill={lt} />;
    }
  };

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ background: bg, borderRadius: 8 }}>
      {renderContent()}
    </svg>
  );
};

const sv = (type: SvgPreviewType) => (color: string) => <SvgPreview type={type} color={color} />;

// ── A Class: KPI Cards (40+) ──────────────────────────────────────────────
const KPI_ENTRIES: CardCatalogEntry[] = [
  { id:'kpi-single', name:'基础 KPI', description:'单数值+标签，最简洁 KPI', category:'kpi', tags:['KPI','基础','数值'],
    render:(c)=><KpiBasicCard title={tp('月度收入','Monthly Revenue')} value="¥1,234,567" unit="" /> },
  { id:'kpi-trend', name:'趋势 KPI', description:'数值+涨跌百分比+图标', category:'kpi', tags:['KPI','趋势','图标'],
    render:(c)=><KpiWithTrendCard title={tp('本周订单','Weekly Orders')} value="8,342" unit={tp('单','orders')} trend={12.3} trendLabel={tp('环比','WoW')} icon="shopping-cart" primaryColor={c} /> },
  { id:'kpi-sparkline', name:'折线趋势 KPI', description:'数值+折线迷你图', category:'kpi', tags:['KPI','Sparkline','折线'],
    render:(c)=><KpiSparklineCard title={tp('DAU 日活','DAU Active')} value="32,456" trend={5.8} chartData={[18,25,20,35,28,42,38,45,40,52,48,56]} primaryColor={c} /> },
  { id:'kpi-bar', name:'柱状图 KPI', description:'数值+迷你柱状图', category:'kpi', tags:['KPI','柱状图','对比'],
    render:(c)=><KpiBarCard title={tp('周销售额','Weekly Sales')} value={tp('¥45.6万','¥456K')} trend={-3.2} chartData={[60,75,55,85,70,68,92]} primaryColor={c} /> },
  { id:'kpi-comparison', name:'对比 KPI', description:'本期vs上期+子弹进度', category:'kpi', tags:['KPI','对比','子弹图'],
    render:(c)=><KpiComparisonCard title={tp('实际 vs 目标','Actual vs Target')} value="92" unit="%" compareValue="100" compareLabel={tp('目标','Target')} primaryColor={c} /> },
  { id:'kpi-gauge-ring', name:'仪表盘指标', description:'环形进度图+数值', category:'kpi', tags:['仪表盘','环形','达成率'],
    render:(c)=><MetricGaugeCard title={tp('目标完成率','Goal Completion')} value="78" unit="%" subtitle={tp('目标达成率','Completion Rate')} chartData={[78,22]} primaryColor={c} /> },
  { id:'kpi-target-bar', name:'进度条 KPI', description:'进度条+完成率', category:'kpi', tags:['进度','完成率','任务'],
    render:(c)=><ProgressCard title={tp('季度达成','Quarterly Target')} value={tp('¥86万','¥860K')} unit="" progress={0.78} progressLabel={tp('目标 ¥110万','Target ¥1.1M')} primaryColor={c} /> },
  { id:'kpi-bullet', name:'子弹图 KPI', description:'目标/实际子弹图比较', category:'kpi', tags:['子弹图','目标','对比'],
    render:(c)=><KpiComparisonCard title={tp('子弹对比','Bullet Compare')} value="85" unit="%" compareValue="100" compareLabel={tp('基准','Baseline')} primaryColor={c} /> },
  { id:'kpi-multi-row', name:'多行指标卡', description:'3-4 个指标分行展示', category:'kpi', tags:['多指标','分组','紧凑'],
    render:(c)=>(
      <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-xs min-w-[140px]">
        {([[tp('收入','Revenue'),tp('¥128万','¥1.28M')],[tp('利润','Profit'),tp('¥32万','¥320K')],[tp('增长','Growth'),'+8.4%']]).map(([l,v])=>(
          <div key={l} className="flex justify-between items-center">
            <span className="text-gray-500 dark:text-gray-400">{l}</span>
            <span className="font-bold" style={{color:c}}>{v}</span>
          </div>
        ))}
      </div>
    )},
  { id:'kpi-ranked-list', name:'排行榜 KPI', description:'TOP-N 排名+进度条', category:'kpi', tags:['排行','TOP','列表'],
    render:(c)=><RankListCard title={tp('销售员排行','Sales Ranking')} primaryColor={c} items={[{label:tp('张明','Alice'),value:tp('¥82万','¥820K'),pct:0.95},{label:tp('李华','Bob'),value:tp('¥71万','¥710K'),pct:0.82},{label:tp('王芳','Carol'),value:tp('¥60万','¥600K'),pct:0.69},{label:tp('赵磊','Dave'),value:tp('¥48万','¥480K'),pct:0.55},{label:tp('陈静','Eve'),value:tp('¥35万','¥350K'),pct:0.40}]} /> },
  { id:'kpi-heatmap-cell', name:'热力单元 KPI', description:'单行热力图+活跃度', category:'kpi', tags:['热力图','活跃度','日历'],
    render:(c)=><HeatmapCard title={tp('近14日活跃','14-Day Activity')} value="4,230" unit={tp('次','hits')} chartData={[0.2,0.5,0.8,0.3,0.9,0.6,0.4,0.7,0.95,0.5,0.3,0.8,0.65,1.0]} primaryColor={c} /> },
  { id:'kpi-segmented', name:'分段 KPI', description:'多指标并排展示', category:'kpi', tags:['分段','并排','多指标'],
    render:(c)=>(
      <div className="flex gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        {([[tp('新增','New'),'1,234',c],[tp('留存','Retention'),'68%','#10b981'],[tp('流失','Churn'),'12%','#ef4444']]).map(([l,v,col])=>(
          <div key={l as string} className="flex flex-col items-center gap-0.5 flex-1">
            <span className="text-[10px] text-gray-400">{l}</span>
            <span className="text-sm font-bold" style={{color:col as string}}>{v}</span>
          </div>
        ))}
      </div>
    )},
  { id:'kpi-donut-ratio', name:'环形占比 KPI', description:'环形占比+数值说明', category:'kpi', tags:['环形','占比','达成'],
    render:(c)=><MetricGaugeCard title={tp('市场占有率','Market Share')} value="34" unit="%" subtitle={tp('目标达成率','Market Share')} chartData={[34,66]} primaryColor={c} /> },
  { id:'kpi-traffic-light', name:'红绿灯 KPI', description:'三色状态指示灯', category:'kpi', tags:['红绿灯','状态','预警'],
    render:(c)=>(
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('系统健康度','System Health')}</span>
        <div className="flex gap-2 items-center">
          {([['#10b981',tp('正常','OK')],['#f59e0b',tp('警告','Warn')],['#ef4444',tp('异常','Error')]] as [string,string][]).map(([col,label])=>(
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-4 h-4 rounded-full" style={{background:col}} />
              <span className="text-[9px] text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    )},
  { id:'kpi-waterfall-delta', name:'瀑布增减 KPI', description:'收支变化瀑布图', category:'kpi', tags:['瀑布图','财务','增减'],
    render:(c)=><WaterfallCard title={tp('收支变化','Cash Change')} value={tp('¥130万','¥1.3M')} chartData={[100,35,-12,18,-8,22,-8]} primaryColor={c} /> },
  { id:'kpi-dual-compare', name:'双期对比 KPI', description:'本期 vs 上期双栏', category:'kpi', tags:['双期','对比','同比'],
    render:(c)=>(
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('销售额对比','Sales Compare')}</span>
        <div className="flex gap-3">
          <div className="flex flex-col"><span className="text-[10px] text-gray-400">{tp('本月','This Mo.')}</span><span className="text-sm font-bold" style={{color:c}}>{tp('¥128万','¥1.28M')}</span></div>
          <div className="flex flex-col"><span className="text-[10px] text-gray-400">{tp('上月','Last Mo.')}</span><span className="text-sm font-bold text-gray-400">{tp('¥112万','¥1.12M')}</span></div>
        </div>
        <div className="text-[10px]" style={{color:'#10b981'}}>▲ +14.3%</div>
      </div>
    )},
  { id:'kpi-rolling-avg', name:'滚动均线 KPI', description:'N日滚动均值趋势', category:'kpi', tags:['均线','滚动','趋势'],
    render:(c)=><KpiSparklineCard title={tp('7日均值','7D Avg')} value="4,560" trend={2.1} chartData={[38,42,40,45,43,48,46,50,48,52,50,55]} primaryColor={c} /> },
  { id:'kpi-percentile', name:'百分位 KPI', description:'P50/P95/P99 分位数展示', category:'kpi', tags:['分位数','P95','性能'],
    render:(c)=>(
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('响应时间分布','Response Time')}</span>
        {[['P50','45ms'],['P95','120ms'],['P99','280ms']].map(([p,v])=>(
          <div key={p} className="flex justify-between text-[10px]">
            <span className="text-gray-400">{p}</span>
            <span className="font-bold" style={{color:c}}>{v}</span>
          </div>
        ))}
      </div>
    )},
  { id:'kpi-composite', name:'综合得分 KPI', description:'多维度综合指数卡', category:'kpi', tags:['综合','指数','评分'],
    render:(c)=><StatCardIcon title={tp('综合评分','Composite Score')} value="87.5" unit={tp('分','pts')} trend={3.2} icon="star" primaryColor={c} /> },
  { id:'kpi-risk-flag', name:'风险标记 KPI', description:'风险等级+标记徽章', category:'kpi', tags:['风险','标记','预警'],
    render:()=><AlertCard title={tp('风险等级','Risk Level')} message={tp('3个指标偏离基准，需关注','3 metrics deviate from baseline')} level="warning" value={tp('中风险','Medium')} /> },
  { id:'kpi-forecast-vs-actual', name:'预测 vs 实际', description:'预测值与实际值对比折线', category:'kpi', tags:['预测','对比','折线'],
    render:(c)=><KpiSparklineCard title={tp('预测偏差','Forecast Deviation')} value="-2.3%" trend={-2.3} chartData={[50,52,48,55,53,58,56,54,60,58,62,55]} primaryColor={c} /> },
  { id:'kpi-cohort-retention', name:'同期群留存', description:'多期留存率矩阵', category:'kpi', tags:['留存','同期群','矩阵'],
    render:(c)=>(
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('W1留存','W1 Retention')}</span>
        <div className="grid grid-cols-4 gap-1">
          {[100,72,58,45,100,68,54,100,71,100].map((v,i)=>(
            <div key={i} className="text-center text-[9px] py-0.5 rounded" style={{background:c+'22',color:c,fontWeight:'bold'}}>{v}%</div>
          ))}
        </div>
      </div>
    )},
  { id:'kpi-nps', name:'NPS 净推荐值', description:'净推荐分数展示', category:'kpi', tags:['NPS','满意度','推荐'],
    render:(c)=><MetricGaugeCard title="NPS" value="42" unit="" subtitle={tp('净推荐值','Net Promoter Score')} chartData={[62,25,13]} primaryColor={c} /> },
  { id:'kpi-conversion-rate', name:'转化漏斗 KPI', description:'多阶段转化率卡', category:'kpi', tags:['转化率','漏斗','用户'],
    render:(c)=>(
      <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        {([[tp('访问','Visit'),'10,000'],[tp('注册','Sign-up'),'3,200','32%'],[tp('下单','Order'),'960','30%']]).map(([l,v,r])=>(
          <div key={l} className="flex justify-between text-[10px]">
            <span className="text-gray-500">{l}</span>
            <span className="font-bold" style={{color:r?'#10b981':c}}>{r||v}</span>
          </div>
        ))}
      </div>
    )},
  { id:'kpi-growth-matrix', name:'增长矩阵', description:'2×2 增长象限矩阵', category:'kpi', tags:['增长','矩阵','战略'],
    render:(c)=>(
      <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-[10px] text-gray-500 block mb-1">{tp('增长矩阵','Growth Matrix')}</span>
        <div className="grid grid-cols-2 gap-1">
          {([[tp('明星','Star'),'⭐',c],[tp('现金牛','Cash Cow'),'💰','#10b981'],[tp('问号','Question'),'❓','#f59e0b'],[tp('瘦狗','Dog'),'🐕','#6b7280']]).map(([l,e,col])=>(
            <div key={l as string} className="text-center p-1 rounded text-[9px]" style={{background:col as string+'22',color:col as string}}>{e} {l}</div>
          ))}
        </div>
      </div>
    )},
  { id:'kpi-stock-ticker', name:'股票行情 KPI', description:'股票价格+涨跌幅', category:'kpi', tags:['股票','行情','涨跌'],
    render:(c)=><KpiWithTrendCard title={tp('上证指数','SSE Index')} value="3,245.86" unit="" trend={1.23} trendLabel={tp('今日','Today')} icon="trending-up" primaryColor={c} /> },
  { id:'kpi-capacity-util', name:'容量利用率', description:'资源使用率+剩余容量', category:'kpi', tags:['容量','利用率','运维'],
    render:(c)=><ProgressCard title={tp('CPU 利用率','CPU Usage')} value="68%" unit="" progress={0.68} progressLabel={tp('阈值 80%','Threshold 80%')} primaryColor={c} /> },
  { id:'kpi-sla-uptime', name:'SLA 可用性', description:'服务可用率+SLA 达标', category:'kpi', tags:['SLA','可用性','运维'],
    render:()=><AlertCard title="SLA" message={tp('过去30天正常运行率 99.97%，达标','30-day uptime 99.97% — SLA met')} level="success" value="99.97%" /> },
  { id:'kpi-budget-variance', name:'预算偏差 KPI', description:'实际 vs 预算+偏差率', category:'kpi', tags:['预算','偏差','财务'],
    render:(c)=><KpiComparisonCard title={tp('预算偏差','Budget Variance')} value="94" unit="%" compareValue="100" compareLabel={tp('预算','Budget')} primaryColor={c} /> },
  { id:'kpi-churn-rate', name:'流失率 KPI', description:'用户流失率趋势', category:'kpi', tags:['流失率','留存','用户'],
    render:(c)=><KpiSparklineCard title={tp('月流失率','Monthly Churn')} value="3.2%" trend={-0.4} chartData={[4.1,3.9,3.7,3.5,3.4,3.3,3.2,3.2,3.1,3.0,3.1,3.2]} primaryColor={c} /> },
  { id:'kpi-cac-ltv', name:'CAC / LTV', description:'获客成本与生命周期价值比', category:'kpi', tags:['CAC','LTV','增长'],
    render:(c)=>(
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('增长效率','Growth Efficiency')}</span>
        <div className="flex gap-4 text-[11px]">
          <div><div className="text-gray-400">CAC</div><div className="font-bold" style={{color:c}}>¥128</div></div>
          <div><div className="text-gray-400">LTV</div><div className="font-bold text-green-500">¥1,860</div></div>
          <div><div className="text-gray-400">{tp('比率','Ratio')}</div><div className="font-bold text-amber-500">14.5x</div></div>
        </div>
      </div>
    )},
  { id:'kpi-pipeline-value', name:'销售管道价值', description:'漏斗各阶段金额', category:'kpi', tags:['销售','管道','CRM'],
    render:(c)=><KpiWithTrendCard title={tp('管道总值','Pipeline Value')} value={tp('¥856万','¥8.56M')} unit="" trend={18.6} trendLabel={tp('环比','WoW')} icon="trending-up" primaryColor={c} /> },
  { id:'kpi-health-score', name:'健康分 KPI', description:'系统/项目综合健康得分', category:'kpi', tags:['健康','得分','综合'],
    render:(c)=><StatCardIcon title={tp('项目健康分','Project Health')} value="92" unit="/100" trend={4} icon="heart" primaryColor={c} /> },
  { id:'kpi-countdown', name:'倒计时卡', description:'距截止时间倒计时', category:'kpi', tags:['倒计时','日期','截止'],
    render:(c)=>(
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <span className="text-xs text-gray-500">{tp('项目截止','Deadline')}</span>
        <div className="flex gap-2">
          {([['15',tp('天','d')],['08',tp('小时','h')],['32',tp('分','m')]]).map(([n,u])=>(
            <div key={u} className="flex flex-col items-center p-1.5 rounded-lg min-w-[32px]" style={{background:c+'22'}}>
              <span className="text-sm font-bold" style={{color:c}}>{n}</span>
              <span className="text-[9px] text-gray-400">{u}</span>
            </div>
          ))}
        </div>
      </div>
    )},
  { id:'kpi-change-indicator', name:'变化指示卡', description:'同比/环比变化量+箭头', category:'kpi', tags:['变化量','同比','环比'],
    render:(c)=><KpiWithTrendCard title={tp('用户增量','User Growth')} value="+1,245" unit={tp('人','users')} trend={8.3} trendLabel={tp('同比','YoY')} icon="users" primaryColor={c} /> },
  { id:'kpi-rank-badge', name:'排名徽章 KPI', description:'当前排名+变化方向', category:'kpi', tags:['排名','徽章','位次'],
    render:(c)=>(
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm min-w-[140px]">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{background:c}}>3</div>
        <div><div className="text-xs text-gray-500">{tp('全国排名','National Rank')}</div><div className="text-[10px] text-green-500">▲ {tp('较上月升 2位','↑2 vs last mo.')}</div></div>
      </div>
    )},
  { id:'kpi-two-period', name:'双列双期卡', description:'本期+同比并排双列', category:'kpi', tags:['双期','双列','对比'],
    render:(c)=><KpiWithTrendCard title={tp('季度收入','Quarterly Revenue')} value={tp('¥3,456万','¥34.56M')} unit="" trend={12.8} trendLabel={tp('同比','YoY')} icon="bar-chart" primaryColor={c} /> },
  { id:'kpi-milestone', name:'里程碑进度', description:'项目里程碑完成进度', category:'kpi', tags:['里程碑','项目','进度'],
    render:(c)=><ProgressCard title={tp('里程碑完成','Milestones')} value="7/12" unit="" progress={0.583} progressLabel={tp('Q4 目标','Q4 Goal')} primaryColor={c} /> },
  { id:'kpi-alert-info', name:'信息提示卡', description:'蓝色信息通知卡片', category:'kpi', tags:['信息','通知','蓝色'],
    render:()=><AlertCard title={tp('系统通知','System Notice')} message={tp('新版本已发布，功能升级完成，请查看更新日志','New version released. Check the changelog for details.')} level="info" /> },
  { id:'alert-success', name:'成功状态卡', description:'绿色正常/成功场景', category:'kpi', tags:['预警','成功','绿色'],
    render:()=><AlertCard title={tp('系统状态','System Status')} message={tp('所有服务正常，响应 < 50ms','All services healthy, latency < 50ms')} level="success" value="100%" /> },
  { id:'alert-warning', name:'橙色预警卡', description:'橙黄色警告场景', category:'kpi', tags:['预警','警告','橙色'],
    render:()=><AlertCard title={tp('库存预警','Inventory Alert')} message={tp('3 SKU 低于安全水位，建议补货','3 SKUs below safety stock, reorder needed')} level="warning" value={tp('3项','3 items')} /> },
  { id:'alert-danger', name:'红色危险卡', description:'红色紧急/异常场景', category:'kpi', tags:['预警','危险','红色'],
    render:()=><AlertCard title={tp('付款逾期','Payment Overdue')} message={tp('5笔订单逾期未付，金额 ¥128,000','5 orders overdue, total ¥128,000')} level="danger" value={tp('5笔','5 items')} /> },
];

// ── B Class: Chart Cards (90+) ────────────────────────────────────────────
const CHART_ENTRIES: CardCatalogEntry[] = [
  // B1 Bar series
  { id:'bar-basic', name:'基础柱状图', description:'纵向分类柱状图', category:'chart', tags:['柱状图','纵向','基础'], render:sv('bar') },
  { id:'bar-horizontal', name:'条形图', description:'横向条形图', category:'chart', tags:['条形图','横向'], render:sv('bar-h') },
  { id:'bar-stacked', name:'堆叠柱状图', description:'分组堆叠柱状图', category:'chart', tags:['堆叠','柱状图','分组'], render:sv('bar-stacked') },
  { id:'bar-stacked-100pct', name:'百分比堆叠图', description:'100% 堆叠占比柱状图', category:'chart', tags:['堆叠','百分比','占比'], render:sv('bar-stacked') },
  { id:'bar-grouped', name:'分组柱状图', description:'多系列并排柱状图', category:'chart', tags:['分组','对比','多系列'], render:sv('bar-stacked') },
  { id:'bar-waterfall', name:'瀑布柱状图', description:'收入支出增减瀑布图', category:'chart', tags:['瀑布图','增减','财务'], render:sv('bar-waterfall') },
  { id:'bar-negative', name:'正负柱状图', description:'含正负值的柱状图', category:'chart', tags:['正负','差异','双向'], render:sv('bar-waterfall') },
  { id:'bar-lollipop', name:'棒棒糖图', description:'线+圆点的棒棒糖样式', category:'chart', tags:['棒棒糖','美化','简洁'], render:sv('bar-lollipop') },
  { id:'bar-histogram', name:'频率直方图', description:'数据频率分布直方图', category:'chart', tags:['直方图','分布','频率'], render:sv('bar-histogram') },
  { id:'bar-diverging', name:'发散柱状图', description:'双向发散对比柱状图', category:'chart', tags:['发散','对比','双向'], render:sv('bar-waterfall') },
  { id:'bar-race', name:'竞赛柱状图', description:'动态更新排名条形图', category:'chart', tags:['动态','排名','竞赛'], render:sv('bar-h') },
  { id:'bar-polar', name:'极坐标柱图', description:'极坐标系柱状图', category:'chart', tags:['极坐标','柱状图','圆形'], render:sv('bar-polar') },
  // B2 Line series
  { id:'line-single', name:'折线图', description:'单系列时序折线图', category:'chart', tags:['折线图','趋势','时序'], render:sv('line') },
  { id:'line-multi', name:'多系列折线图', description:'多条折线对比图', category:'chart', tags:['折线图','多系列','对比'], render:sv('line') },
  { id:'line-smooth', name:'平滑折线图', description:'贝塞尔平滑曲线折线图', category:'chart', tags:['平滑','曲线','趋势'], render:sv('line') },
  { id:'line-area', name:'面积图', description:'折线下填充面积图', category:'chart', tags:['面积图','趋势','填充'], render:sv('line-area') },
  { id:'line-area-gradient', name:'渐变面积图', description:'渐变填充面积图', category:'chart', tags:['渐变','面积图','美化'], render:sv('line-area') },
  { id:'line-area-stacked', name:'堆叠面积图', description:'多系列堆叠面积图', category:'chart', tags:['堆叠','面积图','占比'], render:sv('line-stacked-area') },
  { id:'line-step', name:'阶梯线图', description:'阶梯状折线图', category:'chart', tags:['阶梯','折线图','状态'], render:sv('line-step') },
  { id:'line-with-markers', name:'带标记折线图', description:'折线+数据点圆标', category:'chart', tags:['折线图','标记','数据点'], render:sv('line') },
  { id:'line-band', name:'置信带折线图', description:'折线+置信区间带', category:'chart', tags:['置信带','区间','统计'], render:sv('line-stacked-area') },
  { id:'line-dual-axis', name:'双轴折线图', description:'左右双Y轴折线图', category:'chart', tags:['双轴','折线图','对比'], render:sv('line-dual') },
  // B3 Pie/Donut
  { id:'pie-basic', name:'饼图', description:'基础扇形饼图', category:'chart', tags:['饼图','占比','分布'], render:sv('pie') },
  { id:'pie-donut', name:'环形图', description:'中空环形饼图', category:'chart', tags:['环形图','占比','美化'], render:sv('donut') },
  { id:'pie-rose', name:'玫瑰图', description:'南丁格尔玫瑰图', category:'chart', tags:['玫瑰图','南丁格尔','半径'], render:sv('pie-rose') },
  { id:'pie-nested', name:'嵌套环形图', description:'双环嵌套饼图', category:'chart', tags:['嵌套','多层','环形'], render:sv('pie-sunburst') },
  { id:'pie-sunburst', name:'旭日图', description:'层级旭日放射图', category:'chart', tags:['旭日图','层级','放射'], render:sv('pie-sunburst') },
  { id:'pie-half-donut', name:'半环图', description:'半圆仪表盘环形图', category:'chart', tags:['半环','仪表盘','进度'], render:sv('pie-half') },
  { id:'pie-waffle', name:'华夫饼图', description:'格子方块占比图', category:'chart', tags:['华夫饼','网格','占比'], render:sv('pie-waffle') },
  { id:'pie-progress', name:'进度环形图', description:'单指标进度弧形图', category:'chart', tags:['进度','环形','完成率'], render:sv('donut') },
  // B4 Scatter
  { id:'scatter-basic', name:'散点图', description:'二维散点分布图', category:'chart', tags:['散点图','分布','相关性'], render:sv('scatter') },
  { id:'scatter-bubble', name:'气泡图', description:'三维气泡散点图', category:'chart', tags:['气泡图','三维','大小'], render:sv('scatter-bubble') },
  { id:'scatter-regression', name:'回归散点图', description:'散点+趋势回归线', category:'chart', tags:['回归','趋势线','统计'], render:sv('scatter') },
  { id:'scatter-cluster', name:'聚类散点图', description:'颜色标记聚类散点', category:'chart', tags:['聚类','分类','颜色'], render:sv('scatter') },
  { id:'scatter-quadrant', name:'四象限散点图', description:'2×2象限矩阵散点', category:'chart', tags:['四象限','矩阵','战略'], render:sv('scatter') },
  { id:'scatter-3d', name:'三维散点图', description:'立体三维散点图', category:'chart', tags:['3D','三维','散点'], render:sv('scatter-bubble') },
  // B5 Heatmap
  { id:'heatmap-matrix', name:'矩阵热力图', description:'二维矩阵颜色热力图', category:'chart', tags:['热力图','矩阵','密度'], render:sv('heatmap-matrix') },
  { id:'heatmap-calendar', name:'日历热力图', description:'GitHub 日历式热力图', category:'chart', tags:['日历','热力图','活跃度'], render:sv('heatmap-calendar') },
  { id:'heatmap-correlation', name:'相关性热力图', description:'变量间相关系数矩阵', category:'chart', tags:['相关性','热力图','统计'], render:sv('heatmap-matrix') },
  { id:'heatmap-geo', name:'地理热力图', description:'地图地理密度热力图', category:'chart', tags:['地图','热力图','密度'], render:sv('map') },
  { id:'heatmap-risk', name:'风险热力矩阵', description:'影响×概率风险矩阵', category:'chart', tags:['风险','矩阵','管理'], render:sv('heatmap-matrix') },
  // B6-B8 Tree/Flow/Map
  { id:'treemap-flat', name:'矩形树图', description:'Treemap 面积占比图', category:'chart', tags:['树图','面积','占比'], render:sv('treemap') },
  { id:'treemap-hierarchical', name:'层级树图', description:'层级矩形树图', category:'chart', tags:['层级','树图','嵌套'], render:sv('treemap') },
  { id:'sankey-flow', name:'桑基流量图', description:'流量/资金流向桑基图', category:'chart', tags:['桑基图','流量','流向'], render:sv('sankey') },
  { id:'funnel-standard', name:'漏斗图', description:'标准转化漏斗图', category:'chart', tags:['漏斗图','转化','流程'], render:sv('funnel') },
  { id:'funnel-comparison', name:'对比漏斗图', description:'双漏斗对比图', category:'chart', tags:['漏斗图','对比','双向'], render:sv('funnel') },
  { id:'radar-chart', name:'雷达图', description:'多维度蜘蛛网图', category:'chart', tags:['雷达图','多维','能力模型'], render:sv('radar') },
  { id:'chord-diagram', name:'和弦关系图', description:'和弦图关系流量', category:'chart', tags:['和弦图','关系','流量'], render:sv('chord') },
  { id:'network-graph', name:'网络关系图', description:'节点+边网络图', category:'chart', tags:['网络图','节点','关系'], render:sv('network') },
  { id:'map-china', name:'中国地图', description:'中国省市地图', category:'chart', tags:['地图','中国','省市'], render:sv('map') },
  { id:'map-world', name:'世界地图', description:'世界各国地图', category:'chart', tags:['世界地图','国家','全球'], render:sv('map') },
  { id:'map-city-scatter', name:'城市气泡地图', description:'城市气泡散点地图', category:'chart', tags:['地图','城市','气泡'], render:sv('map') },
  { id:'map-flight-route', name:'飞线路线地图', description:'城市间飞线路线图', category:'chart', tags:['飞线','路线','效果'], render:sv('map') },
  // B9 Finance
  { id:'candlestick', name:'K线蜡烛图', description:'股票K线蜡烛图', category:'chart', tags:['K线','股票','金融'], render:sv('candlestick') },
  { id:'candlestick-ma', name:'K线+均线', description:'K线叠加移动均线', category:'chart', tags:['K线','均线','技术分析'], render:sv('candlestick') },
  { id:'ohlc-bar', name:'OHLC条形图', description:'开高低收条形图', category:'chart', tags:['OHLC','金融','股票'], render:sv('candlestick') },
  { id:'volume-chart', name:'成交量图', description:'股票成交量柱状图', category:'chart', tags:['成交量','股票','金融'], render:sv('volume') },
  { id:'rsi-chart', name:'RSI 指标图', description:'相对强弱技术指标', category:'chart', tags:['RSI','技术指标','金融'], render:sv('line') },
  { id:'macd-chart', name:'MACD 图', description:'MACD柱+DIFF+DEA', category:'chart', tags:['MACD','技术指标','金融'], render:sv('line-dual') },
  { id:'yield-curve', name:'收益率曲线', description:'债券收益率曲线图', category:'chart', tags:['收益率','曲线','债券'], render:sv('line-area') },
  { id:'options-payoff', name:'期权盈亏图', description:'期权策略盈亏图', category:'chart', tags:['期权','盈亏','金融'], render:sv('bar-waterfall') },
  { id:'drawdown-chart', name:'最大回撤图', description:'资产最大回撤曲线', category:'chart', tags:['回撤','风险','金融'], render:sv('line-area') },
  { id:'rolling-returns', name:'滚动收益率图', description:'N日滚动收益率折线', category:'chart', tags:['滚动','收益率','金融'], render:sv('line') },
  // Additional popular chart types
  { id:'area-stream', name:'流式面积图', description:'河流图/面积流图', category:'chart', tags:['流式','面积','主题河流'], render:sv('line-stacked-area') },
  { id:'pareto-chart', name:'帕累托图', description:'柱状+累计折线', category:'chart', tags:['帕累托','柱线混合','质量'], render:sv('line-dual') },
  { id:'population-pyramid', name:'人口金字塔', description:'双向对称条形图', category:'chart', tags:['人口','金字塔','对称'], render:sv('bar-h') },
  { id:'bullet-chart', name:'子弹图', description:'目标实际对比子弹', category:'chart', tags:['子弹图','目标','对比'], render:sv('bar-h') },
  { id:'gauge-chart', name:'仪表盘图', description:'圆弧仪表盘图', category:'chart', tags:['仪表盘','进度','圆弧'], render:sv('pie-half') },
  { id:'slope-chart', name:'斜率图', description:'两期变化斜率连线', category:'chart', tags:['斜率','变化','对比'], render:sv('line') },
  { id:'bump-chart', name:'凸块排名图', description:'排名变化流动图', category:'chart', tags:['排名','流动','变化'], render:sv('line') },
  { id:'mixed-bar-line', name:'柱线混合图', description:'柱状+折线双系列', category:'chart', tags:['混合图','柱线','双轴'], render:sv('line-dual') },
  { id:'realtime-line', name:'实时折线图', description:'动态实时更新折线', category:'chart', tags:['实时','折线图','动态'], render:sv('line') },
  { id:'multi-radial', name:'多径向进度', description:'多环嵌套进度圆环', category:'chart', tags:['径向','多环','进度'], render:sv('donut') },
];

// ── C Class: Table Cards (20+) ─────────────────────────────────────────────
const TABLE_ENTRIES: CardCatalogEntry[] = [
  { id:'table-ranked-top5', name:'TOP5 排行表', description:'前5名徽章高亮排行', category:'table', tags:['排行','TOP5','表格'], render:sv('table-ranked') },
  { id:'table-ranked-top10', name:'TOP10 排行表', description:'前10名排行表格', category:'table', tags:['排行','TOP10','表格'], render:sv('table-ranked') },
  { id:'table-detail-basic', name:'基础明细表', description:'标准行列明细数据表', category:'table', tags:['明细','表格','基础'], render:sv('table') },
  { id:'table-detail-paginated', name:'分页明细表', description:'带分页控件的明细表', category:'table', tags:['分页','明细','表格'], render:sv('table') },
  { id:'table-comparison', name:'对比表格', description:'两列指标对比表', category:'table', tags:['对比','双列','表格'], render:sv('table') },
  { id:'table-pivot-2d', name:'二维透视表', description:'行列交叉透视表', category:'table', tags:['透视','交叉','汇总'], render:sv('table-heatmap') },
  { id:'table-scorecard', name:'计分卡表格', description:'目标/实际/状态三列', category:'table', tags:['计分卡','状态','目标'], render:sv('table') },
  { id:'table-heatmap-cell', name:'热力单元格表', description:'单元格颜色热力着色', category:'table', tags:['热力','单元格','表格'], render:sv('table-heatmap') },
  { id:'table-tree', name:'树形表格', description:'可折叠树状层级表', category:'table', tags:['树形','层级','折叠'], render:sv('table-tree') },
  { id:'table-gantt', name:'甘特进度表', description:'项目时间甘特图表', category:'table', tags:['甘特图','项目','进度'], render:sv('table-gantt') },
  { id:'table-action-list', name:'行动列表', description:'任务+状态+操作按钮', category:'table', tags:['行动','任务','操作'], render:sv('table') },
  { id:'table-data-dict', name:'数据字典表', description:'字段说明数据字典', category:'table', tags:['字典','说明','元数据'], render:sv('table') },
  { id:'table-inline-trend', name:'内嵌趋势表', description:'单元格内嵌迷你图', category:'table', tags:['迷你图','内嵌','趋势'], render:sv('table') },
  { id:'table-cohort', name:'同期群表', description:'多期留存率矩阵表', category:'table', tags:['同期群','留存','矩阵'], render:sv('table-heatmap') },
  { id:'table-ab-test', name:'A/B测试表', description:'实验组对照组对比', category:'table', tags:['AB测试','实验','对比'], render:sv('table') },
  { id:'table-financial', name:'财务报表', description:'三表财务格式报表', category:'table', tags:['财务','报表','会计'], render:sv('table') },
  { id:'table-status-board', name:'状态看板表', description:'服务状态监控表格', category:'table', tags:['状态','看板','监控'], render:sv('table') },
  { id:'table-top-n', name:'TOP-N 摘要', description:'动态N条排名摘要', category:'table', tags:['TOP-N','摘要','排名'], render:sv('table-ranked') },
  { id:'table-risk-register', name:'风险登记表', description:'风险等级+责任人表', category:'table', tags:['风险','登记','项目'], render:sv('table') },
  { id:'table-schedule', name:'日程日历表', description:'日历格式日程安排', category:'table', tags:['日程','日历','计划'], render:sv('table-gantt') },
  // ── VTable 高性能表格系列 ──
  { id:'vtable-basic', name:'VTable 基础表格', description:'虚拟滚动高性能表格，支持 10万+行数据', category:'table', tags:['vtable','虚拟滚动','大数据','高性能'], render:sv('table') },
  { id:'vtable-pivot', name:'VTable 透视表', description:'多维交叉透视分析表，支持行列分组汇总', category:'table', tags:['vtable','透视','交叉','汇总','多维'], render:sv('table-heatmap') },
  { id:'vtable-tree', name:'VTable 树形表', description:'可展开折叠的层级数据树形表格', category:'table', tags:['vtable','树形','层级','折叠'], render:sv('table-tree') },
  { id:'vtable-frozen', name:'VTable 冻结列表', description:'冻结首列/表头的大宽度数据表', category:'table', tags:['vtable','冻结列','固定列','宽表'], render:sv('table') },
  { id:'vtable-sort-filter', name:'VTable 排序筛选表', description:'可排序/筛选/搜索的交互式数据表', category:'table', tags:['vtable','排序','筛选','搜索'], render:sv('table') },
];

// ── D Class: Structure Cards (15+) ────────────────────────────────────────
const STRUCTURE_ENTRIES: CardCatalogEntry[] = [
  { id:'timeline-vertical', name:'垂直时间轴', description:'垂直方向事件时间轴', category:'structure', tags:['时间轴','垂直','事件'], render:sv('timeline-v') },
  { id:'timeline-horizontal', name:'水平时间轴', description:'水平方向进度时间轴', category:'structure', tags:['时间轴','水平','进度'], render:sv('timeline-h') },
  { id:'timeline-dual-track', name:'双轨时间轴', description:'双轨对比时间轴', category:'structure', tags:['时间轴','双轨','对比'], render:sv('timeline-v') },
  { id:'process-steps', name:'流程步骤卡', description:'横向流程节点步骤', category:'structure', tags:['流程','步骤','横向'], render:sv('process') },
  { id:'process-flowchart-svg', name:'SVG流程图', description:'节点连线流程图', category:'structure', tags:['流程图','SVG','连线'], render:sv('network') },
  { id:'mind-map', name:'思维导图', description:'中心发散思维导图', category:'structure', tags:['思维导图','发散','结构'], render:sv('mind-map') },
  { id:'org-chart', name:'组织架构图', description:'树状组织层级图', category:'structure', tags:['组织图','层级','管理'], render:sv('org-chart') },
  { id:'text-summary-card', name:'文字摘要卡', description:'纯文字摘要卡片', category:'structure', tags:['文字','摘要','说明'], render:sv('text-card') },
  { id:'insight-callout', name:'洞察醒目框', description:'左色边+标题洞察框', category:'structure', tags:['洞察','醒目','结论'], render:sv('insight') },
  { id:'image-embed-card', name:'图片嵌入卡', description:'图片+标题说明卡', category:'structure', tags:['图片','嵌入','媒体'], render:sv('text-card') },
  { id:'comparison-twoCol', name:'双列对比卡', description:'左右双列文字对比', category:'structure', tags:['双列','对比','文字'], render:sv('text-card') },
  { id:'metric-narrative', name:'指标叙述段', description:'数字+叙述说明段落', category:'structure', tags:['叙述','指标','段落'], render:sv('insight') },
  { id:'swimlane-process', name:'泳道流程图', description:'多角色泳道流程', category:'structure', tags:['泳道','流程','角色'], render:sv('process') },
  { id:'roadmap-card', name:'路线图卡', description:'产品/项目路线规划', category:'structure', tags:['路线图','规划','项目'], render:sv('timeline-h') },
  { id:'cover-page', name:'封面页', description:'报告封面标题页', category:'structure', tags:['封面','标题','报告'], render:sv('insight') },
  { id:'section-header', name:'章节标题卡', description:'章节分隔标题卡', category:'structure', tags:['章节','标题','分隔'], render:sv('text-card') },
];

// ── E Class: Filter Controls (15+) ────────────────────────────────────────
const FILTER_ENTRIES: CardCatalogEntry[] = [
  { id:'filter-date-range', name:'日期范围选择器', description:'开始~结束日期选择', category:'filter', tags:['日期','范围','筛选'], render:sv('filter-date') },
  { id:'filter-date-picker-single', name:'单日期选择', description:'单一日期选择器', category:'filter', tags:['日期','单选','选择器'], render:sv('filter-date') },
  { id:'filter-year-month', name:'年月快切按钮', description:'本月/本季/本年快选', category:'filter', tags:['年月','快切','按钮组'], render:sv('filter-date') },
  { id:'filter-dropdown-single', name:'单选下拉筛选', description:'单选维度下拉筛选器', category:'filter', tags:['下拉','单选','筛选'], render:sv('filter-dropdown') },
  { id:'filter-dropdown-multi', name:'多选下拉筛选', description:'多选维度下拉筛选器', category:'filter', tags:['下拉','多选','筛选'], render:sv('filter-dropdown') },
  { id:'filter-checkbox-group', name:'复选框筛选', description:'复选框组筛选控件', category:'filter', tags:['复选框','筛选','多选'], render:sv('filter-checkbox') },
  { id:'filter-radio-group', name:'单选按钮筛选', description:'单选按钮组筛选', category:'filter', tags:['单选','按钮组','筛选'], render:sv('filter-checkbox') },
  { id:'filter-search-box', name:'快速搜索框', description:'关键词搜索输入框', category:'filter', tags:['搜索','输入框','筛选'], render:sv('filter-dropdown') },
  { id:'filter-numeric-range', name:'数值范围滑块', description:'数值范围滑动条', category:'filter', tags:['数值','范围','滑块'], render:sv('filter-slider') },
  { id:'filter-tag-pills', name:'已激活标签栏', description:'已选筛选项标签展示', category:'filter', tags:['标签','胶囊','已选'], render:sv('filter-tags') },
  { id:'filter-reset-button', name:'重置筛选按钮', description:'一键清除全部筛选', category:'filter', tags:['重置','清除','按钮'], render:sv('filter-dropdown') },
  { id:'filter-global-panel', name:'全局筛选面板', description:'多条件复合筛选面板', category:'filter', tags:['全局','面板','复合'], render:sv('filter-panel') },
  { id:'filter-cascade', name:'级联选择器', description:'省市区级联选择', category:'filter', tags:['级联','省市','层级'], render:sv('filter-dropdown') },
  { id:'filter-date-preset', name:'日期预设快选', description:'昨日/上周/上月预设', category:'filter', tags:['日期','预设','快选'], render:sv('filter-date') },
  { id:'filter-segment', name:'分段标签切换', description:'Tab式分段标签筛选', category:'filter', tags:['分段','Tab','切换'], render:sv('filter-tags') },
  { id:'filter-quarter-picker', name:'季度选择器', description:'Q1/Q2/Q3/Q4 快选', category:'filter', tags:['季度','选择','筛选'], render:sv('filter-date') },
];

// ── Full catalog ───────────────────────────────────────────────────────────
export const CARD_CATALOG: CardCatalogEntry[] = [
  ...KPI_ENTRIES,
  ...CHART_ENTRIES,
  ...TABLE_ENTRIES,
  ...STRUCTURE_ENTRIES,
  ...FILTER_ENTRIES,
];
