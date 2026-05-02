/**
 * useShareMarket
 *
 * Tweet helpers for prediction markets. Three contexts: market discovery,
 * post-trade, and resolved win.
 */

import { useCallback } from 'react';
import type { PredictionMarket } from '../types';

const FALLBACK_BASE_URL = 'https://pado.nasun.io/predict';

function getShareBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/predict`;
  }
  return FALLBACK_BASE_URL;
}

function openTweet(text: string, url: string) {
  const params = new URLSearchParams({ text, url });
  window.open(
    `https://twitter.com/intent/tweet?${params.toString()}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export interface UseShareMarketResult {
  shareMarket: (market: PredictionMarket, bestAskBps: number | null) => void;
  shareTrade: (
    market: PredictionMarket,
    isYes: boolean,
    shares: number,
    priceBps: number,
  ) => void;
  shareWin: (market: PredictionMarket) => void;
}

export function useShareMarket(): UseShareMarketResult {
  const shareMarket = useCallback(
    (market: PredictionMarket, bestAskBps: number | null) => {
      const oddsLabel = bestAskBps != null ? ` (${(bestAskBps / 100).toFixed(0)}% YES odds)` : '';
      const text = `Check out this prediction market: "${market.question}"${oddsLabel}\nPado Prediction Markets on Nasun`;
      openTweet(text, `${getShareBaseUrl()}/${market.id}`);
    },
    [],
  );

  const shareTrade = useCallback(
    (market: PredictionMarket, isYes: boolean, shares: number, priceBps: number) => {
      const side = isYes ? 'YES' : 'NO';
      const payout = shares; // 1 winning share = 1 NUSDC at resolution
      const text = `Just bought ${shares.toFixed(2)} ${side} shares @ ${(priceBps / 100).toFixed(0)}% on "${market.question}". Payout if ${side}: $${payout.toFixed(2)}\nPado Prediction Markets on Nasun`;
      openTweet(text, `${getShareBaseUrl()}/${market.id}`);
    },
    [],
  );

  const shareWin = useCallback((market: PredictionMarket) => {
    const text = `Won on "${market.question}"!\nPado Prediction Markets on Nasun`;
    openTweet(text, `${getShareBaseUrl()}/${market.id}`);
  }, []);

  return { shareMarket, shareTrade, shareWin };
}
