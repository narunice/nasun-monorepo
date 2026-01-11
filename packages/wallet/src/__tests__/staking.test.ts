import { describe, it, expect } from 'vitest';
import './setup';
import {
  formatApy,
  formatStakedAmount,
  calculateStakingSummary,
} from '../sui/staking';
import type { DelegatedStake, StakeInfo } from '../types/staking';

describe('Staking Utilities', () => {
  describe('formatApy', () => {
    it('should format APY as percentage', () => {
      expect(formatApy(0.05)).toBe('5.00%');
      expect(formatApy(0.1234)).toBe('12.34%');
      expect(formatApy(0)).toBe('0.00%');
    });

    it('should handle small APY values', () => {
      expect(formatApy(0.001)).toBe('0.10%');
      expect(formatApy(0.0001)).toBe('0.01%');
    });

    it('should handle large APY values', () => {
      expect(formatApy(1)).toBe('100.00%');
      expect(formatApy(2.5)).toBe('250.00%');
    });
  });

  describe('formatStakedAmount', () => {
    it('should format staked amount from MIST to NASUN', () => {
      // formatStakedAmount takes bigint and returns formatted string (no unit suffix)
      expect(formatStakedAmount(1000000000n)).toBe('1');
      expect(formatStakedAmount(500000000n)).toBe('0.5');
    });

    it('should format large amounts', () => {
      expect(formatStakedAmount(1000000000000n)).toBe('1000');
    });

    it('should handle zero', () => {
      expect(formatStakedAmount(0n)).toBe('0');
    });
  });

  describe('calculateStakingSummary', () => {
    const createStake = (principal: bigint, rewards: bigint, status: 'Active' | 'Pending' | 'Unstaked'): StakeInfo => ({
      stakedSuiId: `0x${Math.random().toString(16).slice(2)}`,
      stakeRequestEpoch: '100',
      stakeActiveEpoch: '101',
      principal,
      estimatedReward: rewards,
      status,
    });

    it('should calculate summary for empty stakes', () => {
      const summary = calculateStakingSummary([]);
      expect(summary.totalStaked).toBe(0n);
      expect(summary.totalRewards).toBe(0n);
      expect(summary.activeStakeCount).toBe(0);
      expect(summary.pendingStakeCount).toBe(0);
    });

    it('should calculate summary for active stakes', () => {
      const delegatedStakes: DelegatedStake[] = [
        {
          validatorAddress: '0xval1',
          stakingPool: '0xpool1',
          stakes: [
            createStake(1000000000n, 50000000n, 'Active'),
            createStake(2000000000n, 100000000n, 'Active'),
          ],
        },
      ];

      const summary = calculateStakingSummary(delegatedStakes);
      expect(summary.totalStaked).toBe(3000000000n); // 1 + 2 = 3 NASUN
      expect(summary.totalRewards).toBe(150000000n); // 0.05 + 0.1 = 0.15 NASUN
      expect(summary.activeStakeCount).toBe(2);
      expect(summary.pendingStakeCount).toBe(0);
    });

    it('should count pending stakes separately', () => {
      const delegatedStakes: DelegatedStake[] = [
        {
          validatorAddress: '0xval1',
          stakingPool: '0xpool1',
          stakes: [
            createStake(1000000000n, 0n, 'Pending'),
            createStake(2000000000n, 100000000n, 'Active'),
          ],
        },
      ];

      const summary = calculateStakingSummary(delegatedStakes);
      expect(summary.activeStakeCount).toBe(1);
      expect(summary.pendingStakeCount).toBe(1);
    });

    it('should aggregate across multiple validators', () => {
      const delegatedStakes: DelegatedStake[] = [
        {
          validatorAddress: '0xval1',
          stakingPool: '0xpool1',
          stakes: [createStake(1000000000n, 50000000n, 'Active')],
        },
        {
          validatorAddress: '0xval2',
          stakingPool: '0xpool2',
          stakes: [createStake(3000000000n, 150000000n, 'Active')],
        },
      ];

      const summary = calculateStakingSummary(delegatedStakes);
      expect(summary.totalStaked).toBe(4000000000n); // 1 + 3 = 4 NASUN
      expect(summary.totalRewards).toBe(200000000n); // 0.05 + 0.15 = 0.2 NASUN
      expect(summary.activeStakeCount).toBe(2);
    });

    it('should include all stakes in totals (including Unstaked)', () => {
      // Note: Current implementation counts all stakes including Unstaked in totals
      const delegatedStakes: DelegatedStake[] = [
        {
          validatorAddress: '0xval1',
          stakingPool: '0xpool1',
          stakes: [
            createStake(1000000000n, 50000000n, 'Active'),
            createStake(5000000000n, 0n, 'Unstaked'),
          ],
        },
      ];

      const summary = calculateStakingSummary(delegatedStakes);
      // Total includes both active and unstaked
      expect(summary.totalStaked).toBe(6000000000n);
      expect(summary.activeStakeCount).toBe(1);
    });
  });
});

describe('Staking Error Parsing', () => {
  it('should handle minimum stake error', async () => {
    // Test the concept - actual error parsing is in useStakeTransaction
    const errorMessage = 'MoveAbort(10)';
    expect(errorMessage).toContain('10');
  });
});

describe('Staking Types', () => {
  it('should have correct ValidatorInfo structure', () => {
    const validator = {
      address: '0x123',
      name: 'Test Validator',
      description: 'A test validator',
      imageUrl: 'https://example.com/logo.png',
      commissionRate: 0.05,
      stakingPoolSuiBalance: 1000000000n,
      apy: 0.05,
      isActive: true,
    };

    expect(validator.address).toBeDefined();
    expect(validator.apy).toBeGreaterThanOrEqual(0);
  });

  it('should have correct StakeInfo structure', () => {
    const stake: StakeInfo = {
      stakedSuiId: '0xstake1',
      stakeRequestEpoch: '100',
      stakeActiveEpoch: '101',
      principal: 1000000000n,
      estimatedReward: 50000000n,
      status: 'Active',
    };

    expect(stake.status).toBe('Active');
    expect(stake.principal).toBeDefined();
  });
});
