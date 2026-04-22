import React, { useMemo, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';
import type { RegistrySkillManifest } from '../../shared/skills';
import { useI18n } from '../i18n';
import {
  parseRegistrySkillTools,
  serializeRegistrySkillTools,
  slugifySkillId,
  validateRegistrySkillManifest,
} from '../skills/registryHelpers';

interface RegistrySkillEditorModalProps {
  initial: RegistrySkillManifest;
  locale: 'zh-CN' | 'en-US';
  onCancel: () => void;
  onSave: (manifest: RegistrySkillManifest) => Promise<void> | void;
}

export default function RegistrySkillEditorModal({
  initial,
  locale,
  onCancel,
  onSave,
}: RegistrySkillEditorModalProps) {
  const { t } = useI18n();
  const text = useMemo(() => (
    locale === 'en-US'
      ? {
          title: initial.id ? 'Edit Registry Skill' : 'Create Registry Skill',
          subtitle: 'Registry skills are stored under datellData/skills/registry/user.',
          idLabel: 'Skill ID',
          idHint: 'Lowercase kebab-case. Leave blank to auto-generate from the name.',
          nameLabel: 'Skill Name',
          versionLabel: 'Version',
          descriptionLabel: 'Description',
          toolsLabel: 'Tools JSON',
          toolsHint: 'Provide an array of runtime tools. Each tool must include name, description, parameters, and code.',
          descriptionPlaceholder: 'Describe what this registry skill does and when it should be used.',
          toolsPlaceholder: '[\n  {\n    "name": "tool_name",\n    "description": "What the tool does",\n    "parameters": [],\n    "code": "return \"ok\";"\n  }\n]',
          saving: 'Saving…',
        }
      : {
          title: initial.id ? '编辑注册表技能' : '新建注册表技能',
          subtitle: '注册表技能会保存到 datellData/skills/registry/user。',
          idLabel: '技能 ID',
          idHint: '使用小写 kebab-case。留空时会根据名称自动生成。',
          nameLabel: '技能名称',
          versionLabel: '版本号',
          descriptionLabel: '技能描述',
          toolsLabel: '工具 JSON',
          toolsHint: '填写运行时工具数组。每个工具都必须包含 name、description、parameters 和 code。',
          descriptionPlaceholder: '说明该注册表技能做什么，以及何时应该使用。',
          toolsPlaceholder: '[\n  {\n    "name": "tool_name",\n    "description": "工具用途",\n    "parameters": [],\n    "code": "return \"ok\";"\n  }\n]',
          saving: '保存中…',
        }
  ), [initial.id, locale]);

  const [draft, setDraft] = useState<RegistrySkillManifest>({
    ...initial,
    id: initial.id || '',
    name: initial.name || '',
    description: initial.description || '',
    version: initial.version || '1.0.0',
  });
  const [toolsJson, setToolsJson] = useState<string>(serializeRegistrySkillTools(initial.tools));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError(null);
      const manifest: RegistrySkillManifest = {
        ...draft,
        id: draft.id.trim() || slugifySkillId(draft.name),
        name: draft.name.trim(),
        description: draft.description.trim(),
        version: draft.version.trim() || '1.0.0',
        tools: parseRegistrySkillTools(toolsJson),
      };
      const validationError = validateRegistrySkillManifest(manifest);
      if (validationError) {
        setError(validationError);
        return;
      }
      await onSave(manifest);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6" onClick={onCancel}>
      <div
        className="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{text.title}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{text.subtitle}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title={t.common.cancel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{text.idLabel}</span>
            <input
              value={draft.id}
              onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
              placeholder="registry-skill-id"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <p className="text-xs text-gray-400">{text.idHint}</p>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{text.versionLabel}</span>
            <input
              value={draft.version}
              onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))}
              placeholder="1.0.0"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-gray-600 dark:bg-gray-900"
            />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{text.nameLabel}</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder={text.nameLabel}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-gray-600 dark:bg-gray-900"
            />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{text.descriptionLabel}</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder={text.descriptionPlaceholder}
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-gray-600 dark:bg-gray-900"
            />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{text.toolsLabel}</span>
            <textarea
              value={toolsJson}
              onChange={(event) => setToolsJson(event.target.value)}
              placeholder={text.toolsPlaceholder}
              rows={16}
              spellCheck={false}
              className="w-full rounded-2xl border border-gray-200 bg-gray-950 px-3 py-3 font-mono text-xs leading-6 text-gray-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-gray-600"
            />
            <p className="text-xs text-gray-400">{text.toolsHint}</p>
          </label>
        </div>

        {error && (
          <div className="mx-6 mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? text.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
