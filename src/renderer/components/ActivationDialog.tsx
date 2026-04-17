import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Copy, Check, AlertCircle, Loader2, X } from 'lucide-react';
import type { ActivationStatus } from '../types';
import { useI18n } from '../i18n';

interface ActivationDialogProps {
  /** Called when activation succeeds */
  onActivated: (status: ActivationStatus) => void;
  /** Called when user dismisses the dialog without activating */
  onClose?: () => void;
}

const ActivationDialog: React.FC<ActivationDialogProps> = ({ onActivated, onClose }) => {
  const { t } = useI18n();
  const [machineCode, setMachineCode] = useState<string>('...');
  const [authCode, setAuthCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electronAPI?.activationGetMachineCode?.().then((code) => {
      setMachineCode(code);
    }).catch(() => {
      setMachineCode(t.activation.failedToGet);
    });
  }, [t.activation.failedToGet]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(machineCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [machineCode]);

  const handleSubmit = useCallback(async () => {
    const trimmed = authCode.trim();
    if (!trimmed) {
      setError(t.activation.enterCode);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await window.electronAPI?.activationSubmit?.(trimmed);
      if (!result) {
        setError(t.activation.apiUnavailable);
        return;
      }
      if (result.ok && result.status) {
        onActivated(result.status);
      } else {
        setError(result.message || t.activation.activationFailed);
      }
    } catch (e) {
      setError(t.activation.requestFailed);
    } finally {
      setSubmitting(false);
    }
  }, [authCode, onActivated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitting) handleSubmit();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-cyan-500 px-8 py-6 text-white">
          {onClose && (
            <button
              onClick={onClose}
              title={t.activation.dismissLater}
              className="absolute top-4 right-4 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          )}
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck size={28} strokeWidth={1.5} />
            <h2 className="text-xl font-semibold">{t.activation.title}</h2>
          </div>
          <p className="text-blue-100 text-sm">{t.activation.subtitle}</p>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Machine Code Display */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t.activation.machineCodeLabel}
            </label>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-600">
              <span className="font-mono text-lg font-bold tracking-[.2em] text-gray-800 dark:text-gray-100 flex-1 select-all">
                {machineCode}
              </span>
              <button
                onClick={handleCopy}
                title={t.activation.machineCodeCopy}
                className="flex-shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
              >
                {copied
                  ? <Check size={16} className="text-green-500" />
                  : <Copy size={16} />
                }
              </button>
            </div>
            <p className="text-xs text-gray-400">
              请将上方机器码发送给管理员，管理员使用授权生成工具生成对应授权码后提供给您。
            </p>
          </div>

          {/* Auth Code Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t.activation.authCodeLabel}
            </label>
            <input
              type="text"
              value={authCode}
              onChange={(e) => { setAuthCode(e.target.value.toUpperCase()); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder={t.activation.authCodePlaceholder || 'YYYYMMDD-XXXXX-XXXXX'}
              spellCheck={false}
              className="w-full font-mono text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-wider"
            />
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !authCode.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t.activation.submitting}
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                {t.activation.submit}
              </>
            )}
          </button>
        </div>

        <div className="px-8 pb-5 text-center text-xs text-gray-400">
          授权码格式：YYYYMMDD-XXXXX-XXXXX（到期日期 + 授权签名）
        </div>
      </div>
    </div>
  );
};

export default ActivationDialog;
