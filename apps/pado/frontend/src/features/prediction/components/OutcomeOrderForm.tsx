/**
 * OutcomeOrderForm Component (round-6 plan §2.13)
 *
 * Tab-driven Market | Limit order form. Routes to the v1 CLOB takers/makers:
 *  - Market buy   → placeBuyTaker(maxPrice = bestAsk + slippage, restOnNoFill=false)
 *  - Limit  buy   → placeBuyTaker(maxPrice = user, restOnNoFill=true)
 *  - Market sell  → placeSellTaker(minPrice = bestBid - slippage, restOnNoFill=false)
 *  - Limit  sell  → placeSellTaker(minPrice = user, restOnNoFill=true)
 *
 * Click-from-orderbook flow uses an imperative useEffect keyed on `clickVersion`
 * so user typing is not clobbered by a re-render of the parent (round-5 C14).
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWallet, useZkLogin, usePasskeyStore, useMultiBalance } from '@nasun/wallet';
import { useQueryClient } from '@tanstack/react-query';
import { usePredictionTrade, nusdcUnits } from '../hooks/usePredictionTrade';
import { usePredictionPositions } from '../hooks/usePredictionPositions';
import { useSubmitGuard } from '../../../hooks/useSubmitGuard';
import { useTransactionSync } from '../../../hooks/useTransactionSync';
import { waitForTxIndexing } from '../../../lib/tx-helpers';
import type { PredictionMarket, Orderbook } from '../types';

interface OutcomeOrderFormProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook;
  noOrderbook?: Orderbook;
  clickedPrice?: number | null;       // bps from orderbook click
  clickedOutcome?: 'yes' | 'no' | null;
  clickVersion?: number;
  onSuccess?: (digest?: string) => void;
}

type OutcomeType = 'yes' | 'no';
type OrderType = 'buy' | 'sell';
type OrderMode = 'market' | 'limit';

const SLIPPAGE_BPS = 200; // 2% default slippage for market orders
// Move's validatePriceBps requires `> 0 && < MAX_PRICE (10000)`. Strict bounds.
const MIN_PRICE_BPS = 1;
const MAX_PRICE_BPS = 9999;
const MAX_NUSDC_PER_TX = 100_000; // mirrors Move MAX_PAYMENT_AMOUNT_BASE (round-7 W)

export function OutcomeOrderForm({
  market,
  yesOrderbook,
  noOrderbook,
  clickedPrice,
  clickedOutcome,
  clickVersion = 0,
  onSuccess,
}: OutcomeOrderFormProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const {
    isLoading,
    isFaucetLoading,
    placeBuyTaker,
    placeSellTaker,
    mintTokens,
    requestNusdc,
  } = usePredictionTrade();
  const { data: multiBalance } = useMultiBalance();
  const queryClient = useQueryClient();

  const isWalletConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;
  const { positions, refetch: refetchPositions } = usePredictionPositions(market.id);

  const nusdcBalance = multiBalance?.tokens?.NUSDC?.formatted || '0';

  const [outcomeType, setOutcomeType] = useState<OutcomeType>('yes');
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [orderMode, setOrderMode] = useState<OrderMode>('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { isSubmitting, guard: submitGuard } = useSubmitGuard();
  const { isSyncing, startSync } = useTransactionSync(onSuccess);

  // Imperative sync from orderbook clicks (round-6 plan §2.13).
  useEffect(() => {
    if (clickVersion > 0 && clickedPrice != null && clickedOutcome != null) {
      setPrice((clickedPrice / 100).toFixed(2));
      setOutcomeType(clickedOutcome);
      setOrderMode('limit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickVersion]);

  const filteredPositions = useMemo(
    () => positions.filter((p) => p.isYes === (outcomeType === 'yes')),
    [positions, outcomeType],
  );

  useEffect(() => {
    if (orderType === 'sell' && filteredPositions.length > 0) {
      setSelectedPositionId(filteredPositions[0].id);
    } else if (orderType === 'buy') {
      setSelectedPositionId('');
    }
  }, [orderType, filteredPositions]);

  const activeBook = outcomeType === 'yes' ? yesOrderbook : noOrderbook;
  const realAsks = activeBook?.asks.filter((l) => !l.isSimulated) ?? [];
  const realBids = activeBook?.bids.filter((l) => !l.isSimulated) ?? [];
  const bestAskBps = realAsks.length > 0 ? Math.min(...realAsks.map((l) => l.price)) : null;
  const bestBidBps = realBids.length > 0 ? Math.max(...realBids.map((l) => l.price)) : null;

  // Default price: probability midpoint when no real orders.
  const totalSupply = market.yesSupply + market.noSupply;
  const defaultPriceBps = useMemo(() => {
    if (orderType === 'buy' && bestAskBps != null) return bestAskBps;
    if (orderType === 'sell' && bestBidBps != null) return bestBidBps;
    if (totalSupply === 0n) return 5000;
    if (outcomeType === 'yes') {
      return Number((market.yesSupply * 10000n) / totalSupply);
    }
    return Number((market.noSupply * 10000n) / totalSupply);
  }, [orderType, bestAskBps, bestBidBps, totalSupply, market.yesSupply, market.noSupply, outcomeType]);

  const defaultPricePercent = defaultPriceBps / 100;

  const estimatedShares = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const priceNum = parseFloat(price) || defaultPricePercent;
    if (amountNum <= 0 || priceNum <= 0) return 0;
    return (amountNum * 100) / priceNum;
  }, [amount, price, defaultPricePercent]);

  const potentialPayout = estimatedShares;

  const validateUserInput = useCallback(
    (priceBps: number, amountNum: number): string | null => {
      if (orderType === 'buy' && (!amountNum || amountNum <= 0)) {
        return 'Please enter a valid amount';
      }
      if (orderMode === 'limit' && (priceBps < MIN_PRICE_BPS || priceBps > MAX_PRICE_BPS)) {
        return 'Price must be between 0.01% and 99.99%';
      }
      // Round-7 W: balance + cap pre-check before signing.
      if (orderType === 'buy' && amountNum > MAX_NUSDC_PER_TX) {
        return `Amount exceeds per-transaction cap of ${MAX_NUSDC_PER_TX.toLocaleString('en-US')} NUSDC`;
      }
      if (orderType === 'buy' && amountNum > parseFloat(nusdcBalance)) {
        return `Insufficient NUSDC. Balance: ${parseFloat(nusdcBalance).toFixed(2)}`;
      }
      return null;
    },
    [orderType, orderMode, nusdcBalance],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(null);

      const amountNum = parseFloat(amount);
      const userPricePercent = parseFloat(price);
      const userPriceBps = Number.isFinite(userPricePercent)
        ? Math.floor(userPricePercent * 100)
        : defaultPriceBps;

      const validationError = validateUserInput(userPriceBps, amountNum);
      if (validationError) {
        setError(validationError);
        return;
      }

      const isYes = outcomeType === 'yes';
      const restOnNoFill = orderMode === 'limit';

      await submitGuard(async () => {
        if (orderType === 'buy') {
          // Market: clamp max-price to bestAsk + slippage so we don't blow through the book.
          // Limit: respect user's price ceiling.
          let maxPriceBps: number;
          if (orderMode === 'market') {
            if (bestAskBps == null) {
              setError('No matching orders. Switch to Limit mode and set a price.');
              return;
            }
            // Move requires strict `< MAX_PRICE`. Clamp to MAX_PRICE_BPS - 1 = 9998.
            maxPriceBps = Math.min(MAX_PRICE_BPS - 1, bestAskBps + SLIPPAGE_BPS);
          } else {
            maxPriceBps = userPriceBps;
          }

          const result = await placeBuyTaker(
            market.id,
            isYes,
            maxPriceBps,
            restOnNoFill,
            nusdcUnits(amountNum),
          );
          if (result.success) {
            setSuccess(`Order placed. Tx: ${result.digest?.slice(0, 8)}...`);
            setAmount('');
            startSync(result.digest!);
          } else {
            setError(result.error || 'Failed to place order');
          }
        } else {
          if (!selectedPositionId) {
            setError('Please select a position to sell');
            return;
          }

          let minPriceBps: number;
          if (orderMode === 'market') {
            if (bestBidBps == null) {
              setError('No bids. Switch to Limit mode and set a price.');
              return;
            }
            // Move requires strict `> 0`. Clamp to MIN_PRICE_BPS + 1 = 2.
            minPriceBps = Math.max(MIN_PRICE_BPS + 1, bestBidBps - SLIPPAGE_BPS);
          } else {
            minPriceBps = userPriceBps;
          }

          const result = await placeSellTaker(market.id, selectedPositionId, minPriceBps, restOnNoFill);
          if (result.success) {
            setSuccess(`Sell order placed. Tx: ${result.digest?.slice(0, 8)}...`);
            setPrice('');
            refetchPositions();
            startSync(result.digest!);
          } else {
            setError(result.error || 'Failed to place sell order');
          }
        }
      });
    },
    [
      amount,
      price,
      defaultPriceBps,
      validateUserInput,
      outcomeType,
      orderMode,
      orderType,
      bestAskBps,
      bestBidBps,
      market.id,
      selectedPositionId,
      placeBuyTaker,
      placeSellTaker,
      refetchPositions,
      startSync,
      submitGuard,
    ],
  );

  const handleMintTokens = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    await submitGuard(async () => {
      const result = await mintTokens(market.id, nusdcUnits(amountNum));
      if (result.success) {
        setSuccess(`Minted ${amountNum} YES + ${amountNum} NO tokens. Tx: ${result.digest?.slice(0, 8)}...`);
        setAmount('');
        startSync(result.digest!);
      } else {
        setError(result.error || 'Failed to mint tokens');
      }
    });
  }, [amount, market.id, mintTokens, startSync, submitGuard]);

  const handleNusdcFaucet = useCallback(async () => {
    const result = await requestNusdc();
    if (result.success) {
      if (result.digest) await waitForTxIndexing(result.digest);
      queryClient.invalidateQueries({ queryKey: ['wallet-multi-balance'] });
      setSuccess('100,000 NUSDC received');
    } else {
      setError(result.error || 'Failed to get NUSDC');
    }
  }, [requestNusdc, queryClient]);

  const isDisabled = !isWalletConnected || market.status !== 'open' || isLoading || isSubmitting;
  const walletBalance = parseFloat(nusdcBalance);

  const pricePlaceholder = bestAskBps != null && orderType === 'buy'
    ? `Best ask: ${(bestAskBps / 100).toFixed(2)}%`
    : bestBidBps != null && orderType === 'sell'
    ? `Best bid: ${(bestBidBps / 100).toFixed(2)}%`
    : 'Enter price (1-99)';

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">Place Order</h3>

      {isWalletConnected && (
        <div className="bg-theme-bg-tertiary rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-xs text-theme-text-muted">Wallet Balance</span>
              <p className="text-base sm:text-lg font-semibold text-theme-text-primary tabular-nums truncate">
                {walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-xs sm:text-sm font-normal text-theme-text-muted"> NUSDC</span>
              </p>
            </div>
            <button
              onClick={handleNusdcFaucet}
              disabled={isFaucetLoading}
              className="shrink-0 min-h-[36px] px-3 py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white transition-colors"
            >
              {isFaucetLoading ? 'Requesting...' : 'Get NUSDC'}
            </button>
          </div>
        </div>
      )}

      {/* Mode tabs (Market | Limit) — round-3 N8 prominent. */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOrderMode('market')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
            orderMode === 'market'
              ? 'bg-pd1 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Market
        </button>
        <button
          onClick={() => setOrderMode('limit')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
            orderMode === 'limit'
              ? 'bg-pd1 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Limit
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOutcomeType('yes')}
          className={`flex-1 min-h-[44px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-colors ${
            outcomeType === 'yes'
              ? 'bg-green-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setOutcomeType('no')}
          className={`flex-1 min-h-[44px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-colors ${
            outcomeType === 'no'
              ? 'bg-red-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          NO
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOrderType('buy')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded font-medium text-sm transition-colors ${
            orderType === 'buy'
              ? 'bg-pd1 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setOrderType('sell')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded font-medium text-sm transition-colors ${
            orderType === 'sell'
              ? 'bg-pd1 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {orderType === 'sell' && (
          <div>
            <label className="block text-sm text-theme-text-muted mb-1">Select Position</label>
            {filteredPositions.length === 0 ? (
              <div className="text-sm text-yellow-500 bg-yellow-500/10 rounded-lg p-2">
                No {outcomeType.toUpperCase()} positions available.
                {positions.length > 0 && ' Try the other outcome.'}
              </div>
            ) : (
              <select
                value={selectedPositionId}
                onChange={(e) => setSelectedPositionId(e.target.value)}
                disabled={isDisabled}
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
              >
                {filteredPositions.map((pos) => {
                  const shares = Number(pos.shares) / Math.pow(10, 6);
                  const avgPrice = pos.shares > 0n ? Number(pos.costBasis) / Number(pos.shares) : 0;
                  return (
                    <option key={pos.id} value={pos.id}>
                      {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares @ {avgPrice.toFixed(2)} NUSDC/share
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}

        {orderType === 'buy' && (
          <div>
            <label className="block text-sm text-theme-text-muted mb-1">Amount (NUSDC)</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              disabled={isDisabled}
              className="w-full px-3 py-2.5 text-base bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
          </div>
        )}

        {/* Price input only for limit; market uses bestAsk/bestBid. */}
        {orderMode === 'limit' && (
          <div>
            <label className="block text-sm text-theme-text-muted mb-1">Price (%)</label>
            <input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={pricePlaceholder}
              min="0.01"
              max="99.99"
              step="0.01"
              disabled={isDisabled}
              className="w-full px-3 py-2.5 text-base bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-pd2 disabled:opacity-50"
            />
            <p className="text-xs text-theme-text-muted mt-1">
              Leftover unfilled shares will rest as a maker order.
            </p>
          </div>
        )}

        {orderMode === 'market' && (bestAskBps == null && orderType === 'buy') && (
          <div className="text-xs text-yellow-500 bg-yellow-500/10 rounded-lg p-2">
            No matching asks. Switch to Limit mode and set your price.
          </div>
        )}
        {orderMode === 'market' && (bestBidBps == null && orderType === 'sell') && (
          <div className="text-xs text-yellow-500 bg-yellow-500/10 rounded-lg p-2">
            No bids. Switch to Limit mode and set your price.
          </div>
        )}

        {orderType === 'buy' && parseFloat(amount) > 0 && (
          <div className="bg-theme-bg-tertiary rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Est. Shares:</span>
              <span className="text-theme-text-primary font-mono">
                {estimatedShares.toFixed(2)} {outcomeType.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Potential Payout:</span>
              <span className="text-green-500 font-mono">{potentialPayout.toFixed(2)} NUSDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Potential Profit:</span>
              <span className="text-green-500 font-mono">
                +{(potentialPayout - parseFloat(amount)).toFixed(2)} NUSDC
              </span>
            </div>
          </div>
        )}

        {error && <div className="text-red-500 text-sm bg-red-500/10 rounded-lg p-2">{error}</div>}
        {success && <div className="text-green-500 text-sm bg-green-500/10 rounded-lg p-2">{success}</div>}
        {isSyncing && (
          <div className="text-pd3 text-sm bg-pd2/10 rounded-lg p-2 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Syncing with blockchain...
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            outcomeType === 'yes' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isLoading
            ? 'Processing...'
            : !isWalletConnected
              ? 'Connect Wallet'
              : market.status !== 'open'
                ? 'Market Closed'
                : `${orderMode === 'market' ? 'Market' : 'Limit'} ${orderType === 'buy' ? 'Buy' : 'Sell'} ${outcomeType.toUpperCase()}`}
        </button>

        <div className="border-t border-theme-border pt-4 mt-4">
          <p className="text-xs text-theme-text-muted mb-2">Or mint both YES + NO tokens at 1:1 ratio</p>
          <button
            type="button"
            onClick={handleMintTokens}
            disabled={isDisabled || !amount}
            className="w-full py-2 rounded-lg font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Minting...' : 'Mint YES + NO Tokens'}
          </button>
        </div>
      </form>
    </div>
  );
}
