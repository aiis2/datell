/**
 * System Store — Zustand store for current Windows login identity.
 *
 * Responsibilities:
 * - Fetch Windows identity on app startup via `init()`
 * - Hold identity, loading, and error state accessible to all components
 * - Provide a `refresh()` to re-read identity on demand
 */

import { create } from 'zustand';
import type { WindowsIdentity } from '../types';
import { systemAPI } from '../services/systemAPI';

interface SystemState {
  /** Current Windows identity; null until init() is called */
  identity: WindowsIdentity | null;
  /** True while fetching identity from main process */
  loading: boolean;
  /** Non-null when identity fetch encountered an error */
  error: string | null;

  /** Load identity from main process and persist to DB (called once on app start). */
  init: () => Promise<void>;
  /** Re-read identity; useful for Settings page refresh button. */
  refresh: () => Promise<void>;
}

async function fetchIdentity(): Promise<WindowsIdentity> {
  return systemAPI.getWindowsIdentity();
}

export const useSystemStore = create<SystemState>((set) => ({
  identity: null,
  loading: false,
  error: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const identity = await fetchIdentity();
      set({ identity, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const identity = await fetchIdentity();
      set({ identity, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
