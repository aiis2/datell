/**
 * SaveLayoutDialog — 命名并保存自定义布局
 */
import React, { useState } from 'react';
import { Save, X } from 'lucide-react';

interface Props {
  onSave: (name: string) => void;
  onCancel: () => void;
  defaultName?: string;
}

const SaveLayoutDialog: React.FC<Props> = ({ onSave, onCancel, defaultName = '' }) => {
  const [name, setName] = useState(defaultName || `自定义布局-${new Date().toLocaleDateString()}`);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-[380px] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">保存自定义布局</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">布局名称</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
            placeholder="输入布局名称"
            className="w-full bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-400/40 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            取消
          </button>
          <button
            onClick={() => name.trim() && onSave(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Save size={14} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveLayoutDialog;
