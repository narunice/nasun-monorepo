/**
 * Perpetuals (Futures) event registry
 */
import { devnetConfig } from '@nasun/devnet-config';
import type { ProtocolEventGroup } from '../types';

export const PERPETUALS_EVENTS: ProtocolEventGroup = {
  name: 'Perpetuals',
  badgeVariant: 'shared',
  packageIds: [devnetConfig.perp.packageId],
  module: 'perpetual',
  events: {
    MarketCreated: {
      label: 'Market Created',
      description: 'A new perpetual market was created',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'base_symbol', label: 'Base Symbol', type: 'number' },
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'max_leverage', label: 'Max Leverage', type: 'number' },
        { key: 'created_at', label: 'Created At', type: 'timestamp_ms' },
      ],
    },
    PositionOpened: {
      label: 'Position Opened',
      description: 'A new leveraged position was opened',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'owner', label: 'Owner', type: 'address' },
        { key: 'is_long', label: 'Direction', type: 'boolean' },
        { key: 'size', label: 'Size', type: 'nusdc_amount' },
        { key: 'entry_price', label: 'Entry Price', type: 'number' },
        { key: 'collateral', label: 'Collateral', type: 'nusdc_amount' },
        { key: 'leverage', label: 'Leverage', type: 'number' },
        { key: 'fee', label: 'Fee', type: 'nusdc_amount' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    PositionClosed: {
      label: 'Position Closed',
      description: 'A leveraged position was closed',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'owner', label: 'Owner', type: 'address' },
        { key: 'size', label: 'Size', type: 'nusdc_amount' },
        { key: 'exit_price', label: 'Exit Price', type: 'number' },
        { key: 'realized_pnl_value', label: 'PnL', type: 'nusdc_amount' },
        { key: 'realized_pnl_negative', label: 'PnL Negative', type: 'boolean' },
        { key: 'fee', label: 'Fee', type: 'nusdc_amount' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    PositionIncreased: {
      label: 'Position Increased',
      description: 'Position size was increased',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'size_delta', label: 'Size Added', type: 'nusdc_amount' },
        { key: 'new_size', label: 'New Size', type: 'nusdc_amount' },
        { key: 'new_entry_price', label: 'New Entry Price', type: 'number' },
        { key: 'collateral_added', label: 'Collateral Added', type: 'nusdc_amount' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    PositionDecreased: {
      label: 'Position Decreased',
      description: 'Position size was decreased',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'size_delta', label: 'Size Removed', type: 'nusdc_amount' },
        { key: 'new_size', label: 'New Size', type: 'nusdc_amount' },
        { key: 'exit_price', label: 'Exit Price', type: 'number' },
        { key: 'realized_pnl_value', label: 'PnL', type: 'nusdc_amount' },
        { key: 'realized_pnl_negative', label: 'PnL Negative', type: 'boolean' },
        { key: 'collateral_removed', label: 'Collateral Removed', type: 'nusdc_amount' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    CollateralAdded: {
      label: 'Collateral Added',
      description: 'Collateral was added to a position',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
        { key: 'new_collateral', label: 'New Collateral', type: 'nusdc_amount' },
        { key: 'new_leverage', label: 'New Leverage', type: 'number' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    CollateralRemoved: {
      label: 'Collateral Removed',
      description: 'Collateral was removed from a position',
      fields: [
        { key: 'position_id', label: 'Position ID', type: 'object_id' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
        { key: 'new_collateral', label: 'New Collateral', type: 'nusdc_amount' },
        { key: 'new_leverage', label: 'New Leverage', type: 'number' },
        { key: 'timestamp', label: 'Time', type: 'timestamp_ms' },
      ],
    },
    FeesWithdrawn: {
      label: 'Fees Withdrawn',
      description: 'Trading fees were withdrawn by admin',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'admin', label: 'Admin', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
      ],
    },
  },
};
