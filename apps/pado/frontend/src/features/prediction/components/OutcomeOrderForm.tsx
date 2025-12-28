/**
 * OutcomeOrderForm Component
 * Order form for buying/selling prediction market outcome tokens
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet } from '@nasun/wallet';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import type { PredictionMarket } from '../types';
import { calculateProbability } from '../types';

interface OutcomeOrderFormProps {
  market: PredictionMarket;
  onSuccess?: (digest: string) => void;
}

type OutcomeType = 'yes' | 'no';
type OrderType = 'buy' | 'sell';

export function OutcomeOrderForm({ market, onSuccess }: OutcomeOrderFormProps) {
  const { status } = useWallet();
  const { isLoading, placeBuyOrder, mintTokens } = usePredictionTrade();

  const [outcomeType, setOutcomeType] = useState<OutcomeType>('yes');
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Calculate current probability
  const yesProbability = calculateProbability(market.yesSupply, market.noSupply);
  const noProbability = 100 - yesProbability;

  // Set default price based on current probability
  const defaultPrice = outcomeType === 'yes' ? yesProbability : noProbability;

  // Calculate estimated shares
  const estimatedShares = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const priceNum = parseFloat(price) || defaultPrice;
    if (amountNum <= 0 || priceNum <= 0) return 0;
    // shares = (amount * 100) / price
    return (amountNum * 100) / priceNum;
  }, [amount, price, defaultPrice]);

  // Calculate potential payout
  const potentialPayout = useMemo(() => {
    return estimatedShares; // 1 share = 1 NUSDC if wins
  }, [estimatedShares]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amountNum = parseFloat(amount);
    const priceNum = parseFloat(price) || defaultPrice;

    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (priceNum <= 0 || priceNum >= 100) {
      setError('Price must be between 0% and 100%');
      return;
    }

    if (orderType === 'buy') {
      const result = await placeBuyOrder(market.id, outcomeType === 'yes', priceNum, amountNum);
      if (result.success) {
        setSuccess(`Order placed! Tx: ${result.digest?.slice(0, 8)}...`);
        setAmount('');
        // Show syncing state while blockchain updates
        setIsSyncing(true);
        setTimeout(() => {
          setIsSyncing(false);
          onSuccess?.(result.digest!);
        }, 1500);
      } else {
        setError(result.error || 'Failed to place order');
      }
    } else {
      // Sell order requires Position NFT - will implement in Phase 14.5
      setError('Sell orders coming soon (requires Position NFT)');
    }
  }, [amount, price, defaultPrice, outcomeType, orderType, market.id, placeBuyOrder, onSuccess]);

  const handleMintTokens = useCallback(async () => {
    setError(null);
    setSuccess(null);

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const result = await mintTokens(market.id, amountNum);
    if (result.success) {
      setSuccess(`Minted ${amountNum} YES + ${amountNum} NO tokens! Tx: ${result.digest?.slice(0, 8)}...`);
      setAmount('');
      // Show syncing state while blockchain updates
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        onSuccess?.(result.digest!);
      }, 1500);
    } else {
      setError(result.error || 'Failed to mint tokens');
    }
  }, [amount, market.id, mintTokens, onSuccess]);

  const isDisabled = status !== 'unlocked' || market.status !== 'open' || isLoading;

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">Place Order</h3>

      {/* Outcome Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOutcomeType('yes')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
            outcomeType === 'yes'
              ? 'bg-green-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          YES ({yesProbability.toFixed(1)}%)
        </button>
        <button
          onClick={() => setOutcomeType('no')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
            outcomeType === 'no'
              ? 'bg-red-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          NO ({noProbability.toFixed(1)}%)
        </button>
      </div>

      {/* Order Type */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOrderType('buy')}
          className={`flex-1 py-1.5 px-3 rounded font-medium text-xs transition-colors ${
            orderType === 'buy'
              ? 'bg-blue-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setOrderType('sell')}
          className={`flex-1 py-1.5 px-3 rounded font-medium text-xs transition-colors ${
            orderType === 'sell'
              ? 'bg-blue-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className="block text-sm text-theme-text-muted mb-1">
            Amount (NUSDC)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Price Input */}
        <div>
          <label className="block text-sm text-theme-text-muted mb-1">
            Price (%)
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={defaultPrice.toFixed(1)}
            min="0.1"
            max="99.9"
            step="0.1"
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <p className="text-xs text-theme-text-muted mt-1">
            Current: {defaultPrice.toFixed(1)}%
          </p>
        </div>

        {/* Order Summary */}
        {parseFloat(amount) > 0 && (
          <div className="bg-theme-bg-tertiary rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Est. Shares:</span>
              <span className="text-theme-text-primary font-mono">
                {estimatedShares.toFixed(2)} {outcomeType.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Potential Payout:</span>
              <span className="text-green-500 font-mono">
                {potentialPayout.toFixed(2)} NUSDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Potential Profit:</span>
              <span className="text-green-500 font-mono">
                +{(potentialPayout - parseFloat(amount)).toFixed(2)} NUSDC
              </span>
            </div>
          </div>
        )}

        {/* Error/Success/Syncing Messages */}
        {error && (
          <div className="text-red-500 text-sm bg-red-500/10 rounded-lg p-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-green-500 text-sm bg-green-500/10 rounded-lg p-2">
            {success}
          </div>
        )}
        {isSyncing && (
          <div className="text-blue-400 text-sm bg-blue-500/10 rounded-lg p-2 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Syncing with blockchain...
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isDisabled}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            outcomeType === 'yes'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isLoading
            ? 'Processing...'
            : status !== 'unlocked'
            ? 'Connect Wallet'
            : market.status !== 'open'
            ? 'Market Closed'
            : `${orderType === 'buy' ? 'Buy' : 'Sell'} ${outcomeType.toUpperCase()}`}
        </button>

        {/* Mint Tokens Button */}
        <div className="border-t border-theme-border pt-4 mt-4">
          <p className="text-xs text-theme-text-muted mb-2">
            Or mint both YES + NO tokens at 1:1 ratio
          </p>
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
