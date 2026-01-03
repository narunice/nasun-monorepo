/**
 * OutcomeOrderForm Component
 * Order form for buying/selling prediction market outcome tokens
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { usePredictionPositions, formatPositionAmount } from '../hooks/usePredictionPositions';
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
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isLoading, placeBuyOrder, placeSellOrder, mintTokens } = usePredictionTrade();

  // Consider wallet connected if either local wallet is unlocked OR zkLogin is active
  const isWalletConnected = status === 'unlocked' || isZkLoggedIn;
  const { positions, refetch: refetchPositions } = usePredictionPositions(market.id);

  const [outcomeType, setOutcomeType] = useState<OutcomeType>('yes');
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter positions by selected outcome type
  const filteredPositions = useMemo(() => {
    return positions.filter(p => p.isYes === (outcomeType === 'yes'));
  }, [positions, outcomeType]);

  // Auto-select first position when switching to sell mode or outcome type
  useEffect(() => {
    if (orderType === 'sell' && filteredPositions.length > 0) {
      setSelectedPositionId(filteredPositions[0].id);
    } else {
      setSelectedPositionId('');
    }
  }, [orderType, filteredPositions]);

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

    // Amount validation only for buy orders
    if (orderType === 'buy' && (!amountNum || amountNum <= 0)) {
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
      // Sell order using Position NFT
      if (!selectedPositionId) {
        setError('Please select a position to sell');
        return;
      }

      const result = await placeSellOrder(market.id, selectedPositionId, priceNum);
      if (result.success) {
        setSuccess(`Sell order placed! Tx: ${result.digest?.slice(0, 8)}...`);
        setPrice('');
        // Show syncing state while blockchain updates
        setIsSyncing(true);
        setTimeout(() => {
          setIsSyncing(false);
          refetchPositions();
          onSuccess?.(result.digest!);
        }, 1500);
      } else {
        setError(result.error || 'Failed to place sell order');
      }
    }
  }, [amount, price, defaultPrice, outcomeType, orderType, market.id, selectedPositionId, placeBuyOrder, placeSellOrder, refetchPositions, onSuccess]);

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

  const isDisabled = !isWalletConnected || market.status !== 'open' || isLoading;

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
        {/* Position Selector (Sell mode only) */}
        {orderType === 'sell' && (
          <div>
            <label className="block text-sm text-theme-text-muted mb-1">
              Select Position
            </label>
            {filteredPositions.length === 0 ? (
              <div className="text-sm text-yellow-500 bg-yellow-500/10 rounded-lg p-2">
                No {outcomeType.toUpperCase()} positions available to sell.
                {positions.length > 0 && ' Try selecting the other outcome.'}
              </div>
            ) : (
              <select
                value={selectedPositionId}
                onChange={(e) => setSelectedPositionId(e.target.value)}
                disabled={isDisabled}
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {filteredPositions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {formatPositionAmount(pos.shares)} shares @ {formatPositionAmount(pos.costBasis)} NUSDC
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Amount Input (Buy mode only) */}
        {orderType === 'buy' && (
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
        )}

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
            min="0.01"
            max="99.99"
            step="0.01"
            disabled={isDisabled}
            className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <p className="text-xs text-theme-text-muted mt-1">
            Current: {defaultPrice.toFixed(1)}%
          </p>
        </div>

        {/* Order Summary - Buy Mode */}
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

        {/* Order Summary - Sell Mode */}
        {orderType === 'sell' && selectedPositionId && (
          <div className="bg-theme-bg-tertiary rounded-lg p-3 space-y-1 text-sm">
            {(() => {
              const selectedPos = filteredPositions.find(p => p.id === selectedPositionId);
              if (!selectedPos) return null;
              const priceNum = parseFloat(price) || defaultPrice;
              const expectedPayout = Number(selectedPos.shares) / Math.pow(10, 6) * (priceNum / 100);
              const costBasisNum = Number(selectedPos.costBasis) / Math.pow(10, 6);
              const pnl = expectedPayout - costBasisNum;
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-theme-text-muted">Selling:</span>
                    <span className="text-theme-text-primary font-mono">
                      {formatPositionAmount(selectedPos.shares)} {outcomeType.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-muted">At Price:</span>
                    <span className="text-theme-text-primary font-mono">
                      {priceNum.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-muted">Expected Payout:</span>
                    <span className="text-theme-text-primary font-mono">
                      {expectedPayout.toFixed(2)} NUSDC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-text-muted">P&L:</span>
                    <span className={`font-mono ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} NUSDC
                    </span>
                  </div>
                </>
              );
            })()}
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
            : !isWalletConnected
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
