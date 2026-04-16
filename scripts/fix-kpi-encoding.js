#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'resources', 'system_knowledge', 'cards');

const fixes = [
  {
    id: 'kpi-gross-margin',
    name: '毛利率指标卡',
    description: '展示销售毛利率百分比及同比/环比变化，适合销售绩效分析、产品定价评估、利润中心报告',
    tags: ['kpi','gross margin','毛利率','利润率','销售','定价'],
    cssClass: 'kpi-comparison',
    exampleHtml: "<div class='card' style='padding:16px'><div style='font-size:12px;color:var(--text-sub)'>毛利率</div><div style='font-size:32px;font-weight:900;color:var(--color-primary)'>42.8%</div><div style='font-size:11px;color:var(--color-success)'>▲ 1.5pp vs 上季</div></div>",
    variants: ['净利率','净利润额','贡献毛利'],
    relatedCards: ['kpi-ebitda','kpi-single'],
  },
  {
    id: 'kpi-avg-deal-size',
    name: '平均订单金额(AOV)卡',
    description: '展示平均成交金额/客单价，含月度趋势和分组对比，适合销售绩效分析、定价策略、电商收入分析',
    tags: ['kpi','AOV','average order value','客单价','销售','电商'],
    cssClass: 'kpi-comparison',
    exampleHtml: "<div class='card' style='padding:16px'><div style='font-size:12px;color:var(--text-sub)'>平均订单金额(AOV)</div><div style='font-size:32px;font-weight:900;color:var(--text-accent)'>¥ 3,840</div><div style='font-size:11px;color:var(--color-success)'>▲ 8.3% vs 上月</div></div>",
    variants: ['中位成交价','高价值客户AOV','产品线AOV'],
    relatedCards: ['kpi-revenue-by-segment','kpi-single'],
  },
  {
    id: 'kpi-win-rate',
    name: '赢单率指标卡',
    description: '展示销售机会赢单率，含本期赢单/输单数量对比，适合 CRM 漏斗健康分析、销售绩效考核',
    tags: ['kpi','win rate','赢单率','CRM','销售','机会转化'],
    cssClass: 'kpi-dual-compare',
    exampleHtml: "<div class='card' style='padding:16px'><div style='font-size:12px;color:var(--text-sub)'>赢单率</div><div style='font-size:32px;font-weight:900;color:var(--color-success)'>38.4%</div><div style='display:flex;gap:12px;margin-top:8px;font-size:11px'><span style='color:var(--color-success)'>赢单 46</span><span style='color:var(--color-danger)'>输单 74</span></div></div>",
    variants: ['阶段转化率','竞争失败率','平均销售周期'],
    relatedCards: ['kpi-sales-velocity','kpi-pipeline-value'],
  },
  {
    id: 'kpi-quota-attainment',
    name: '销售配额完成率进度环',
    description: '使用进度环展示销售团队或个人相对配额的完成率，适合 CRM 看板、销售激励追踪、月度业绩报告',
    tags: ['kpi','quota','配额','完成率','销售达成','绩效','进度环'],
    cssClass: 'kpi-ring-progress',
    exampleHtml: "<div class='card' style='padding:16px;text-align:center'><div style='font-size:12px;color:var(--text-sub)'>配额完成率</div><div class='kpi-ring-wrap' style='margin:8px 0'><svg viewBox='0 0 64 64' width='80' height='80'><circle cx='32' cy='32' r='28' fill='none' stroke='var(--bg-card-alt)' stroke-width='8'/><circle cx='32' cy='32' r='28' fill='none' stroke='var(--color-primary)' stroke-width='8' stroke-dasharray='123 176' stroke-linecap='round' transform='rotate(-90 32 32)'/></svg></div><div style='font-size:24px;font-weight:900'>78%</div></div>",
    variants: ['团队配额达成','产品线配额','区域配额排名'],
    relatedCards: ['kpi-milestone-progress','kpi-target-bar'],
  },
  {
    id: 'kpi-sales-velocity',
    name: '销售速度/成交周期卡',
    description: '展示平均销售周期天数及各阶段耗时，适合销售流程优化、漏斗健康分析、效能提升报告',
    tags: ['kpi','sales velocity','成交周期','销售速度','CRM','销售效率','pipeline'],
    cssClass: 'kpi-change-indicator',
    exampleHtml: "<div class='card' style='padding:16px'><div style='font-size:12px;color:var(--text-sub)'>平均成交周期</div><div style='font-size:32px;font-weight:900;color:var(--text-accent)'>32 天</div><div style='font-size:11px;color:var(--color-success)'>▼ 4天 (-11%) vs 上季</div></div>",
    variants: ['SMB成交周期','大客户成交周期','销售速率指数'],
    relatedCards: ['kpi-win-rate','kpi-pipeline-value'],
  },
];

for (const c of fixes) {
  const obj = {
    id: c.id,
    type: 'card',
    category: 'A',
    name: c.name,
    description: c.description,
    tags: c.tags,
    cssClass: c.cssClass,
    engineHint: 'pure-html',
    exampleHtml: c.exampleHtml,
    variants: c.variants,
    relatedCards: c.relatedCards,
  };
  fs.writeFileSync(path.join(dir, c.id + '.json'), JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  console.log('[fixed]', c.id);
}
console.log('Done.');
