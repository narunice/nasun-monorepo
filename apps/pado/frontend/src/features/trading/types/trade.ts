/**
 * Market trade data (from on-chain OrderFilled events)
 */
export interface Trade {
  id: string;
  price: number;
  quantity: number;
  isBuy: boolean;
  timestamp: number;
}
