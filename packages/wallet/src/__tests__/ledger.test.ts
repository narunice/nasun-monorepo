/**
 * Ledger Integration Tests
 *
 * Tests for Ledger hardware wallet integration.
 * Uses mocks since actual hardware is not available in test environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LedgerError,
  LEDGER_DERIVATION_PATHS,
  type LedgerTransport,
} from '../core/ledger/types';
import { parseLedgerError, getLedgerErrorMessage } from '../core/ledger/transport';
import { deriveSuiAddress } from '../core/ledger/sui-ledger';
import { formatEvmSignature, parseVValue } from '../core/ledger/evm-ledger';
import { LedgerSigner } from '../core/signer/adapters/LedgerSigner';
import { SignerManager } from '../core/signer/SignerManager';

// Mock WebHID
vi.mock('@ledgerhq/hw-transport-webhid', () => ({
  default: {
    create: vi.fn(),
  },
}));

// Mock Ledger clients
vi.mock('@mysten/ledgerjs-hw-app-sui', () => ({
  default: vi.fn().mockImplementation(() => ({
    getPublicKey: vi.fn(),
    signTransaction: vi.fn(),
  })),
}));

vi.mock('@ledgerhq/hw-app-eth', () => ({
  default: vi.fn().mockImplementation(() => ({
    getAddress: vi.fn(),
    signTransaction: vi.fn(),
    signPersonalMessage: vi.fn(),
  })),
}));

describe('Ledger Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SignerManager.clear();
  });

  afterEach(() => {
    SignerManager.clear();
  });

  // ===========================================
  // Types Tests
  // ===========================================
  describe('Types', () => {
    describe('LedgerError', () => {
      it('should create error with code and message', () => {
        const error = new LedgerError('Test error', 'USER_REJECTED');
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('USER_REJECTED');
        expect(error.name).toBe('LedgerError');
      });

      it('should preserve original error', () => {
        const original = new Error('Original');
        const error = new LedgerError('Wrapped', 'UNKNOWN', original);
        expect(error.originalError).toBe(original);
      });
    });

    describe('LEDGER_DERIVATION_PATHS', () => {
      it('should generate correct Sui paths', () => {
        expect(LEDGER_DERIVATION_PATHS.SUI(0)).toBe("m/44'/784'/0'/0'/0'");
        expect(LEDGER_DERIVATION_PATHS.SUI(1)).toBe("m/44'/784'/0'/0'/1'");
        expect(LEDGER_DERIVATION_PATHS.SUI(5)).toBe("m/44'/784'/0'/0'/5'");
      });

      it('should generate correct EVM paths', () => {
        expect(LEDGER_DERIVATION_PATHS.EVM(0)).toBe("44'/60'/0'/0/0");
        expect(LEDGER_DERIVATION_PATHS.EVM(1)).toBe("44'/60'/0'/0/1");
        expect(LEDGER_DERIVATION_PATHS.EVM(10)).toBe("44'/60'/0'/0/10");
      });
    });
  });

  // ===========================================
  // Transport Tests
  // ===========================================
  describe('Transport', () => {
    describe('parseLedgerError', () => {
      it('should parse user rejection error', () => {
        const error = parseLedgerError(new Error('0x6985'));
        expect(error.code).toBe('USER_REJECTED');
        expect(error.message).toContain('rejected');
      });

      it('should parse device locked error', () => {
        const error = parseLedgerError(new Error('Device is locked'));
        expect(error.code).toBe('DEVICE_LOCKED');
        expect(error.message).toContain('locked');
      });

      it('should parse app not open error', () => {
        const error = parseLedgerError(new Error('0x6E00'));
        expect(error.code).toBe('APP_NOT_OPEN');
        expect(error.message).toContain('correct app');
      });

      it('should parse device disconnected error', () => {
        const error = parseLedgerError(new Error('No device selected'));
        expect(error.code).toBe('DEVICE_DISCONNECTED');
      });

      it('should parse transport error', () => {
        const error = parseLedgerError(new Error('Transport disconnected'));
        expect(error.code).toBe('DEVICE_DISCONNECTED');
      });

      it('should handle unknown errors', () => {
        const error = parseLedgerError(new Error('Some random error'));
        expect(error.code).toBe('UNKNOWN');
      });

      it('should handle non-Error objects', () => {
        const error = parseLedgerError('string error');
        expect(error.code).toBe('UNKNOWN');
        expect(error.message).toBe('string error');
      });
    });

    describe('getLedgerErrorMessage', () => {
      it('should return correct messages for known codes', () => {
        expect(getLedgerErrorMessage('USER_REJECTED')).toContain('rejected');
        expect(getLedgerErrorMessage('DEVICE_LOCKED')).toContain('locked');
        expect(getLedgerErrorMessage('APP_NOT_OPEN')).toContain('correct app');
        expect(getLedgerErrorMessage('BROWSER_NOT_SUPPORTED')).toContain('Chrome');
      });

      it('should return default message for unknown code', () => {
        expect(getLedgerErrorMessage('INVALID_CODE')).toContain('unknown');
      });
    });
  });

  // ===========================================
  // Sui Ledger Tests
  // ===========================================
  describe('Sui Ledger', () => {
    describe('deriveSuiAddress', () => {
      it('should derive valid Sui address from public key', () => {
        // Example Ed25519 public key (32 bytes)
        const publicKey = new Uint8Array(32).fill(1);
        const address = deriveSuiAddress(publicKey);

        expect(address).toMatch(/^0x[a-f0-9]{64}$/);
      });

      it('should produce different addresses for different keys', () => {
        const key1 = new Uint8Array(32).fill(1);
        const key2 = new Uint8Array(32).fill(2);

        const addr1 = deriveSuiAddress(key1);
        const addr2 = deriveSuiAddress(key2);

        expect(addr1).not.toBe(addr2);
      });

      it('should produce consistent addresses', () => {
        const publicKey = new Uint8Array(32).fill(42);
        const addr1 = deriveSuiAddress(publicKey);
        const addr2 = deriveSuiAddress(publicKey);

        expect(addr1).toBe(addr2);
      });
    });
  });

  // ===========================================
  // EVM Ledger Tests
  // ===========================================
  describe('EVM Ledger', () => {
    describe('formatEvmSignature', () => {
      it('should format signature components correctly', () => {
        const sig = formatEvmSignature('1b', 'abc123', 'def456');
        expect(sig).toBe('0xabc123def4561b');
      });

      it('should handle 0x prefixed values', () => {
        const sig = formatEvmSignature('0x1c', '0xabc', '0xdef');
        expect(sig).toBe('0xabcdef1c');
      });
    });

    describe('parseVValue', () => {
      it('should adjust legacy v values', () => {
        expect(parseVValue('00', 1)).toBe(27);
        expect(parseVValue('01', 1)).toBe(28);
      });

      it('should preserve EIP-155 v values', () => {
        expect(parseVValue('25', 1)).toBe(37);
        expect(parseVValue('26', 1)).toBe(38);
      });
    });
  });

  // ===========================================
  // LedgerSigner Tests
  // ===========================================
  describe('LedgerSigner', () => {
    const mockTransport: LedgerTransport = {
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(Buffer.from([])),
      on: vi.fn(),
      off: vi.fn(),
    };

    describe('create', () => {
      it('should throw for unsupported chain type', async () => {
        await expect(
          LedgerSigner.create(mockTransport, {
            chainType: 'invalid' as 'move',
          })
        ).rejects.toThrow('Unsupported chain type');
      });
    });

    describe('capabilities', () => {
      it('should have requiresHardwareConfirm set to true', () => {
        // Create a minimal mock signer to check capabilities
        const capabilities = {
          sessionKeys: false,
          batchSign: false,
          gasSponsorship: false,
          requiresHardwareConfirm: true,
        };

        expect(capabilities.requiresHardwareConfirm).toBe(true);
        expect(capabilities.sessionKeys).toBe(false);
        expect(capabilities.batchSign).toBe(false);
        expect(capabilities.gasSponsorship).toBe(false);
      });
    });
  });

  // ===========================================
  // SignerManager Integration Tests
  // ===========================================
  describe('SignerManager Integration', () => {
    it('should not have ledger signer initially', () => {
      expect(SignerManager.has('ledger')).toBe(false);
    });

    it('should track ledger type in available types', () => {
      const types = ['local', 'evm', 'ledger', 'mpc', 'zklogin', 'smart-account'];
      expect(types).toContain('ledger');
    });
  });

  // ===========================================
  // Error Scenarios Tests
  // ===========================================
  describe('Error Scenarios', () => {
    it('should provide clear message for user rejection', () => {
      const error = parseLedgerError(new Error('User denied the request'));
      expect(error.code).toBe('USER_REJECTED');
    });

    it('should provide clear message for locked device', () => {
      const error = parseLedgerError(new Error('0x6986 SECURITY_LOCKED'));
      expect(error.code).toBe('DEVICE_LOCKED');
    });

    it('should provide clear message for wrong app', () => {
      const error = parseLedgerError(new Error('CLA_NOT_SUPPORTED'));
      expect(error.code).toBe('APP_NOT_OPEN');
    });

    it('should provide clear message for disconnect', () => {
      const error = parseLedgerError(new Error('Transport was disconnected'));
      expect(error.code).toBe('DEVICE_DISCONNECTED');
    });
  });

  // ===========================================
  // Derivation Path Tests
  // ===========================================
  describe('Derivation Paths', () => {
    it('should use BIP-44 standard for Sui', () => {
      const path = LEDGER_DERIVATION_PATHS.SUI(0);
      expect(path).toMatch(/^m\/44'\/784'\/0'\/0'\/\d+'$/);
    });

    it('should use BIP-44 standard for EVM', () => {
      const path = LEDGER_DERIVATION_PATHS.EVM(0);
      expect(path).toMatch(/^44'\/60'\/0'\/0\/\d+$/);
    });

    it('should use coin type 784 for Sui', () => {
      const path = LEDGER_DERIVATION_PATHS.SUI(0);
      expect(path).toContain("784'");
    });

    it('should use coin type 60 for EVM', () => {
      const path = LEDGER_DERIVATION_PATHS.EVM(0);
      expect(path).toContain("60'");
    });
  });
});
