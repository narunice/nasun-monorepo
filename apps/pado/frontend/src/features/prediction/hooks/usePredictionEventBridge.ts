/**
 * usePredictionEventBridge — bridges PredictionEventService events to React Query
 * cache invalidations. Mount once at the /predict route layout level so the
 * subscription stays alive while the user is anywhere in the prediction UI.
 *
 * Without this, every query has to poll on its own interval (which is what the
 * page used to do — see commit 08b68d34 lifted recent-fills polling to 6s).
 * With it, polling stays as a long-interval safety net (60s) and real-time
 * freshness comes from the subscription firing invalidate within ~5s of an
 * on-chain event.
 *
 * Each event type maps to a fixed set of queryKey prefixes (see PLAN section
 * "Invalidation map"). The bridge does not know about any specific marketId —
 * it invalidates every market's keys; React Query only refetches keys that
 * have an active observer, so unrelated markets stay idle.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getPredictionEventService, type PredictionEventEnvelope } from '../lib/prediction-event-service';
import { useActiveAddress } from './useActiveAddress';

export function usePredictionEventBridge(): void {
  const queryClient = useQueryClient();
  const myAddress = useActiveAddress();
  const myAddressLc = myAddress?.toLowerCase();

  useEffect(() => {
    const svc = getPredictionEventService();

    const isMine = (json: Record<string, unknown>): boolean => {
      if (!myAddressLc) return false;
      const taker = String(json.taker ?? '').toLowerCase();
      const maker = String(json.maker ?? '').toLowerCase();
      const user = String(json.user ?? '').toLowerCase();
      const owner = String(json.owner ?? '').toLowerCase();
      return (
        taker === myAddressLc ||
        maker === myAddressLc ||
        user === myAddressLc ||
        owner === myAddressLc
      );
    };

    const marketIdOf = (env: PredictionEventEnvelope): string | undefined => {
      const v = env.parsedJson.market_id;
      return typeof v === 'string' ? v : undefined;
    };

    const offFilled = svc.subscribe('OrderFilled', (env) => {
      const mid = marketIdOf(env);
      if (!mid) return;
      // Orderbook + shared fills + market metadata.
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'yes'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'no'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'market-fills', mid] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'market', mid] });
      // User-scoped: positions / my-fills / history / orders.
      if (isMine(env.parsedJson) && myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', myAddressLc] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-fills', mid, myAddressLc] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-trade-history', mid, myAddressLc] });
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-orders', mid, myAddressLc] });
      }
    });

    const offPlaced = svc.subscribe('OrderPlaced', (env) => {
      const mid = marketIdOf(env);
      if (!mid) return;
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'yes'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'no'] });
      if (isMine(env.parsedJson) && myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-orders', mid, myAddressLc] });
      }
    });

    const offCancelled = svc.subscribe('OrderCancelled', (env) => {
      const mid = marketIdOf(env);
      if (!mid) return;
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'yes'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'orderbook', mid, 'no'] });
      if (isMine(env.parsedJson) && myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction', 'my-orders', mid, myAddressLc] });
      }
    });

    const offResolved = svc.subscribe('MarketResolved', (env) => {
      const mid = marketIdOf(env);
      // List status changed; refresh markets list and the specific market.
      queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'markets'] });
      if (mid) queryClient.invalidateQueries({ queryKey: ['prediction', 'market', mid] });
      // Holder positions become claimable.
      if (myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', myAddressLc] });
        queryClient.invalidateQueries({ queryKey: ['wallet-multi-balance'] });
        queryClient.invalidateQueries({ queryKey: ['bm-balance-global'] });
      }
    });

    const offCancelledMarket = svc.subscribe('MarketCancelled', (env) => {
      const mid = marketIdOf(env);
      queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'markets'] });
      if (mid) queryClient.invalidateQueries({ queryKey: ['prediction', 'market', mid] });
      if (myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', myAddressLc] });
      }
    });

    const offCreated = svc.subscribe('MarketCreated', () => {
      queryClient.invalidateQueries({ queryKey: ['prediction-markets-with-orderbooks'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', 'markets'] });
    });

    const offMinted = svc.subscribe('TokensMinted', (env) => {
      if (isMine(env.parsedJson) && myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', myAddressLc] });
      }
    });

    const offClaimed = svc.subscribe('WinningsClaimed', (env) => {
      if (isMine(env.parsedJson) && myAddressLc) {
        queryClient.invalidateQueries({ queryKey: ['prediction-positions', myAddressLc] });
        queryClient.invalidateQueries({ queryKey: ['wallet-multi-balance'] });
        queryClient.invalidateQueries({ queryKey: ['bm-balance-global'] });
      }
    });

    return () => {
      offFilled();
      offPlaced();
      offCancelled();
      offResolved();
      offCancelledMarket();
      offCreated();
      offMinted();
      offClaimed();
    };
  }, [queryClient, myAddressLc]);
}
