/**
 * Prediction Market event registry
 */
import { devnetConfig } from '@nasun/devnet-config';
import type { ProtocolEventGroup } from '../types';

export const PREDICTION_EVENTS: ProtocolEventGroup = {
  name: 'Prediction',
  badgeVariant: 'info',
  packageIds: [devnetConfig.prediction.packageId],
  module: 'prediction_market',
  events: {
    MarketCreated: {
      label: 'Market Created',
      description: 'A new prediction market was created',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'question', label: 'Question', type: 'string' },
        { key: 'category', label: 'Category', type: 'string' },
        { key: 'close_time', label: 'Close Time', type: 'timestamp_ms' },
        { key: 'creator', label: 'Creator', type: 'address' },
      ],
    },
    TokensMinted: {
      label: 'Tokens Minted',
      description: 'Position tokens were minted',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'user', label: 'User', type: 'address' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
      ],
    },
    OrderPlaced: {
      label: 'Order Placed',
      description: 'A limit order was placed',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'order_id', label: 'Order ID', type: 'number' },
        { key: 'user', label: 'User', type: 'address' },
        { key: 'is_yes', label: 'Side', type: 'boolean' },
        { key: 'is_bid', label: 'Is Bid', type: 'boolean' },
        { key: 'price', label: 'Price', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
      ],
    },
    OrderFilled: {
      label: 'Order Filled',
      description: 'An order was matched and filled',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'order_id', label: 'Order ID', type: 'number' },
        { key: 'maker', label: 'Maker', type: 'address' },
        { key: 'taker', label: 'Taker', type: 'address' },
        { key: 'is_yes', label: 'Side', type: 'boolean' },
        { key: 'price', label: 'Price', type: 'number' },
        { key: 'amount', label: 'Amount', type: 'nusdc_amount' },
      ],
    },
    OrderCancelled: {
      label: 'Order Cancelled',
      description: 'An order was cancelled',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'order_id', label: 'Order ID', type: 'number' },
        { key: 'user', label: 'User', type: 'address' },
      ],
    },
    MarketResolved: {
      label: 'Market Resolved',
      description: 'A prediction market was resolved',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'outcome', label: 'Outcome', type: 'boolean' },
        { key: 'resolver', label: 'Resolver', type: 'address' },
      ],
    },
    WinningsClaimed: {
      label: 'Winnings Claimed',
      description: 'Winnings were claimed from a resolved market',
      fields: [
        { key: 'market_id', label: 'Market ID', type: 'object_id' },
        { key: 'user', label: 'User', type: 'address' },
        { key: 'shares', label: 'Shares', type: 'number' },
        { key: 'payout', label: 'Payout', type: 'nusdc_amount' },
      ],
    },
  },
};
