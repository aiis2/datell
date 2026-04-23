/**
 * reportShellBridge.ts
 *
 * Utilities for communicating with report-shell.html via postMessage.
 * The shell is loaded at app://localhost/report-shell.html and handles
 * rendering + theme injection in isolation from the main React tree.
 */

import type { PalettePreset } from '../types';

/** CDN patterns that the shell strips automatically — kept here for reference */
export const CDN_SCRIPT_PATTERN =
  /<script[^>]+src=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdn\.bootcdn\.net|cdnjs\.cloudflare\.com|staticfile\.org|echarts\.apache\.org)[^"']*["'][^>]*><\/script>/gi;

/** Payload sent to shell when rendering a new report */
export interface RenderPayload {
  type: 'render';
  html: string;
  theme: ReportDesignPayload | null;
}

/** Payload sent to shell when only the theme changes */
export interface ThemeUpdatePayload {
  type: 'theme-update';
  theme: ReportDesignPayload | null;
}

/** Clear the iframe content */
export interface ClearPayload {
  type: 'clear';
}

export type ShellCommand = RenderPayload | ThemeUpdatePayload | ClearPayload;

/** Palette design data safe to send over postMessage */
export interface ReportDesignPayload {
  colors: string[];
  primary: string;
  bodyBg: string;
  cardBg: string;
  textColor: string;
  subTextColor?: string;
  isDark: boolean;
  /** Active report layout ID (e.g. "universal/dashboard-2col"). undefined = no layout override. */
  layoutId?: string;
}

/** Convert a PalettePreset to a plain serializable ReportDesignPayload */
export function serializeDesign(palette: PalettePreset | undefined, layoutId?: string): ReportDesignPayload | null {
  if (!palette) {
    if (layoutId) {
      return {
        colors: [],
        primary: '',
        bodyBg: '',
        cardBg: '',
        textColor: '',
        isDark: false,
        layoutId,
      };
    }
    return null;
  }
  return {
    colors: palette.colors,
    primary: palette.primary,
    bodyBg: palette.bodyBg,
    cardBg: palette.cardBg,
    textColor: palette.textColor,
    subTextColor: palette.subTextColor,
    isDark: palette.isDark,
    layoutId,
  };
}

/** Build the render payload to send to the shell */
export function buildRenderPayload(
  html: string,
  palette: PalettePreset | undefined,
  appTheme: 'light' | 'dark',
  layoutId?: string,
): RenderPayload {
  const serialized = serializeDesign(palette, layoutId);

  // When no custom palette but app is in dark mode, inject a minimal dark theme
  if (!serialized && appTheme === 'dark') {
    return {
      type: 'render',
      html,
      theme: {
        colors: ['#6366f1', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171'],
        primary: '#6366f1',
        bodyBg: '#1a1a2e',
        cardBg: '#16213e',
        textColor: '#e2e8f0',
        subTextColor: '#94a3b8',
        isDark: true,
        layoutId,
      },
    };
  }

  return { type: 'render', html, theme: serialized };
}

/** Build the theme-only update payload (no HTML re-render needed) */
export function buildThemeUpdatePayload(
  palette: PalettePreset | undefined,
  appTheme: 'light' | 'dark',
  layoutId?: string,
): ThemeUpdatePayload {
  const serialized = serializeDesign(palette, layoutId);
  if (!serialized && appTheme === 'dark') {
    return {
      type: 'theme-update',
      theme: {
        colors: ['#6366f1', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171'],
        primary: '#6366f1',
        bodyBg: '#1a1a2e',
        cardBg: '#16213e',
        textColor: '#e2e8f0',
        subTextColor: '#94a3b8',
        isDark: true,
        layoutId,
      },
    };
  }
  return { type: 'theme-update', theme: serialized };
}

function resolveShellUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin;
    if (origin && origin !== 'null') {
      return `${origin}/report-shell.html`;
    }
  }
  return 'app://localhost/report-shell.html';
}

/** Shell URL — constant stable URL for the shell iframe */
export const SHELL_URL = resolveShellUrl();
