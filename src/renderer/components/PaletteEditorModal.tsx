/**
 * PaletteEditorModal.tsx
 *
 * Full-featured modal for creating or editing a custom PalettePreset.
 * Sections: Base colors, Typography, Card styles, Page background, Chart colors.
 */

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { PalettePreset, PaletteCategory } from '../types';
import { PALETTE_CATEGORY_NAMES, PALETTE_CATEGORIES } from '../types';

interface PaletteEditorModalProps {
  /** Existing palette to edit; undefined = create new */
  initial?: PalettePreset;
  onSave: (palette: PalettePreset) => void;
  onCancel: () => void;
}

type Section = 'base' | 'typography' | 'card' | 'background' | 'charts';

const FONT_OPTIONS = [
  { label: '系统默认', value: '' },
  { label: '思源黑体', value: '"Source Han Sans", "Noto Sans SC", sans-serif' },
  { label: '思源宋体', value: '"Source Han Serif", "Noto Serif SC", serif' },
  { label: '等宽字体', value: '"Courier New", Courier, monospace' },
  { label: 'Inter（英文）', value: 'Inter, system-ui, sans-serif' },
];

const ECHARTS_THEMES = ['default', 'dark', 'vintage', 'macarons', 'shine', 'walden', 'westeros', 'wonderland', 'roma'];

const DEFAULT_NEW: PalettePreset = {
  id: '',
  name: '新建配色',
  category: 'custom',
  description: '',
  colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'],
  primary: '#3b82f6',
  bodyBg: '#f8fafc',
  cardBg: '#ffffff',
  textColor: '#1e293b',
  subTextColor: '#64748b',
  isDark: false,
  isCustom: true,
};

const ColorRow: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}> = ({ label, value, onChange, hint }) => (
  <div className="flex items-center gap-3">
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer flex-shrink-0 p-0.5"
    />
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={9}
      className="w-24 text-xs text-center font-mono border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
    />
  </div>
);

const SectionHeader: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
}> = ({ title, open, onToggle }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 w-full text-left py-2 font-semibold text-sm text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
  >
    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
    {title}
  </button>
);

const PaletteEditorModal: React.FC<PaletteEditorModalProps> = ({ initial, onSave, onCancel }) => {
  const [palette, setPalette] = useState<PalettePreset>(
    initial ? { ...initial, isCustom: true } : { ...DEFAULT_NEW, id: `palette-custom-${uuidv4().slice(0, 8)}` }
  );
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(['base']));

  const patch = (updates: Partial<PalettePreset>) => setPalette((p) => ({ ...p, ...updates }));

  const toggleSection = (s: Section) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const updateColor = (index: number, value: string) => {
    const colors = [...palette.colors];
    colors[index] = value;
    patch({ colors });
  };

  const addColor = () => {
    if (palette.colors.length < 10) patch({ colors: [...palette.colors, '#888888'] });
  };

  const removeColor = (index: number) => {
    if (palette.colors.length > 3) {
      const colors = palette.colors.filter((_, i) => i !== index);
      patch({ colors });
    }
  };

  const handleSave = () => {
    if (!palette.name.trim()) return;
    onSave({ ...palette, isCustom: true });
  };

  const isOpen = (s: Section) => openSections.has(s);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold">
            {initial ? '编辑配色方案' : '新建配色方案'}
          </h3>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {/* Name + category */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">方案名称</label>
              <input
                type="text"
                value={palette.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="如：企业蓝调"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">分类</label>
              <select
                value={palette.category || 'custom'}
                onChange={(e) => patch({ category: e.target.value as PaletteCategory })}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              >
                {PALETTE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{PALETTE_CATEGORY_NAMES[cat]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">描述（可选）</label>
            <input
              type="text"
              value={palette.description || ''}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="简略描述该配色方案"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
          </div>

          {/* Section: Base Colors */}
          <SectionHeader title="基础颜色" open={isOpen('base')} onToggle={() => toggleSection('base')} />
          {isOpen('base') && (
            <div className="pl-5 space-y-3 pb-3">
              <ColorRow label="主强调色" value={palette.primary} onChange={(v) => patch({ primary: v })} hint="按钮、活跃指示器等" />
              <ColorRow label="页面背景" value={palette.bodyBg} onChange={(v) => patch({ bodyBg: v })} />
              <ColorRow label="卡片背景" value={palette.cardBg} onChange={(v) => patch({ cardBg: v })} />
              <ColorRow label="正文颜色" value={palette.textColor} onChange={(v) => patch({ textColor: v })} />
              <ColorRow label="次要文字" value={palette.subTextColor || '#94a3b8'} onChange={(v) => patch({ subTextColor: v })} hint="标签、描述文字" />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isDark"
                  checked={palette.isDark}
                  onChange={(e) => patch({ isDark: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="isDark" className="text-sm">深色(Dark)主题</label>
              </div>

              {/* Chart colors */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">图表调色盘（{palette.colors.length} 色）</span>
                  <button
                    onClick={addColor}
                    disabled={palette.colors.length >= 10}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={12} /> 添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {palette.colors.map((c, i) => (
                    <div key={i} className="relative group flex items-center gap-1">
                      <input
                        type="color"
                        value={c}
                        onChange={(e) => updateColor(i, e.target.value)}
                        className="w-8 h-8 rounded-full border-2 border-gray-200 cursor-pointer p-0"
                        title={`颜色 ${i + 1}: ${c}`}
                      />
                      {palette.colors.length > 3 && (
                        <button
                          onClick={() => removeColor(i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] items-center justify-center hidden group-hover:flex"
                        >
                          <Trash2 size={8} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section: Typography */}
          <SectionHeader title="排版设置" open={isOpen('typography')} onToggle={() => toggleSection('typography')} />
          {isOpen('typography') && (
            <div className="pl-5 space-y-3 pb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">标题颜色（留空=使用正文颜色）</label>
              <input
                type="color"
                value={palette.headingColor || palette.textColor}
                onChange={(e) => patch({ headingColor: e.target.value })}
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              {[
                { label: '标题字体', key: 'titleFontFamily' as const },
                { label: '正文字体', key: 'bodyFontFamily' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <select
                    value={palette[key] || ''}
                    onChange={(e) => patch({ [key]: e.target.value || undefined })}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">标题字号</label>
                  <input
                    type="text"
                    value={palette.titleFontSize || ''}
                    onChange={(e) => patch({ titleFontSize: e.target.value || undefined })}
                    placeholder="如 1.5rem"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">正文字号</label>
                  <input
                    type="text"
                    value={palette.bodyFontSize || ''}
                    onChange={(e) => patch({ bodyFontSize: e.target.value || undefined })}
                    placeholder="如 0.875rem"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Card Styles */}
          <SectionHeader title="卡片样式" open={isOpen('card')} onToggle={() => toggleSection('card')} />
          {isOpen('card') && (
            <div className="pl-5 space-y-3 pb-3">
              <ColorRow
                label="卡片边框颜色"
                value={palette.cardBorderColor || '#e2e8f0'}
                onChange={(v) => patch({ cardBorderColor: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '边框粗细', key: 'cardBorderWidth' as const, placeholder: '如 1px' },
                  { label: '圆角', key: 'cardRadius' as const, placeholder: '如 12px' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <input
                      type="text"
                      value={palette[key] || ''}
                      onChange={(e) => patch({ [key]: e.target.value || undefined })}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">阴影 (CSS box-shadow，留空=无)</label>
                <input
                  type="text"
                  value={palette.cardShadow || ''}
                  onChange={(e) => patch({ cardShadow: e.target.value || undefined })}
                  placeholder="如 0 4px 12px rgba(0,0,0,0.08)"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">卡片背景图/渐变（CSS background，留空=使用卡片背景色）</label>
                <input
                  type="text"
                  value={palette.cardBgImage || ''}
                  onChange={(e) => patch({ cardBgImage: e.target.value || undefined })}
                  placeholder="如 linear-gradient(135deg, #f0f9ff, #e0f2fe)"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Section: Background */}
          <SectionHeader title="页面背景" open={isOpen('background')} onToggle={() => toggleSection('background')} />
          {isOpen('background') && (
            <div className="pl-5 space-y-3 pb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">背景渐变/图案（CSS background，覆盖背景色）</label>
                <input
                  type="text"
                  value={palette.bodyBgImage || ''}
                  onChange={(e) => patch({ bodyBgImage: e.target.value || undefined })}
                  placeholder="如 linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">背景图片 URL（background-image）</label>
                <input
                  type="text"
                  value={palette.bodyBgUrl || ''}
                  onChange={(e) => patch({ bodyBgUrl: e.target.value || undefined })}
                  placeholder="https://... 或 data:image/..."
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Section: Chart Colors */}
          <SectionHeader title="图表引擎颜色" open={isOpen('charts')} onToggle={() => toggleSection('charts')} />
          {isOpen('charts') && (
            <div className="pl-5 space-y-3 pb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ECharts 内置主题</label>
                <select
                  value={palette.echartsTheme || ''}
                  onChange={(e) => patch({ echartsTheme: e.target.value || undefined })}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 focus:outline-none"
                >
                  <option value="">default（使用上方调色盘）</option>
                  {ECHARTS_THEMES.filter((t) => t !== 'default').map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  ApexCharts 专用颜色（留空=使用调色盘）
                </label>
                <div className="flex flex-wrap gap-2">
                  {(palette.apexColors || palette.colors).map((c, i) => (
                    <input
                      key={i}
                      type="color"
                      value={c}
                      onChange={(e) => {
                        const apexColors = [...(palette.apexColors || palette.colors)];
                        apexColors[i] = e.target.value;
                        patch({ apexColors });
                      }}
                      className="w-8 h-8 rounded-full border-2 border-gray-200 cursor-pointer p-0"
                      title={`ApexCharts 颜色 ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => patch({ apexColors: undefined })}
                  className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  重置为调色盘颜色
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {/* Preview swatch */}
          <div className="flex items-center gap-1.5">
            {palette.colors.slice(0, 5).map((c, i) => (
              <span key={i} className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-600" style={{ background: c }} />
            ))}
            <span className="text-sm text-gray-500 ml-1">{palette.name}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!palette.name.trim()}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaletteEditorModal;
