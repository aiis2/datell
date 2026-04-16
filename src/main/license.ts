/**
 * License module — main process only.
 *
 * Open-source edition: all features are permanently unlocked.
 * No hardware identification or activation code is required.
 */

/* ── Public types ── */

export interface ActivationStatus {
  activated: boolean;
  machineCode: string;
  /** ISO date string, null if not activated or permanent */
  expiry: string | null;
  /** Days remaining until expiry, null if not activated */
  daysRemaining: number | null;
  reason: string;
  /** true = pro tier, false = basic */
  isPro?: boolean;
}

export interface StoredActivation {
  authCode: string;
  machineCode: string;
  expiry: string;
  activatedAt: number;
}

/**
 * Open-source edition: returns a fixed identifier; no hardware data collected.
 */
export async function getMachineCode(): Promise<string> {
  return 'OPEN-SOURCE';
}

/**
 * Open-source edition: all codes are accepted; always returns valid + isPro.
 */
export function verifyAuthCode(
  _authCode: string,
  _machineCode: string,
): { valid: boolean; expiry: Date | null; reason: string; isPro: boolean } {
  return { valid: true, expiry: null, reason: 'Open Source', isPro: true };
}

/** Stub — not used in open-source edition. */
export function encryptActivation(data: StoredActivation): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
}

/** Stub — not used in open-source edition. */
export function decryptActivation(encoded: string): StoredActivation | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as StoredActivation;
  } catch {
    return null;
  }
}

/**
 * Open-source edition: always returns activated with full pro features.
 */
export function computeActivationStatus(
  _stored: StoredActivation | null,
  machineCode: string,
): ActivationStatus {
  return {
    activated: true,
    machineCode,
    expiry: null,
    daysRemaining: null,
    reason: 'Open Source',
    isPro: true,
  };
}

