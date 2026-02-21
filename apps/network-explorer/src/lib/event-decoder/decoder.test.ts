import { describe, it, expect } from 'vitest';
import { decodeEvent } from './decoder';
import { devnetConfig } from '@nasun/devnet-config';
import type { SuiEvent } from '@mysten/sui/client';

// Real package IDs from devnet-config
const LOTTERY_PKG = devnetConfig.lottery.packageId;
const PERP_PKG = devnetConfig.perp.packageId;
const EXECUTOR_PKG = devnetConfig.baram.executorPackageId;
const BARAM_PKG = devnetConfig.baram.packageId;
const BARAM_ORIG_PKG = devnetConfig.baram.originalPackageId;

// Helper to create a minimal SuiEvent fixture
function makeEvent(
  type: string,
  parsedJson: Record<string, unknown>,
): SuiEvent {
  return {
    id: { txDigest: 'test', eventSeq: '0' },
    packageId: type.split('::')[0],
    transactionModule: type.split('::')[1],
    sender: '0x0',
    type,
    parsedJson,
    bcs: '',
    timestampMs: undefined,
  } as unknown as SuiEvent;
}

describe('decodeEvent', () => {
  // ===================================================
  // Lottery events (real devnet fixtures)
  // ===================================================
  describe('Lottery — TicketPurchased', () => {
    const event = makeEvent(
      `${LOTTERY_PKG}::lottery::TicketPurchased`,
      {
        round_id: '0xabc123',
        round_number: '1',
        ticket_id: '42',
        buyer: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        numbers: [6, 7, 12, 17, 26],
        amount: '1000000', // 1 NUSDC (6 decimals)
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Lottery');
      expect(decoded!.eventName).toBe('Ticket Purchased');
      expect(decoded!.badgeVariant).toBe('success');
    });

    it('formats NUSDC amount with correct decimals', () => {
      const decoded = decodeEvent(event)!;
      const amountField = decoded.fields.find((f) => f.label === 'Amount');
      expect(amountField).toBeDefined();
      expect(amountField!.formattedValue).toBe('1 NUSDC');
    });

    it('formats numbers_array correctly', () => {
      const decoded = decodeEvent(event)!;
      const numbersField = decoded.fields.find((f) => f.label === 'Numbers');
      expect(numbersField).toBeDefined();
      expect(numbersField!.formattedValue).toBe('6, 7, 12, 17, 26');
    });

    it('formats address with truncation and link', () => {
      const decoded = decodeEvent(event)!;
      const buyerField = decoded.fields.find((f) => f.label === 'Buyer');
      expect(buyerField).toBeDefined();
      expect(buyerField!.link).toBe(
        '/address/0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
      );
      // Truncated form
      expect(buyerField!.formattedValue.length).toBeLessThan(66);
    });

    it('formats object_id with link', () => {
      const decoded = decodeEvent(event)!;
      const roundField = decoded.fields.find((f) => f.label === 'Round ID');
      expect(roundField).toBeDefined();
      expect(roundField!.link).toBe('/object/0xabc123');
    });
  });

  // ===================================================
  // Perpetuals events (real devnet fixture)
  // ===================================================
  describe('Perpetuals — MarketCreated', () => {
    const event = makeEvent(
      `${PERP_PKG}::perpetual::MarketCreated`,
      {
        market_id: '0x3ec399833ee4aa22e8542e451f21f4c26b098b47a048d33162dfc40cfa10b2b7',
        base_symbol: '1',
        name: [66, 84, 67, 45, 80, 69, 82, 80], // "BTC-PERP"
        max_leverage: '20',
        created_at: '1740000000000',
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Perpetuals');
      expect(decoded!.eventName).toBe('Market Created');
    });

    it('decodes vector<u8> name as string', () => {
      const decoded = decodeEvent(event)!;
      const nameField = decoded.fields.find((f) => f.label === 'Name');
      expect(nameField).toBeDefined();
      expect(nameField!.formattedValue).toBe('BTC-PERP');
    });

    it('formats number field correctly', () => {
      const decoded = decodeEvent(event)!;
      const leverageField = decoded.fields.find((f) => f.label === 'Max Leverage');
      expect(leverageField).toBeDefined();
      expect(leverageField!.formattedValue).toBe('20');
    });
  });

  // ===================================================
  // Executor events (real devnet fixtures)
  // ===================================================
  describe('Executor — ExecutorStatsUpdated', () => {
    const event = makeEvent(
      `${EXECUTOR_PKG}::executor::ExecutorStatsUpdated`,
      {
        operator: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        completed_jobs: '17',
        failed_jobs: '0',
        reputation: '850',
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Executor');
      expect(decoded!.eventName).toBe('Stats Updated');
    });

    it('formats number fields', () => {
      const decoded = decodeEvent(event)!;
      const completedField = decoded.fields.find((f) => f.label === 'Completed');
      expect(completedField!.formattedValue).toBe('17');
    });
  });

  describe('Executor — ExecutorEndpointUpdated', () => {
    const event = makeEvent(
      `${EXECUTOR_PKG}::executor::ExecutorEndpointUpdated`,
      {
        operator: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        endpoint_url: 'https://executor.nasun.io/api',
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.eventName).toBe('Endpoint Updated');
    });

    it('formats string field', () => {
      const decoded = decodeEvent(event)!;
      const endpointField = decoded.fields.find((f) => f.label === 'Endpoint');
      expect(endpointField!.formattedValue).toBe('https://executor.nasun.io/api');
    });
  });

  describe('Executor — ReputationDecayed', () => {
    const event = makeEvent(
      `${EXECUTOR_PKG}::executor::ReputationDecayed`,
      {
        operator: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        old_reputation: '1000',
        new_reputation: '950',
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.eventName).toBe('Reputation Decayed');
      expect(decoded!.fields).toHaveLength(3);
    });
  });

  // ===================================================
  // Executor Staking events
  // ===================================================
  describe('Executor Staking — Staked', () => {
    const event = makeEvent(
      `${EXECUTOR_PKG}::executor_staking::Staked`,
      {
        executor: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        amount: '10000000000', // 10 NSN
        total_staked: '50000000000', // 50 NSN
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Executor Staking');
      expect(decoded!.eventName).toBe('Staked');
    });

    it('formats NSN amounts with correct decimals', () => {
      const decoded = decodeEvent(event)!;
      const amountField = decoded.fields.find((f) => f.label === 'Amount');
      expect(amountField!.formattedValue).toBe('10 NSN');
    });
  });

  // ===================================================
  // Executor Tier events
  // ===================================================
  describe('Executor Tier — TierChanged', () => {
    const event = makeEvent(
      `${EXECUTOR_PKG}::executor_tier::TierChanged`,
      {
        executor: '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
        old_tier: '0',
        new_tier: '2',
        stake_amount: '100000000000', // 100 NSN
        reputation: '900',
      },
    );

    it('decodes correctly', () => {
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Executor Tier');
      expect(decoded!.eventName).toBe('Tier Changed');
    });
  });

  // ===================================================
  // Baram Escrow events (dual-key lookup)
  // ===================================================
  describe('Baram Escrow — dual packageId lookup', () => {
    it('decodes with current packageId', () => {
      const event = makeEvent(
        `${BARAM_PKG}::baram::RequestCreated`,
        {
          request_id: '1',
          requester: '0xaaa',
          executor: '0xbbb',
          price: '5000000',
          prompt_hash: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          model: 'gpt-4o',
          timeout_at: '1740000000000',
        },
      );
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Baram');
    });

    it('decodes with original packageId', () => {
      const event = makeEvent(
        `${BARAM_ORIG_PKG}::baram::RequestCreated`,
        {
          request_id: '1',
          requester: '0xaaa',
          executor: '0xbbb',
          price: '5000000',
          prompt_hash: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          model: 'gpt-4o',
          timeout_at: '1740000000000',
        },
      );
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.protocol).toBe('Baram');
    });
  });

  // ===================================================
  // Edge cases
  // ===================================================
  describe('edge cases', () => {
    it('returns null for unknown event type', () => {
      const event = makeEvent(
        '0xdeadbeef::unknown_module::SomeEvent',
        { foo: 'bar' },
      );
      expect(decodeEvent(event)).toBeNull();
    });

    it('returns null for malformed event type string', () => {
      const event = makeEvent('not-a-valid-type', { foo: 'bar' });
      expect(decodeEvent(event)).toBeNull();
    });

    it('returns null when parsedJson is null', () => {
      const event = makeEvent(
        `${LOTTERY_PKG}::lottery::TicketPurchased`,
        null as unknown as Record<string, unknown>,
      );
      expect(decodeEvent(event)).toBeNull();
    });

    it('handles missing fields gracefully', () => {
      const event = makeEvent(
        `${LOTTERY_PKG}::lottery::TicketPurchased`,
        { round_number: '1' }, // Most fields missing
      );
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      // Missing fields should show '-'
      const buyerField = decoded!.fields.find((f) => f.label === 'Buyer');
      expect(buyerField!.value).toBe('-');
    });

    it('strips generic type parameters', () => {
      const event = makeEvent(
        `${LOTTERY_PKG}::lottery::RoundCreated`,
        {
          round_id: '0x123',
          round_number: '5',
          close_time: '1740000000000',
          draw_time: '1740003600000',
          rollover_in: '0',
        },
      );
      // Modify type to include generic
      (event as { type: string }).type =
        `${LOTTERY_PKG}::lottery::RoundCreated<0xsome::type::T>`;
      const decoded = decodeEvent(event);
      expect(decoded).not.toBeNull();
      expect(decoded!.eventName).toBe('Round Created');
    });

    it('handles boolean field types', () => {
      const event = makeEvent(
        `${EXECUTOR_PKG}::executor::ExecutorUpdated`,
        {
          operator: '0xaaa',
          name: 'TestExecutor',
          endpoint_url: 'https://test.com',
          is_active: true,
        },
      );
      const decoded = decodeEvent(event)!;
      const activeField = decoded.fields.find((f) => f.label === 'Active');
      expect(activeField!.formattedValue).toBe('Yes');
    });

    it('handles hash field (vector<u8> as hex)', () => {
      const event = makeEvent(
        `${BARAM_PKG}::baram::RequestCreated`,
        {
          request_id: '1',
          requester: '0xaaa',
          executor: '0xbbb',
          price: '5000000',
          prompt_hash: [0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0x12, 0x34],
          model: 'gpt-4o',
          timeout_at: '1740000000000',
        },
      );
      const decoded = decodeEvent(event)!;
      const hashField = decoded.fields.find((f) => f.label === 'Prompt Hash');
      expect(hashField!.formattedValue).toContain('0x');
      expect(hashField!.formattedValue).toContain('...');
    });

    it('preserves raw data in decoded event', () => {
      const parsedJson = { round_number: '1', ticket_id: '42' };
      const event = makeEvent(
        `${LOTTERY_PKG}::lottery::TicketPurchased`,
        parsedJson,
      );
      const decoded = decodeEvent(event)!;
      expect(decoded.raw).toEqual(parsedJson);
    });
  });
});
