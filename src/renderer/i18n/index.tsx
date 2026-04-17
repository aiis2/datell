/**
 * i18n — Lightweight internationalization system.
 *
 * Supports zh-CN (Simplified Chinese) and en-US (English).
 * Language preference is persisted via configStore (localStorage).
 * Falls back to English if system locale is not zh-CN/zh-TW.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';
import type { Locale } from './locales/zh-CN';

export type LangCode = 'zh-CN' | 'en-US';

/** Detect browser/system language and resolve to either 'zh-CN' or 'en-US'. */
export function detectSystemLanguage(): LangCode {
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh-CN';
  return 'en-US';
}

/** Get locale object by lang code. Defaults to en-US for unknown codes. */
export function getLocale(lang: LangCode): Locale {
  if (lang === 'zh-CN') return zhCN;
  return enUS;
}

// ─── Context ────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: LangCode;
  t: Locale;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'zh-CN',
  t: zhCN,
});

interface I18nProviderProps {
  lang: LangCode;
  children: React.ReactNode;
}

/** Wrap your app root with this provider to supply translation strings. */
export const I18nProvider: React.FC<I18nProviderProps> = ({ lang, children }) => {
  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: getLocale(lang) }),
    [lang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/** Returns `{ lang, t }` where `t` is the typed locale object. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export { zhCN, enUS };
export type { Locale };
