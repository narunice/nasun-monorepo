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
 *
 * Simple/Advanced mode toggle (Plan A): Simple = market buy only; Advanced = full
 * controls (limit, close, mint). Mode persisted per device in localStorage.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { usePredictionTrade, nusdcUnits } from '../hooks/usePredictionTrade';
import { useUnifiedBalance, useMarginAccount } from '../../core/unified-margin';
import { usePredictionPositions } from '../hooks/usePredictionPositions';
import { useSubmitGuard } from '../../../hooks/useSubmitGuard';
import { useTransactionSync } from '../../../hooks/useTransactionSync';
import { usePredictionFormMode } from '../hooks/usePredictionFormMode';
import type { PredictionFormMode } from '../hooks/usePredictionFormMode';
import { formatCentsWithProb } from '../utils/formatPrice';
import { trackEvent, AnalyticsEvent } from '../../../lib/analytics';
import { useTrading } from '../../trading/useTrading';
import { formatErrorMessage } from '../../trading/utils/errorParser';
import { useToast } from '@/components/common/Toast';
import {
  OrderSuccessModal,
  shouldShowOrderModal,
  incrementOrderModalCount,
  type OrderSuccessData,
} from './OrderSuccessModal';
import type { PredictionMarket, Orderbook } from '../types';

interface OutcomeOrderFormProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook;
  noOrderbook?: Orderbook;
  clickedPrice?: number | null;       // bps from orderbook click
  clickedOutcome?: 'yes' | 'no' | null;
  clickVersion?: number;
  isTradingFrozen?: boolean;          // closeTime passed but resolveDeadline not yet — disable trading
  onSuccess?: (digest?: string) => void;
}

type OutcomeType = 'yes' | 'no';
type OrderType = 'buy' | 'sell';
type OrderMode = 'market' | 'limit';

const SLIPPAGE_BPS = 1000; // 10% — thin orderbooks (sparse LP-bot levels) need wide tolerance for market sells; user-configurable slippage UI is the proper fix.
// Move's validatePriceBps requires `> 0 && < MAX_PRICE (10000)`. Strict bounds.
const MIN_PRICE_BPS = 1;
const MAX_PRICE_BPS = 9999;
const NO_ASKS_SIMPLE_ERROR = '__NO_ASKS_SIMPLE__' as const;
const MAX_NUSDC_PER_TX = 100_000; // mirrors Move MAX_PAYMENT_AMOUNT_BASE (round-7 W)

const ANALYTICS_INITIAL_SESSION_KEY = 'pado_prediction_mode_initial_fired';

export function OutcomeOrderForm({
  market,
  yesOrderbook,
  noOrderbook,
  clickedPrice,
  clickedOutcome,
  clickVersion = 0,
  isTradingFrozen = false,
  onSuccess,
}: OutcomeOrderFormProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const {
    isLoading,
    bmId,
    createPadoAccount,
    placeBuyTaker,
    placeBuyTakerWithAutoDeposit,
    placeSellTaker,
    mintTokens,
  } = usePredictionTrade();
  const isWalletConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;
  const { positions, refetch: refetchPositions } = usePredictionPositions(market.id);

  const {
    hasAccount,
    createAccount,
    enablePado,
    isCreating,
    isEnabling,
    isLoading: isLoadingMA,
  } = useMarginAccount();
  const { balanceManagerId, createBalanceManager, registerBalanceManager } = useTrading();
  const { showToast } = useToast();
  const [isEnablingPado, setIsEnablingPado] = useState(false);

  const handleCompleteSetup = useCallback(async () => {
    setIsEnablingPado(true);
    try {
      const hasBm = !!balanceManagerId;
      const hasMa = hasAccount;

      if (!hasBm && !hasMa) {
        const { balanceManagerId: newBmId } = await enablePado();
        registerBalanceManager(newBmId);
        showToast('Pado enabled!', 'success');
        return;
      }

      if (hasBm && !hasMa) {
        await createAccount();
        showToast('Pado enabled!', 'success');
        return;
      }

      if (!hasBm && hasMa) {
        const result = await createBalanceManager();
        if (!result.success) {
          showToast(formatErrorMessage(result.error), 'error');
          return;
        }
        showToast('Pado enabled!', 'success');
        return;
      }
    } catch (error) {
      showToast(formatErrorMessage(error), 'error');
    } finally {
      setIsEnablingPado(false);
    }
  }, [
    enablePado,
    registerBalanceManager,
    hasAccount,
    balanceManagerId,
    createAccount,
    createBalanceManager,
    showToast,
  ]);

  const { breakdown } = useUnifiedBalance();
  // Pado Balance = BM (trading) + MA (margin) NUSDC, both decimal-6.
  const padoBalance =
    Number((breakdown.NUSDC?.trading ?? 0n) + (breakdown.NUSDC?.margin ?? 0n)) / 1e6;
  const walletNusdcRaw = breakdown.NUSDC?.wallet ?? 0n;
  const walletNusdc = Number(walletNusdcRaw) / 1e6;
  // Two-tx setup step: null = idle, 'creating-account' = tx1, 'placing-trade' = tx2
  const [setupStep, setSetupStep] = useState<'creating-account' | 'placing-trade' | null>(null);

  // Auto-deposit toggle: when ON, a buy with insufficient Pado Balance auto-pulls
  // the shortfall from the wallet in a single atomic PTB (deposit + trade).
  // Persisted per device.
  const [autoDepositEnabled, setAutoDepositEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('pado:predictionAutoDeposit');
    return stored === null ? true : stored === '1';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pado:predictionAutoDeposit', autoDepositEnabled ? '1' : '0');
    }
  }, [autoDepositEnabled]);

  const { mode, setMode, isSimple, isAdvanced } = usePredictionFormMode();

  const [outcomeType, setOutcomeType] = useState<OutcomeType>('yes');
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [orderMode, setOrderMode] = useState<OrderMode>('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<OrderSuccessData | null>(null);
  const { isSubmitting, guard: submitGuard } = useSubmitGuard();
  const { isSyncing, startSync } = useTransactionSync(onSuccess);

  // Session-scoped analytics: fire once per session on mount.
  const analyticsInitFired = useRef(false);
  useEffect(() => {
    if (analyticsInitFired.current) return;
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem(ANALYTICS_INITIAL_SESSION_KEY)) return;
    analyticsInitFired.current = true;
    sessionStorage.setItem(ANALYTICS_INITIAL_SESSION_KEY, '1');
    trackEvent(AnalyticsEvent.PREDICTION_FORM_MODE_INITIAL, { mode });
    // mode intentionally excluded from deps — this is a one-shot mount event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetMode = useCallback((newMode: PredictionFormMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    trackEvent(AnalyticsEvent.PREDICTION_FORM_MODE_TOGGLED, { from: mode, to: newMode });
  }, [mode, setMode]);

  // Switching to Simple resets advanced-only controls to safe defaults.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      if (isSimple) {
        setOrderMode('market');
        setOrderType('buy');
      }
    }
  }, [mode, isSimple]);

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

  // Force back to buy if all positions are closed while sell tab is active
  // (otherwise the hidden tab leaves orderType stuck in an invalid state).
  useEffect(() => {
    if (positions.length === 0 && orderType === 'sell') {
      setOrderType('buy');
    }
  }, [positions.length, orderType]);

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
      // Round-7 W: cap pre-check.
      if (orderType === 'buy' && amountNum > MAX_NUSDC_PER_TX) {
        return `Amount exceeds per-transaction cap of ${MAX_NUSDC_PER_TX.toLocaleString('en-US')} NUSDC`;
      }
      // Gate orders to displayed Pado Balance (BM + MA NUSDC). When auto-deposit
      // is ON, allow the trade if wallet covers the shortfall — funds are routed
      // through a single-PTB MA top-up so semantics remain "Pado Balance only".
      if (orderType === 'buy' && amountNum > padoBalance) {
        if (autoDepositEnabled) {
          const shortfall = amountNum - padoBalance;
          if (shortfall > walletNusdc) {
            return `Need ${(amountNum - padoBalance - walletNusdc).toFixed(2)} more NUSDC in wallet for auto-deposit, or reduce the order.`;
          }
          return null;
        }
        return `Insufficient Pado Balance. Available: ${padoBalance.toFixed(2)} NUSDC. Deposit more, enable auto-deposit, or reduce the order.`;
      }
      return null;
    },
    [orderType, orderMode, padoBalance, autoDepositEnabled, walletNusdc],
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
          // Two-tx for first-time users: if no BM, create one first (tx1) then trade (tx2).
          if (!bmId) {
            setSetupStep('creating-account');
            const createResult = await createPadoAccount();
            if (!createResult.success) {
              setSetupStep(null);
              setError(createResult.error || 'Failed to set up Pado account');
              return;
            }
            setSetupStep('placing-trade');
          }

          // Market: clamp max-price to bestAsk + slippage so we don't blow through the book.
          // Limit: respect user's price ceiling.
          let maxPriceBps: number;
          if (orderMode === 'market') {
            if (bestAskBps == null) {
              setSetupStep(null);
              setError(
                isSimple
                  ? NO_ASKS_SIMPLE_ERROR
                  : 'No matching orders. Switch to Limit mode and set a price.',
              );
              return;
            }
            // Move requires strict `< MAX_PRICE`. Clamp to MAX_PRICE_BPS - 1 = 9998.
            maxPriceBps = Math.min(MAX_PRICE_BPS - 1, bestAskBps + SLIPPAGE_BPS);
          } else {
            maxPriceBps = userPriceBps;
          }

          const amountUnits = nusdcUnits(amountNum);
          const needsAutoDeposit = autoDepositEnabled && amountNum > padoBalance;
          let result;
          if (needsAutoDeposit) {
            result = await placeBuyTakerWithAutoDeposit(
              market.id,
              isYes,
              maxPriceBps,
              restOnNoFill,
              amountUnits,
            );
          } else {
            result = await placeBuyTaker(
              market.id,
              isYes,
              maxPriceBps,
              restOnNoFill,
              amountUnits,
            );
          }
          setSetupStep(null);
          if (result.success) {
            const modalData: OrderSuccessData = {
              orderType: 'buy',
              outcomeType,
              orderMode,
              isResting: restOnNoFill,
              shares: estimatedShares,
              cost: amountNum,
              priceBps: maxPriceBps,
              digest: result.digest!,
            };
            if (isSimple && shouldShowOrderModal()) {
              // Only count filled orders toward the auto-show limit; resting
              // orders haven't executed yet so don't consume a modal impression.
              if (!restOnNoFill) incrementOrderModalCount();
              setSuccessModal(modalData);
            } else {
              setSuccess(restOnNoFill
                ? `Limit order resting at ${(maxPriceBps / 100).toFixed(0)}¢. Tx: ${result.digest?.slice(0, 8)}...`
                : `Order placed. Tx: ${result.digest?.slice(0, 8)}...`
              );
            }
            setAmount('');
            startSync(result.digest!);
          } else {
            setError(result.error || 'Failed to place order');
          }
        } else {
          if (!selectedPositionId) {
            setError('Please select a position to close');
            return;
          }

          let minPriceBps: number;
          if (orderMode === 'market') {
            if (bestBidBps == null) {
              setError('No bids. Switch to Limit mode and set a price.');
              return;
            }
            // Move requires strict `> 0`. Clamp to 1¢ (100 bps) as a practical floor —
            // anything below that is dust territory and unsafe as an auto-derived bound.
            minPriceBps = Math.max(100, bestBidBps - SLIPPAGE_BPS);
          } else {
            minPriceBps = userPriceBps;
          }

          const pos = filteredPositions.find((p) => p.id === selectedPositionId);
          const sellShares = pos ? Number(pos.shares) / 1_000_000 : 0;
          const result = await placeSellTaker(market.id, selectedPositionId, minPriceBps, restOnNoFill);
          if (result.success) {
            const modalData: OrderSuccessData = {
              orderType: 'sell',
              outcomeType,
              orderMode,
              isResting: restOnNoFill,
              shares: sellShares,
              cost: 0,
              priceBps: minPriceBps,
              digest: result.digest!,
            };
            if (isSimple && shouldShowOrderModal()) {
              if (!restOnNoFill) incrementOrderModalCount();
              setSuccessModal(modalData);
            } else {
              setSuccess(restOnNoFill
                ? `Close order resting at ${(minPriceBps / 100).toFixed(0)}¢. Tx: ${result.digest?.slice(0, 8)}...`
                : `Close order placed. Tx: ${result.digest?.slice(0, 8)}...`
              );
            }
            setPrice('');
            refetchPositions();
            startSync(result.digest!);
          } else {
            setError(result.error || 'Failed to place close order');
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
      bmId,
      isSimple,
      filteredPositions,
      createPadoAccount,
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



  const isDisabled =
    !isWalletConnected ||
    market.status !== 'open' ||
    isTradingFrozen ||
    isLoading ||
    isSubmitting;

  const pricePlaceholder = bestAskBps != null && orderType === 'buy'
    ? `Best ask: ${formatCentsWithProb(bestAskBps, 2)}`
    : bestBidBps != null && orderType === 'sell'
    ? `Best bid: ${formatCentsWithProb(bestBidBps, 2)}`
    : 'Enter price (1¢ – 99¢)';

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Header: title + Simple/Advanced toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-theme-text-primary">Place Order</h3>
        <div className="flex items-center gap-0.5" role="group" aria-label="Order form mode">
          <button
            type="button"
            aria-pressed={isSimple}
            onClick={() => handleSetMode('simple')}
            disabled={isSubmitting}
            className={`min-h-[44px] px-3 text-sm rounded-l transition-colors disabled:opacity-50 ${
              isSimple
                ? 'font-semibold text-theme-text-primary'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            Simple
          </button>
          <span className="text-theme-text-muted text-sm select-none">|</span>
          <button
            type="button"
            aria-pressed={isAdvanced}
            onClick={() => handleSetMode('advanced')}
            disabled={isSubmitting}
            className={`min-h-[44px] px-3 text-sm rounded-r transition-colors disabled:opacity-50 ${
              isAdvanced
                ? 'font-semibold text-theme-text-primary'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Complete Pado Setup banner for legacy users and new users without MA */}
      {isWalletConnected && !isLoadingMA && !hasAccount && (
        <div className="bg-gradient-to-r from-pd2/10 to-purple-500/10 border border-pd2/30 rounded-xl p-4 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">⚡</span>
                <h4 className="font-semibold text-theme-text-primary text-sm">
                  {balanceManagerId ? 'Complete Pado Setup' : 'Enable Pado'}
                </h4>
              </div>
              <p className="text-sm text-theme-text-secondary">
                {balanceManagerId
                  ? 'A one-time setup is required to enable Pado Balance and auto-deposit.'
                  : 'Enable Pado to use funds across Trading, Predictions, and more.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCompleteSetup}
              disabled={isEnablingPado || isEnabling || isCreating}
              className="flex-shrink-0 px-4 py-2 bg-pd2 hover:bg-pd1 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isEnablingPado || isEnabling || isCreating
                ? 'Setting up...'
                : balanceManagerId
                  ? 'Complete Setup'
                  : 'Enable Pado'}
            </button>
          </div>
        </div>
      )}

      {isWalletConnected && (
        <div className="bg-theme-bg-tertiary rounded-lg p-3 mb-4 space-y-2">
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-xs text-theme-text-muted">Pado Balance</span>
              <p className="text-base sm:text-lg font-semibold text-theme-text-primary tabular-nums truncate">
                {padoBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-xs sm:text-sm font-normal text-theme-text-muted"> NUSDC</span>
              </p>
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 pt-2 border-t border-theme-border cursor-pointer">
            <div className="text-xs text-theme-text-secondary">
              <div>Auto-deposit from wallet</div>
              <div className="text-theme-text-muted text-[11px]">
                {autoDepositEnabled
                  ? `Wallet: ${walletNusdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC available`
                  : 'Trades use Pado Balance only'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoDepositEnabled(!autoDepositEnabled)}
              className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                autoDepositEnabled ? 'bg-green-500' : 'bg-theme-toggle-off'
              }`}
            >
              <span
                className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                  autoDepositEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      )}

      {/* Mode tabs (Market | Limit) — Advanced only */}
      {isAdvanced && (
        <div className="flex gap-1 mb-4 p-1 bg-theme-bg-tertiary rounded-lg">
          <button
            onClick={() => setOrderMode('market')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-md font-semibold text-sm transition-all ${
              orderMode === 'market'
                ? 'bg-theme-bg-primary dark:bg-white/15 text-theme-text-primary shadow-sm ring-1 ring-theme-border dark:ring-white/20'
                : 'bg-transparent text-theme-text-muted dark:text-white/40 hover:text-theme-text-primary dark:hover:text-white/70'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderMode('limit')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-md font-semibold text-sm transition-all ${
              orderMode === 'limit'
                ? 'bg-theme-bg-primary dark:bg-white/15 text-theme-text-primary shadow-sm ring-1 ring-theme-border dark:ring-white/20'
                : 'bg-transparent text-theme-text-muted dark:text-white/40 hover:text-theme-text-primary dark:hover:text-white/70'
            }`}
          >
            Limit
          </button>
        </div>
      )}

      {/* YES/NO segmented toggle — sliding indicator highlights active side */}
      <div className="relative grid grid-cols-2 mb-4 p-1 bg-theme-bg-tertiary rounded-lg">
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md transition-transform duration-200 ease-out ${
            outcomeType === 'yes'
              ? 'translate-x-0 bg-green-500/25 ring-1 ring-green-500/60'
              : 'translate-x-full bg-red-500/25 ring-1 ring-red-500/60'
          }`}
        />
        <button
          onClick={() => setOutcomeType('yes')}
          className={`relative z-10 min-h-[44px] py-2 font-semibold text-sm transition-colors ${
            outcomeType === 'yes' ? 'text-green-700 dark:text-green-300' : 'text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setOutcomeType('no')}
          className={`relative z-10 min-h-[44px] py-2 font-semibold text-sm transition-colors ${
            outcomeType === 'no' ? 'text-red-700 dark:text-red-300' : 'text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          NO
        </button>
      </div>

      {/*
        Buy/Close tabs: Advanced only, and only when user holds positions.
        Simple mode shows a banner instead (see below).
      */}
      {isAdvanced && positions.length > 0 && (
        <div className="flex gap-1 mb-4 p-1 bg-theme-bg-tertiary rounded-lg">
          <button
            onClick={() => setOrderType('buy')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-md font-semibold text-sm transition-all ${
              orderType === 'buy'
                ? 'bg-theme-bg-primary dark:bg-white/15 text-theme-text-primary shadow-sm ring-1 ring-theme-border dark:ring-white/20'
                : 'bg-transparent text-theme-text-muted dark:text-white/40 hover:text-theme-text-primary dark:hover:text-white/70'
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setOrderType('sell')}
            className={`flex-1 min-h-[44px] py-2 px-3 rounded-md font-semibold text-sm transition-all ${
              orderType === 'sell'
                ? 'bg-theme-bg-primary dark:bg-white/15 text-theme-text-primary shadow-sm ring-1 ring-theme-border dark:ring-white/20'
                : 'bg-transparent text-theme-text-muted dark:text-white/40 hover:text-theme-text-primary dark:hover:text-white/70'
            }`}
          >
            Close position
          </button>
        </div>
      )}

      {/* Simple mode: actionable banner when user holds positions */}
      {isSimple && positions.length > 0 && (
        <div className="mb-4 rounded-lg bg-theme-bg-tertiary p-3 flex items-center justify-between gap-2">
          <span className="text-sm text-theme-text-secondary">You hold shares in this market.</span>
          <button
            type="button"
            aria-label="Switch to Advanced mode to close position"
            onClick={() => { handleSetMode('advanced'); setOrderType('sell'); }}
            className="shrink-0 text-sm text-pd3 hover:underline font-medium whitespace-nowrap"
          >
            Switch to Advanced to close →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {orderType === 'sell' && (
          <div>
            <label className="block text-sm text-theme-text-muted mb-1">Position to close</label>
            {filteredPositions.length === 0 ? (
              <div className="text-sm text-yellow-500 bg-yellow-500/25 rounded-lg p-2">
                No {outcomeType.toUpperCase()} shares to close.
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

        {/* No-liquidity warnings: Advanced only (Simple gets inline error on submit) */}
        {isAdvanced && orderMode === 'market' && bestAskBps == null && orderType === 'buy' && (
          <div className="text-sm text-yellow-500 bg-yellow-500/25 rounded-lg p-2">
            No matching asks. Switch to Limit mode and set your price.
          </div>
        )}
        {isAdvanced && orderMode === 'market' && bestBidBps == null && orderType === 'sell' && (
          <div className="text-sm text-yellow-500 bg-yellow-500/25 rounded-lg p-2">
            No bids. Switch to Limit mode and set your price.
          </div>
        )}

        {/* Payout summary — 2-line format (both modes) */}
        {orderType === 'buy' && parseFloat(amount) > 0 && estimatedShares > 0 && (() => {
          const cost = parseFloat(amount);
          const profit = potentialPayout - cost;
          const returnPct = cost > 0 ? (profit / cost) * 100 : 0;
          const cappedReturn = Math.min(returnPct, 9999);
          const isYes = outcomeType === 'yes';
          const loseOutcome = isYes ? 'NO' : 'YES';
          return (
            <div className={`rounded-xl p-4 border ${isYes ? 'bg-green-500/25 border-green-500/50' : 'bg-red-500/25 border-red-500/50'}`}>
              {/* Win row */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs text-theme-text-muted w-24 shrink-0">
                  If {outcomeType.toUpperCase()} wins
                </span>
                <span className={`text-xl font-bold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
                  ${potentialPayout.toFixed(2)}
                </span>
                <span className={`text-sm font-semibold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
                  ({returnPct >= 0 ? '+' : ''}{cappedReturn.toFixed(0)}%)
                </span>
              </div>
              {/* Loss row */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-theme-text-muted w-24 shrink-0">
                  If {loseOutcome} wins
                </span>
                <span className="text-sm text-theme-text-muted">
                  -${cost.toFixed(2)} (you lose your stake)
                </span>
              </div>
              <p className="text-xs text-theme-text-muted mt-2">
                {estimatedShares.toFixed(2)} shares &times; $1.00
              </p>
            </div>
          );
        })()}

        {orderType === 'sell' && selectedPositionId && (() => {
          const pos = filteredPositions.find((p) => p.id === selectedPositionId);
          if (!pos) return null;
          const shares = Number(pos.shares) / 1_000_000;
          const limitBps = Math.floor((parseFloat(price) || 0) * 100);
          const sellBps = orderMode === 'limit' ? limitBps : (bestBidBps ?? 0);
          if (sellBps <= 0) return null;
          const sellNow = shares * (sellBps / 10000);
          const winPayout = shares;
          return (
            <div className="bg-theme-bg-tertiary rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Close now</span>
                <span className="font-mono text-theme-text-primary">${sellNow.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-text-muted">If {outcomeType.toUpperCase()} wins</span>
                <span className="font-mono text-theme-text-secondary">${winPayout.toFixed(2)}</span>
              </div>
            </div>
          );
        })()}

        {error && (
          <div className="text-red-500 text-sm bg-red-500/25 rounded-lg p-2">
            {error === NO_ASKS_SIMPLE_ERROR ? (
              <>
                No sellers at any price right now. Try again later, or{' '}
                <button
                  type="button"
                  className="underline hover:no-underline font-medium"
                  onClick={() => handleSetMode('advanced')}
                >
                  switch to Advanced
                </button>{' '}
                to set your own price.
              </>
            ) : error}
          </div>
        )}
        {success && (
          <div className="text-green-500 text-sm bg-green-500/25 rounded-lg p-2">
            {success}
          </div>
        )}
        {isSyncing && (
          <div className="text-pd3 text-sm bg-pd2/25 rounded-lg p-2 flex items-center gap-2">
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
        {setupStep && (
          <div className="text-theme-text-secondary text-sm bg-theme-bg-tertiary rounded-lg p-2 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {setupStep === 'creating-account'
              ? 'Setting up Pado account (1/2)...'
              : 'Placing trade (2/2)...'}
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className={`w-full py-3 min-h-[48px] rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            outcomeType === 'yes' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isLoading
            ? 'Processing...'
            : !isWalletConnected
              ? 'Connect Wallet'
              : market.status !== 'open'
                ? 'Market Closed'
                : isTradingFrozen
                  ? 'Awaiting Resolution'
                  : orderType === 'sell'
                    ? `Close ${outcomeType.toUpperCase()} position`
                    : isSimple
                      ? `Buy ${outcomeType.toUpperCase()}`
                      : `${orderMode === 'market' ? 'Market' : 'Limit'} Buy ${outcomeType.toUpperCase()}`}
        </button>

        {/* Mint section — Advanced only */}
        {isAdvanced && (
          <div className="border-t border-theme-border pt-4 mt-4">
            <p className="text-xs text-theme-text-muted mb-2">Or mint both YES + NO tokens at 1:1 ratio</p>
            <button
              type="button"
              onClick={handleMintTokens}
              disabled={isDisabled || !amount}
              className="w-full py-2 min-h-[48px] rounded-lg font-medium text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Minting...' : 'Mint YES + NO Tokens'}
            </button>
          </div>
        )}

        <p className="text-sm leading-snug text-theme-text-secondary text-center pt-2">
          Prediction market contracts. You may lose your entire position. Not investment advice.
        </p>
      </form>

      {successModal && (
        <OrderSuccessModal
          onClose={() => setSuccessModal(null)}
          market={market}
          data={successModal}
        />
      )}
    </div>
  );
}
