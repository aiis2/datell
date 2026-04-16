/**
 * Permission Service — stub for future RBAC / access-control logic.
 *
 * This file is intentionally minimal. It provides the structural entry
 * point for permission checks so that future role-mapping, whitelist, or
 * template-access-scope logic can be added here without touching components.
 *
 * Current behavior: all checks return `true` (open access).
 *
 * ---------------------------------------------------------------------------
 * Design notes for future implementation:
 *
 * - Use `WindowsIdentity.sid` as the authoritative subject key.
 *   SIDs are stable across username changes and unique per Windows account.
 *
 * - `domain + username` can serve as a human-readable lookup key for
 *   display or audit purposes.
 *
 * - Permission records should be stored in the SQLite DB (a future
 *   `permissions` or `roles` table) keyed by SID.
 *
 * Example future usage:
 *   import { permissionService } from './permissionService';
 *   if (permissionService.can('export:pdf', identity.sid)) { ... }
 * ---------------------------------------------------------------------------
 */

import type { WindowsIdentity } from '../types';

export type PermissionAction =
  | 'report:view'
  | 'report:export'
  | 'template:manage'
  | 'settings:edit'
  | 'admin:all';

export const permissionService = {
  /**
   * Check whether the given identity has permission to perform an action.
   *
   * TODO: Replace stub with real DB-backed role lookup keyed on identity.sid
   */
  can(_action: PermissionAction, _identity: WindowsIdentity | null): boolean {
    // Stub: full access for all users until roles are configured
    return true;
  },

  /**
   * Returns true if the identity is considered fully resolved
   * (has a real SID from whoami, not a fallback).
   */
  isFullyResolved(identity: WindowsIdentity | null): boolean {
    return !!identity && !identity.isFallback && !!identity.sid;
  },
};
