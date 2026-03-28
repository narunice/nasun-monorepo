/**
 * Lottery event registry
 */
import { devnetConfig } from '@nasun/devnet-config';
import type { ProtocolEventGroup } from '../types';

export const LOTTERY_EVENTS: ProtocolEventGroup = {
  name: 'Lottery',
  badgeVariant: 'success',
  packageIds: [...new Set([
    devnetConfig.lottery.packageId,
    ...(devnetConfig.lottery.originalPackageId ? [devnetConfig.lottery.originalPackageId] : []),
  ])],
  module: 'lottery',
  events: {
    RoundCreated: {
      label: 'Round Created',
      description: 'A new lottery round was created',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'close_time', label: 'Close Time', type: 'timestamp_ms' },
        { key: 'draw_time', label: 'Draw Time', type: 'timestamp_ms' },
        { key: 'rollover_in', label: 'Rollover', type: 'nusdc_amount' },
      ],
    },
    TicketPurchased: {
      label: 'Ticket Purchased',
      description: 'A lottery ticket was purchased',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'ticket_id', label: 'Ticket ID', type: 'number' },
        { key: 'buyer', label: 'Buyer', type: 'address' },
        { key: 'numbers', label: 'Numbers', type: 'numbers_array' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
      ],
    },
    RoundClosed: {
      label: 'Round Closed',
      description: 'A lottery round was closed for new tickets',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'ticket_count', label: 'Tickets Sold', type: 'number' },
        { key: 'total_sales', label: 'Total Sales', type: 'nusdc_amount' },
      ],
    },
    NumbersDrawn: {
      label: 'Numbers Drawn',
      description: 'Winning numbers were drawn',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'drawn_numbers', label: 'Drawn Numbers', type: 'numbers_array' },
      ],
    },
    RoundSettled: {
      label: 'Round Settled',
      description: 'Prize distribution was finalized',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'tier1_winners', label: 'Tier 1 Winners', type: 'number' },
        { key: 'tier2_winners', label: 'Tier 2 Winners', type: 'number' },
        { key: 'tier3_winners', label: 'Tier 3 Winners', type: 'number' },
        { key: 'tier1_payout', label: 'Tier 1 Payout', type: 'nusdc_amount' },
        { key: 'tier2_payout', label: 'Tier 2 Payout', type: 'nusdc_amount' },
        { key: 'tier3_payout', label: 'Tier 3 Payout', type: 'nusdc_amount' },
        { key: 'tier1_rollover', label: 'Tier 1 Rollover', type: 'nusdc_amount' },
        { key: 'tier2_rollover', label: 'Tier 2 Rollover', type: 'nusdc_amount' },
        { key: 'tier3_rollover', label: 'Tier 3 Rollover', type: 'nusdc_amount' },
        { key: 'treasury_amount', label: 'Treasury', type: 'nusdc_amount' },
      ],
    },
    PrizeClaimed: {
      label: 'Prize Claimed',
      description: 'A lottery prize was claimed',
      fields: [
        { key: 'round_id', label: 'Round ID', type: 'object_id' },
        { key: 'round_number', label: 'Round Number', type: 'number' },
        { key: 'ticket_id', label: 'Ticket ID', type: 'number' },
        { key: 'winner', label: 'Winner', type: 'address' },
        { key: 'tier', label: 'Prize Tier', type: 'number' },
        { key: 'match_count', label: 'Matches', type: 'number' },
        { key: 'amount', label: 'Prize Amount', type: 'nusdc_amount' },
      ],
    },
  },
};
