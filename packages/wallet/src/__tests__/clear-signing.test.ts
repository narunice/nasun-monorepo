/**
 * Clear Signing Module Tests
 *
 * Tests for transaction decoding, formatting, and risk assessment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type MoveDecodedTx,
  type EVMDecodedTx,
  type SimulationResult,
  // Error
  ClearSigningError,
  DEFAULT_CLEAR_SIGNING_CONFIG,
  // Decoder
  decodeTx,
  configureClearSigning,
  getClearSigningConfig,
  bytesToHex,
  hexToBytes,
  bytesToBigInt,
  decodeMoveArg,
  // Formatter
  formatTransaction,
  assessRisk,
  formatAmount,
  formatGasCost,
  formatUSD,
  formatBalanceChange,
  getActionIconClass,
  getRiskLevelClass,
  getCategoryIconClass,
} from '../index';
// Import directly from clear-signing module to avoid conflicts
import {
  isValidAddress as isClearSigningValidAddress,
  shortenAddress as clearSigningShortenAddress,
} from '../core/clear-signing';

// ============================================
// Test Data
// ============================================

// Sample transaction bytes (hex encoded)
const SAMPLE_MOVE_TX_BYTES = new Uint8Array([
  0x00, // Transaction kind
  0x01, 0x02, 0x03, 0x04, 0x05, // Sample data
  ...new Array(100).fill(0).map((_, i) => i % 256),
]);

const SAMPLE_EVM_TX_BYTES = new Uint8Array([
  0x02, // EIP-1559 transaction type
  0xf8, 0xa0, // RLP header
  ...new Array(100).fill(0).map((_, i) => i % 256),
]);

const SAMPLE_SIMULATION: SimulationResult = {
  success: true,
  balanceChanges: [
    {
      token: '0x2::sui::SUI',
      symbol: 'NASUN',
      decimals: 9,
      amount: -1_000_000_000n, // -1 NASUN
      displayAmount: '-1.0',
      usdValue: -5.0,
    },
  ],
  nftChanges: [],
  approvalChanges: [],
  estimatedGas: 1_000_000n,
};

// ============================================
// bytesToHex / hexToBytes Tests
// ============================================

describe('Byte Utilities', () => {
  describe('bytesToHex', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([0x00, 0x11, 0xff]);
      expect(bytesToHex(bytes)).toBe('0011ff');
    });

    it('should handle empty bytes', () => {
      const bytes = new Uint8Array([]);
      expect(bytesToHex(bytes)).toBe('');
    });

    it('should pad single-digit hex values', () => {
      const bytes = new Uint8Array([0x01, 0x0a, 0x0f]);
      expect(bytesToHex(bytes)).toBe('010a0f');
    });
  });

  describe('hexToBytes', () => {
    it('should convert hex string to bytes', () => {
      const hex = '0011ff';
      const result = hexToBytes(hex);
      expect(Array.from(result)).toEqual([0x00, 0x11, 0xff]);
    });

    it('should handle 0x prefix', () => {
      const hex = '0x0011ff';
      const result = hexToBytes(hex);
      expect(Array.from(result)).toEqual([0x00, 0x11, 0xff]);
    });

    it('should handle empty string', () => {
      const hex = '';
      const result = hexToBytes(hex);
      expect(result.length).toBe(0);
    });
  });

  describe('bytesToBigInt', () => {
    it('should convert bytes to bigint', () => {
      const bytes = new Uint8Array([0x01, 0x00]);
      expect(bytesToBigInt(bytes)).toBe(256n);
    });

    it('should handle large values', () => {
      const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      expect(bytesToBigInt(bytes)).toBe(4294967295n);
    });

    it('should handle empty bytes', () => {
      const bytes = new Uint8Array([]);
      expect(bytesToBigInt(bytes)).toBe(0n);
    });
  });
});

// ============================================
// Address Utilities Tests
// ============================================

describe('Address Utilities', () => {
  describe('isValidAddress', () => {
    it('should validate Move address (64 hex chars)', () => {
      const address = '0x' + '1'.repeat(64);
      expect(isClearSigningValidAddress(address, 'move')).toBe(true);
    });

    it('should reject invalid Move address (40 hex chars)', () => {
      const address = '0x' + '1'.repeat(40);
      expect(isClearSigningValidAddress(address, 'move')).toBe(false);
    });

    it('should validate EVM address (40 hex chars)', () => {
      const address = '0x' + '1'.repeat(40);
      expect(isClearSigningValidAddress(address, 'evm')).toBe(true);
    });

    it('should reject invalid EVM address (64 hex chars)', () => {
      const address = '0x' + '1'.repeat(64);
      expect(isClearSigningValidAddress(address, 'evm')).toBe(false);
    });

    it('should reject addresses with invalid characters', () => {
      const address = '0x' + 'g'.repeat(40);
      expect(isClearSigningValidAddress(address, 'evm')).toBe(false);
    });
  });

  describe('shortenAddress', () => {
    it('should shorten long addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef1234567890abcdef';
      const shortened = clearSigningShortenAddress(address);
      expect(shortened).toMatch(/^0x[0-9a-f]+\.{3}[0-9a-f]+$/);
    });

    it('should not shorten short addresses', () => {
      const address = '0x123456';
      const shortened = clearSigningShortenAddress(address, 2);
      expect(shortened).toBe(address.toLowerCase());
    });
  });
});

// ============================================
// Configuration Tests
// ============================================

describe('Configuration', () => {
  beforeEach(() => {
    // Reset configuration
    configureClearSigning(DEFAULT_CLEAR_SIGNING_CONFIG);
  });

  it('should return default configuration', () => {
    const config = getClearSigningConfig();
    expect(config.enableSimulation).toBe(true);
    expect(config.simulationTimeout).toBe(10_000);
    expect(config.largeAmountThreshold).toBe(1000);
    expect(config.warnUnlimitedApproval).toBe(true);
  });

  it('should update configuration', () => {
    configureClearSigning({
      largeAmountThreshold: 5000,
      simulationTimeout: 30_000,
    });

    const config = getClearSigningConfig();
    expect(config.largeAmountThreshold).toBe(5000);
    expect(config.simulationTimeout).toBe(30_000);
    // Unchanged settings should remain
    expect(config.enableSimulation).toBe(true);
  });
});

// ============================================
// Move Argument Decoding Tests
// ============================================

describe('decodeMoveArg', () => {
  it('should decode u8 value', () => {
    const bytes = new Uint8Array([42]);
    const arg = decodeMoveArg(bytes, 'u8');
    expect(arg.type).toBe('u8');
    expect(arg.decoded).toBe(42);
  });

  it('should decode u64 value', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, 1000000000n, true);
    const arg = decodeMoveArg(bytes, 'u64');
    expect(arg.type).toBe('u64');
    expect(arg.decoded).toBe(1000000000n);
  });

  it('should decode bool value', () => {
    const bytes = new Uint8Array([1]);
    const arg = decodeMoveArg(bytes, 'bool');
    expect(arg.type).toBe('bool');
    expect(arg.decoded).toBe(true);
  });

  it('should infer type from bytes length', () => {
    // 1 byte with value 0 or 1 should be bool
    const boolBytes = new Uint8Array([0]);
    expect(decodeMoveArg(boolBytes).type).toBe('bool');

    // 8 bytes should be u64
    const u64Bytes = new Uint8Array(8);
    expect(decodeMoveArg(u64Bytes).type).toBe('u64');

    // 32 bytes should be u256 or address
    const largeBytes = new Uint8Array(32);
    expect(['u256', 'address']).toContain(decodeMoveArg(largeBytes).type);
  });
});

// ============================================
// Transaction Decoding Tests
// ============================================

describe('decodeTx', () => {
  describe('Move Transaction', () => {
    it('should decode Move transaction', async () => {
      const decoded = await decodeTx(
        SAMPLE_MOVE_TX_BYTES,
        'move',
        '6681cdfd',
        '0x' + '1'.repeat(64)
      );

      expect(decoded.chainType).toBe('move');
      expect(decoded.chainId).toBe('6681cdfd');
      expect(decoded.sender).toBe('0x' + '1'.repeat(64));
      expect((decoded as MoveDecodedTx).calls).toBeDefined();
    });

    it('should categorize transfer transaction', async () => {
      // Create bytes that hint at transfer operation
      const transferHint = new TextEncoder().encode('transfer::public_transfer');
      const txBytes = new Uint8Array([0, ...transferHint, ...new Array(50).fill(0)]);

      const decoded = await decodeTx(
        txBytes,
        'move',
        '6681cdfd',
        '0x' + '1'.repeat(64)
      );

      expect(['transfer', 'contract', 'unknown']).toContain(decoded.category);
    });
  });

  describe('EVM Transaction', () => {
    it('should decode EVM transaction', async () => {
      const decoded = await decodeTx(
        SAMPLE_EVM_TX_BYTES,
        'evm',
        '1',
        '0x' + '1'.repeat(40)
      );

      expect(decoded.chainType).toBe('evm');
      expect(decoded.chainId).toBe('1');
      expect((decoded as EVMDecodedTx).to).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw for unsupported chain type', async () => {
      await expect(
        decodeTx(
          SAMPLE_MOVE_TX_BYTES,
          'unknown' as any,
          '1',
          '0x' + '1'.repeat(40)
        )
      ).rejects.toThrow(ClearSigningError);
    });
  });
});

// ============================================
// Formatting Tests
// ============================================

describe('formatAmount', () => {
  it('should format amount with decimals', () => {
    expect(formatAmount(1_000_000_000n, 9)).toBe('1');
    expect(formatAmount(1_500_000_000n, 9)).toBe('1.5');
    expect(formatAmount(1_234_567_890n, 9)).toBe('1.234567');
  });

  it('should format zero', () => {
    expect(formatAmount(0n, 9)).toBe('0');
  });

  it('should format negative amounts', () => {
    expect(formatAmount(-1_000_000_000n, 9)).toBe('-1');
  });

  it('should format with commas for large values', () => {
    expect(formatAmount(1_000_000_000_000_000_000n, 9)).toBe('1,000,000,000');
  });

  it('should respect maxDecimals', () => {
    expect(formatAmount(1_234_567_890_123_456n, 18, 4)).toBe('0.0012');
  });
});

describe('formatGasCost', () => {
  it('should format gas cost with symbol', () => {
    const result = formatGasCost(1_000_000_000n, 'NASUN', 9);
    expect(result).toBe('1 NASUN');
  });

  it('should format small gas costs', () => {
    // 1_000_000_000_000n = 0.000001 ETH (10^12 / 10^18)
    const result = formatGasCost(1_000_000_000_000n, 'ETH', 18);
    expect(result).toBe('0.000001 ETH');
  });

  it('should format very small gas costs', () => {
    // 1_000_000n = 0.000000000001 ETH (10^6 / 10^18)
    const result = formatGasCost(1_000_000n, 'ETH', 18);
    expect(result).toContain('ETH');
    // Should show some non-zero decimal representation
    expect(result).not.toBe('0 ETH');
  });
});

describe('formatUSD', () => {
  it('should format USD value', () => {
    expect(formatUSD(1234.56)).toBe('$1,234.56');
  });

  it('should handle zero', () => {
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('should handle negative values', () => {
    expect(formatUSD(-100)).toBe('-$100.00');
  });
});

describe('formatBalanceChange', () => {
  it('should format positive change', () => {
    const change = {
      token: '0x2::sui::SUI',
      symbol: 'NASUN',
      decimals: 9,
      amount: 1_000_000_000n,
      displayAmount: '1.0',
      usdValue: 5.0,
    };
    expect(formatBalanceChange(change)).toBe('+1.0 NASUN ($5.00)');
  });

  it('should format negative change', () => {
    const change = {
      token: '0x2::sui::SUI',
      symbol: 'NASUN',
      decimals: 9,
      amount: -1_000_000_000n,
      displayAmount: '-1.0',
      usdValue: -5.0,
    };
    expect(formatBalanceChange(change)).toBe('-1.0 NASUN (-$5.00)');
  });
});

// ============================================
// Transaction Summary Tests
// ============================================

describe('formatTransaction', () => {
  it('should format Move transaction summary', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const summary = formatTransaction(decoded);

    expect(summary.title).toBeDefined();
    expect(summary.description).toBeDefined();
    expect(summary.category).toBeDefined();
    expect(summary.riskLevel).toBeDefined();
    expect(summary.actions).toBeDefined();
  });

  it('should include simulation results in summary', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const summary = formatTransaction(decoded, SAMPLE_SIMULATION);

    // Should have action for balance change
    expect(summary.actions.length).toBeGreaterThan(0);
    expect(summary.actions[0].type).toBe('send');
    expect(summary.actions[0].value).toBe('-1.0');
  });

  it('should set sponsored flag when sponsor present', async () => {
    const decoded: MoveDecodedTx = {
      chainType: 'move',
      chainId: '6681cdfd',
      category: 'transfer',
      sender: '0x' + '1'.repeat(64),
      rawBytes: '00',
      calls: [],
      gasBudget: 1_000_000n,
      sponsor: '0x' + '2'.repeat(64),
      decodedAt: Date.now(),
    };

    const summary = formatTransaction(decoded);
    expect(summary.isSponsored).toBe(true);
  });
});

// ============================================
// Risk Assessment Tests
// ============================================

describe('assessRisk', () => {
  it('should assess low risk for simple transactions', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const smallSimulation: SimulationResult = {
      success: true,
      balanceChanges: [
        {
          token: '0x2::sui::SUI',
          symbol: 'NASUN',
          decimals: 9,
          amount: -100_000_000n, // 0.1 NASUN
          displayAmount: '-0.1',
          usdValue: -0.5,
        },
      ],
      nftChanges: [],
      approvalChanges: [],
    };

    const risk = assessRisk(decoded, smallSimulation);

    expect(risk.overallRisk).toBe('low');
    expect(risk.score).toBeLessThan(15);
    expect(risk.requiresExtraConfirmation).toBe(false);
  });

  it('should assess critical risk for reverting transactions', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const revertingSimulation: SimulationResult = {
      success: true,
      balanceChanges: [],
      nftChanges: [],
      approvalChanges: [],
      willRevert: true,
      revertReason: 'Insufficient funds',
    };

    const risk = assessRisk(decoded, revertingSimulation);

    expect(risk.overallRisk).toBe('critical');
    expect(risk.factors.some((f) => f.title === 'Transaction Will Fail')).toBe(true);
  });

  it('should assess critical risk for unlimited approvals', async () => {
    const decoded = await decodeTx(
      SAMPLE_EVM_TX_BYTES,
      'evm',
      '1',
      '0x' + '1'.repeat(40)
    );

    const unlimitedApprovalSim: SimulationResult = {
      success: true,
      balanceChanges: [],
      nftChanges: [],
      approvalChanges: [
        {
          token: '0x' + 'a'.repeat(40),
          symbol: 'USDC',
          spender: '0x' + 'b'.repeat(40),
          amount: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
          isUnlimited: true,
        },
      ],
    };

    const risk = assessRisk(decoded, unlimitedApprovalSim);

    expect(risk.overallRisk).toBe('critical');
    expect(risk.factors.some((f) => f.title === 'Unlimited Token Approval')).toBe(true);
  });

  it('should assess medium risk for large value transactions', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const largeValueSim: SimulationResult = {
      success: true,
      balanceChanges: [
        {
          token: '0x2::sui::SUI',
          symbol: 'NASUN',
          decimals: 9,
          amount: -1000_000_000_000n, // 1000 NASUN
          displayAmount: '-1000',
          usdValue: -5000, // > $1000 threshold
        },
      ],
      nftChanges: [],
      approvalChanges: [],
    };

    const risk = assessRisk(decoded, largeValueSim);

    expect(risk.overallRisk).toBe('medium');
    expect(risk.factors.some((f) => f.title === 'Large Value Transaction')).toBe(true);
  });

  it('should assess risk for failed simulation', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const failedSimulation: SimulationResult = {
      success: false,
      error: 'Network error',
      balanceChanges: [],
      nftChanges: [],
      approvalChanges: [],
    };

    const risk = assessRisk(decoded, failedSimulation);

    expect(risk.factors.some((f) => f.title === 'Simulation Failed')).toBe(true);
  });
});

// ============================================
// UI Helper Tests
// ============================================

describe('UI Helpers', () => {
  describe('getActionIconClass', () => {
    it('should return correct class for send', () => {
      expect(getActionIconClass('arrow-up')).toContain('text-red');
    });

    it('should return correct class for receive', () => {
      expect(getActionIconClass('arrow-down')).toContain('text-green');
    });

    it('should return correct class for swap', () => {
      expect(getActionIconClass('swap')).toContain('text-blue');
    });

    it('should return correct class for approval', () => {
      expect(getActionIconClass('shield')).toContain('text-yellow');
    });
  });

  describe('getRiskLevelClass', () => {
    it('should return green for low risk', () => {
      expect(getRiskLevelClass('low')).toContain('green');
    });

    it('should return yellow for medium risk', () => {
      expect(getRiskLevelClass('medium')).toContain('yellow');
    });

    it('should return orange for high risk', () => {
      expect(getRiskLevelClass('high')).toContain('orange');
    });

    it('should return red for critical risk', () => {
      expect(getRiskLevelClass('critical')).toContain('red');
    });
  });

  describe('getCategoryIconClass', () => {
    it('should return icon for transfer', () => {
      expect(getCategoryIconClass('transfer')).toContain('icon-');
    });

    it('should return icon for swap', () => {
      expect(getCategoryIconClass('swap')).toContain('icon-');
    });

    it('should return icon for unknown', () => {
      expect(getCategoryIconClass('unknown')).toContain('icon-');
    });
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe('ClearSigningError', () => {
  it('should create error with code and message', () => {
    const error = new ClearSigningError('DECODE_FAILED', 'Failed to decode');
    expect(error.code).toBe('DECODE_FAILED');
    expect(error.message).toBe('Failed to decode');
    expect(error.name).toBe('ClearSigningError');
  });

  it('should preserve cause', () => {
    const cause = new Error('Original error');
    const error = new ClearSigningError('DECODE_FAILED', 'Failed', cause);
    expect(error.cause).toBe(cause);
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Clear Signing Integration', () => {
  it('should decode and format complete transaction flow', async () => {
    // 1. Decode transaction
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    // 2. Format with simulation
    const summary = formatTransaction(decoded, SAMPLE_SIMULATION);

    // 3. Assess risk
    const risk = assessRisk(decoded, SAMPLE_SIMULATION);

    // 4. Verify complete response
    expect(decoded.chainType).toBe('move');
    expect(summary.category).toBeDefined();
    expect(summary.riskLevel).toBeDefined();
    expect(risk.overallRisk).toBeDefined();
    expect(risk.score).toBeGreaterThanOrEqual(0);
    expect(risk.score).toBeLessThanOrEqual(100);
  });

  it('should handle EVM transaction with approval', async () => {
    // Create approval-like transaction
    const approvalBytes = new Uint8Array([
      0x02, // EIP-1559
      ...new Array(50).fill(0),
      0x09, 0x5e, 0xa7, 0xb3, // approve selector
      ...new Array(64).fill(0), // params
    ]);

    const decoded = await decodeTx(
      approvalBytes,
      'evm',
      '1',
      '0x' + '1'.repeat(40)
    );

    expect(decoded.chainType).toBe('evm');
    const evmDecoded = decoded as EVMDecodedTx;
    expect(evmDecoded.to).toBeDefined();
  });
});

// ============================================
// Security Tests
// ============================================

describe('Clear Signing Security', () => {
  it('should warn about unlimited approvals by default', async () => {
    // Ensure warnUnlimitedApproval is true by default
    expect(getClearSigningConfig().warnUnlimitedApproval).toBe(true);
  });

  it('should require extra confirmation for risky transactions', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const riskySimulation: SimulationResult = {
      success: true,
      balanceChanges: [],
      nftChanges: [],
      approvalChanges: [
        {
          token: '0x' + 'a'.repeat(40),
          symbol: 'TOKEN',
          spender: '0x' + 'b'.repeat(40),
          amount: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
          isUnlimited: true,
        },
      ],
    };

    const risk = assessRisk(decoded, riskySimulation);
    expect(risk.requiresExtraConfirmation).toBe(true);
  });

  it('should detect simulation timeout configuration', () => {
    configureClearSigning({ simulationTimeout: 5000 });
    expect(getClearSigningConfig().simulationTimeout).toBe(5000);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  it('should handle empty transaction bytes', async () => {
    const emptyBytes = new Uint8Array([]);

    await expect(
      decodeTx(emptyBytes, 'move', '6681cdfd', '0x' + '1'.repeat(64))
    ).rejects.toThrow();
  });

  it('should handle minimal valid transaction', async () => {
    const minimalBytes = new Uint8Array([0x00]);

    // Should not throw, might return unknown/default values
    const decoded = await decodeTx(
      minimalBytes,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    expect(decoded).toBeDefined();
  });

  it('should handle maximum u256 value', () => {
    const bytes = new Uint8Array(32).fill(0xff);
    const bigint = bytesToBigInt(bytes);
    expect(bigint.toString(16)).toBe('f'.repeat(64));
  });

  it('should format zero gas cost', () => {
    expect(formatGasCost(0n, 'NASUN', 9)).toBe('0 NASUN');
  });

  it('should handle simulation without balance changes', async () => {
    const decoded = await decodeTx(
      SAMPLE_MOVE_TX_BYTES,
      'move',
      '6681cdfd',
      '0x' + '1'.repeat(64)
    );

    const emptySimulation: SimulationResult = {
      success: true,
      balanceChanges: [],
      nftChanges: [],
      approvalChanges: [],
    };

    const summary = formatTransaction(decoded, emptySimulation);
    expect(summary).toBeDefined();
    // Actions should still be generated from calls
  });
});
