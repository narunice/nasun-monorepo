/**
 * useOrderFillNotifier Hook
 *
 * Subscribes to EventService OrderFilled events and notifies the user
 * when their orders are filled. Shows toast (foreground) + browser
 * notification (background) + sound effect.
 */

import { useEffect, useRef } from 'react';
import { getEventService } from '../../../lib/event-service';
import { playSound } from '../../../lib/sounds';
import { sendBrowserNotification } from '../../../lib/browser-notify';
import { useToast } from '@/components/common';
import type { DeepBookEvent, OrderFilledEvent } from '../types/events';
import { priceScaleExp } from '../../../lib/deepbook';

// Custom event for cross-component fill notification (Orderbook highlight, chart markers)
export const ORDER_FILL_EVENT = 'pado:order-filled';
export interface OrderFillDetail {
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

interface UseOrderFillNotifierParams {
  balanceManagerId: string | null;
  quoteDecimals: number;
  baseDecimals: number;
}

/**
 * Monitors OrderFilled events and notifies the user when their orders are filled.
 * Must be mounted inside a component that has access to useToast.
 */
export function useOrderFillNotifier({
  balanceManagerId,
  quoteDecimals,
  baseDecimals,
}: UseOrderFillNotifierParams): void {
  const { showToast } = useToast();

  // Use refs to avoid re-subscribing when params change
  const bmIdRef = useRef(balanceManagerId);
  const quoteDecRef = useRef(quoteDecimals);
  const baseDecRef = useRef(baseDecimals);
  const toastRef = useRef(showToast);

  // Sync refs in effect to avoid mutating during render
  useEffect(() => {
    bmIdRef.current = balanceManagerId;
    quoteDecRef.current = quoteDecimals;
    baseDecRef.current = baseDecimals;
    toastRef.current = showToast;
  });

  useEffect(() => {
    const eventService = getEventService();

    const handleOrderFilled = (event: DeepBookEvent) => {
      if (event.type !== 'OrderFilled') return;

      const bmId = bmIdRef.current;
      if (!bmId) return;

      const data = event.data as OrderFilledEvent;
      const isMaker = data.makerBalanceManagerId === bmId;
      const isTaker = data.takerBalanceManagerId === bmId;
      if (!isMaker && !isTaker) return;

      // Determine user's side
      const side = isTaker
        ? (data.takerIsBid ? 'Buy' : 'Sell')
        : (data.takerIsBid ? 'Sell' : 'Buy');

      const price = Number(data.price) / Math.pow(10, priceScaleExp(quoteDecRef.current, baseDecRef.current));
      const qty = Number(data.quantity) / Math.pow(10, baseDecRef.current);

      const priceStr = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const qtyStr = qty.toLocaleString('en-US', { maximumFractionDigits: 6 });
      const body = `${side} ${qtyStr} @ $${priceStr}`;

      playSound('orderFilled');
      toastRef.current(`Order filled: ${body} (in Pado)`, 'success');
      sendBrowserNotification('Order Filled', {
        body: `${body} (in Pado)`,
        tag: `order-fill-${data.txDigest}`,
      });

      // Broadcast fill to Orderbook (highlight) and chart (markers)
      document.dispatchEvent(new CustomEvent<OrderFillDetail>(ORDER_FILL_EVENT, {
        detail: {
          price,
          quantity: qty,
          side: side.toLowerCase() as 'buy' | 'sell',
          timestamp: Date.now(),
        },
      }));
    };

    const unsubscribe = eventService.subscribe('OrderFilled', handleOrderFilled);
    return unsubscribe;
  }, []); // Subscribe once, use refs for latest values
}
