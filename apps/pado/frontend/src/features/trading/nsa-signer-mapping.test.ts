/**
 * NSA Signer Type Mapping Tests
 *
 * Tests the signer type mapping logic in NsaSetupWizard.tsx:
 *   SignerType -> NsaSignerType -> on-chain u8 value
 *
 * Move contract constants:
 *   zklogin = 0, passkey = 1, local = 2, hardware = 3
 *
 * Critical: passkey must map to 1 (not 2).
 * The previous bug mapped passkey -> 'local' (2) which would record
 * the wrong signer type on-chain.
 */

import { describe, it, expect } from 'vitest';
import { NSA_SIGNER_TYPE_MAP, type NsaSignerType } from '@nasun/wallet';

// ============================================
// Test Helpers — Mirror NsaSetupWizard.tsx L69-77
// ============================================

type SignerType = 'local' | 'zklogin' | 'passkey' | 'evm' | 'nsa' | null;

/**
 * Mirror of the signer type mapping in NsaSetupWizard.tsx L69-73
 */
function mapSignerToNsaType(signerType: SignerType): NsaSignerType {
  return signerType === 'zklogin' ? 'zklogin' :
    signerType === 'passkey' ? 'passkey' :
    signerType === 'local' ? 'local' :
    'local'; // default fallback
}

/**
 * Mirror of the label generation in NsaSetupWizard.tsx L75-77
 */
function mapSignerToLabel(signerType: SignerType): string {
  return signerType === 'zklogin' ? 'primary-zklogin'
    : signerType === 'passkey' ? 'primary-passkey'
    : 'primary-key';
}

/**
 * Mirror of the display text in NsaSetupWizard.tsx L260
 */
function mapSignerToDisplayText(signerType: SignerType): string {
  return signerType === 'zklogin' ? 'zkLogin'
    : signerType === 'local' ? 'Local Key'
    : signerType === 'passkey' ? 'Passkey'
    : signerType || 'Unknown';
}

// ============================================
// Tests
// ============================================

describe('NSA Signer Type Mapping', () => {
  // ------------------------------------------
  // NsaSignerType mapping
  // ------------------------------------------
  describe('SignerType → NsaSignerType', () => {
    it('maps local to local', () => {
      expect(mapSignerToNsaType('local')).toBe('local');
    });

    it('maps zklogin to zklogin', () => {
      expect(mapSignerToNsaType('zklogin')).toBe('zklogin');
    });

    it('maps passkey to passkey (CRITICAL — was bug)', () => {
      // Before fix: passkey fell through to default 'local'
      // After fix: explicit passkey -> 'passkey' branch
      expect(mapSignerToNsaType('passkey')).toBe('passkey');
      expect(mapSignerToNsaType('passkey')).not.toBe('local');
    });

    it('defaults to local for unknown signer types', () => {
      expect(mapSignerToNsaType('evm')).toBe('local');
      expect(mapSignerToNsaType('nsa')).toBe('local');
      expect(mapSignerToNsaType(null)).toBe('local');
    });
  });

  // ------------------------------------------
  // On-chain u8 value mapping
  // ------------------------------------------
  describe('NsaSignerType → on-chain u8', () => {
    it('zklogin maps to 0', () => {
      expect(NSA_SIGNER_TYPE_MAP.zklogin).toBe(0);
    });

    it('passkey maps to 1', () => {
      expect(NSA_SIGNER_TYPE_MAP.passkey).toBe(1);
    });

    it('local maps to 2', () => {
      expect(NSA_SIGNER_TYPE_MAP.local).toBe(2);
    });

    it('hardware maps to 3', () => {
      expect(NSA_SIGNER_TYPE_MAP.hardware).toBe(3);
    });

    it('passkey on-chain value is different from local (CRITICAL)', () => {
      // This ensures the bug where passkey was stored as local(2) doesn't recur
      expect(NSA_SIGNER_TYPE_MAP.passkey).not.toBe(NSA_SIGNER_TYPE_MAP.local);
    });

    it('all values are unique (no collisions)', () => {
      const values = Object.values(NSA_SIGNER_TYPE_MAP);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  // ------------------------------------------
  // End-to-end: SignerType → on-chain u8
  // ------------------------------------------
  describe('full path: SignerType → on-chain u8', () => {
    it('local signer → on-chain 2', () => {
      const nsaType = mapSignerToNsaType('local');
      expect(NSA_SIGNER_TYPE_MAP[nsaType]).toBe(2);
    });

    it('zklogin signer → on-chain 0', () => {
      const nsaType = mapSignerToNsaType('zklogin');
      expect(NSA_SIGNER_TYPE_MAP[nsaType]).toBe(0);
    });

    it('passkey signer → on-chain 1 (CRITICAL — was recording as 2)', () => {
      const nsaType = mapSignerToNsaType('passkey');
      expect(NSA_SIGNER_TYPE_MAP[nsaType]).toBe(1);
      // Verify NOT 2 (local) — this was the exact bug
      expect(NSA_SIGNER_TYPE_MAP[nsaType]).not.toBe(2);
    });
  });

  // ------------------------------------------
  // Label generation
  // ------------------------------------------
  describe('label generation', () => {
    it('local signer gets primary-key label', () => {
      expect(mapSignerToLabel('local')).toBe('primary-key');
    });

    it('zklogin signer gets primary-zklogin label', () => {
      expect(mapSignerToLabel('zklogin')).toBe('primary-zklogin');
    });

    it('passkey signer gets primary-passkey label (was bug: got primary-key)', () => {
      expect(mapSignerToLabel('passkey')).toBe('primary-passkey');
      // Verify NOT primary-key — passkey and local must have distinct labels
      expect(mapSignerToLabel('passkey')).not.toBe('primary-key');
    });

    it('unknown signer types default to primary-key', () => {
      expect(mapSignerToLabel('evm')).toBe('primary-key');
      expect(mapSignerToLabel(null)).toBe('primary-key');
    });

    it('all three wallet types produce distinct labels', () => {
      const labels = ['local', 'zklogin', 'passkey'].map((t) => mapSignerToLabel(t as SignerType));
      const unique = new Set(labels);
      expect(unique.size).toBe(3);
    });
  });

  // ------------------------------------------
  // Display text
  // ------------------------------------------
  describe('display text', () => {
    it('local shows "Local Key"', () => {
      expect(mapSignerToDisplayText('local')).toBe('Local Key');
    });

    it('zklogin shows "zkLogin"', () => {
      expect(mapSignerToDisplayText('zklogin')).toBe('zkLogin');
    });

    it('passkey shows "Passkey"', () => {
      expect(mapSignerToDisplayText('passkey')).toBe('Passkey');
    });

    it('null shows "Unknown"', () => {
      expect(mapSignerToDisplayText(null)).toBe('Unknown');
    });
  });

  // ------------------------------------------
  // Recovery scenario: on-chain type → signer identification
  // ------------------------------------------
  describe('recovery: reverse mapping from on-chain type', () => {
    // During Smart Account recovery, the on-chain signer type
    // must correctly identify which wallet type was used to create it

    const REVERSE_MAP: Record<number, NsaSignerType> = Object.fromEntries(
      Object.entries(NSA_SIGNER_TYPE_MAP).map(([k, v]) => [v, k as NsaSignerType])
    );

    it('on-chain 0 identifies as zklogin', () => {
      expect(REVERSE_MAP[0]).toBe('zklogin');
    });

    it('on-chain 1 identifies as passkey', () => {
      expect(REVERSE_MAP[1]).toBe('passkey');
    });

    it('on-chain 2 identifies as local', () => {
      expect(REVERSE_MAP[2]).toBe('local');
    });

    it('on-chain 3 identifies as hardware', () => {
      expect(REVERSE_MAP[3]).toBe('hardware');
    });
  });
});
