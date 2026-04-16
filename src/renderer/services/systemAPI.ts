/**
 * System Identity API
 *
 * Renderer-side wrapper for Electron IPC calls related to Windows identity.
 * All renderer code should go through this service instead of calling
 * window.electronAPI directly.
 */

import type { WindowsIdentity } from '../types';
import { isElectron } from './dbAPI';

/** Fallback identity used in non-Electron environments (browser dev server). */
const BROWSER_FALLBACK_IDENTITY: WindowsIdentity = {
  username: 'dev-user',
  domain: 'localhost',
  displayName: 'dev-user',
  sid: '',
  source: 'env',
  isFallback: true,
  lastSeenAt: Date.now(),
};

export const systemAPI = {
  /**
   * Get current Windows login identity.
   *
   * In Electron: invokes 'system:getWindowsIdentity' IPC — executes
   * `whoami /user` in main process, persists result to DB, and returns
   * the identity object.
   *
   * In browser dev server: returns a safe fallback.
   */
  getWindowsIdentity: (): Promise<WindowsIdentity> => {
    if (isElectron()) {
      return window.electronAPI!.getWindowsIdentity();
    }
    return Promise.resolve({ ...BROWSER_FALLBACK_IDENTITY, lastSeenAt: Date.now() });
  },
};
