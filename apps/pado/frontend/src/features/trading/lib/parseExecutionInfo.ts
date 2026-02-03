/**
 * Parse order execution info from transaction events
 */

import { NETWORK_CONFIG } from '../../../config/network';
import type { OrderExecutionInfo } from '../types';

/**
 * Parse execution info from DeepBook OrderInfo/OrderFilled events
 * @param events - Transaction events
 * @param quantity - Order quantity (human-readable)
 * @param isBid - Whether this is a buy order
 * @param baseDecimals - Base token decimals
 * @param quoteDecimals - Quote token decimals
 */
export function parseExecutionInfo(
  events: any[],
  quantity: number,
  isBid: boolean,
  baseDecimals: number = 8,
  quoteDecimals: number = 6
): OrderExecutionInfo | undefined {
  if (!events || events.length === 0) return undefined;

  const orderInfoType = `${NETWORK_CONFIG.deepbookPackage}::order_info::OrderInfo`;
  const orderFilledType = `${NETWORK_CONFIG.deepbookPackage}::order_info::OrderFilled`;

  // Extract execution info from OrderInfo event
  const orderInfoEvent = events.find((e: any) => e.type === orderInfoType);
  if (orderInfoEvent?.parsedJson) {
    const json = orderInfoEvent.parsedJson;
    const executedQty = Number(json.executed_quantity || 0) / Math.pow(10, baseDecimals);
    const originalQty = Number(json.original_quantity || 0) / Math.pow(10, baseDecimals);
    const remainingQty = originalQty - executedQty;
    const cumulativeQuote = Number(json.cumulative_quote_quantity || 0) / Math.pow(10, quoteDecimals);
    const avgPrice = executedQty > 0 ? cumulativeQuote / executedQty : 0;

    let status: 'filled' | 'partial' | 'placed' = 'placed';
    if (executedQty >= originalQty * 0.9999) {
      status = 'filled';
    } else if (executedQty > 0) {
      status = 'partial';
    }

    return {
      executedQuantity: executedQty,
      executedQuote: cumulativeQuote,
      remainingQuantity: remainingQty,
      avgPrice,
      isBid,
      status,
    };
  }

  // Fallback: extract from OrderFilled events
  const filledEvents = events.filter((e: any) => e.type === orderFilledType);
  if (filledEvents.length > 0) {
    let totalBase = 0;
    let totalQuote = 0;
    filledEvents.forEach((e: any) => {
      if (e.parsedJson) {
        totalBase += Number(e.parsedJson.base_quantity || 0);
        totalQuote += Number(e.parsedJson.quote_quantity || 0);
      }
    });

    const executedQty = totalBase / Math.pow(10, baseDecimals);
    const executedQuote = totalQuote / Math.pow(10, quoteDecimals);
    const remainingQty = quantity - executedQty;
    const avgPrice = executedQty > 0 ? executedQuote / executedQty : 0;

    let status: 'filled' | 'partial' | 'placed' = 'placed';
    if (executedQty >= quantity * 0.9999) {
      status = 'filled';
    } else if (executedQty > 0) {
      status = 'partial';
    }

    return {
      executedQuantity: executedQty,
      executedQuote,
      remainingQuantity: remainingQty,
      avgPrice,
      isBid,
      status,
    };
  }

  return undefined;
}
