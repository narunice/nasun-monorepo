/**
 * TradingPanel Container
 * 주문 폼 + BalanceManager 카드 + 오픈 오더 (lg:col-span-1)
 * Simple mode: SimpleOrderForm only
 * Pro mode: Full OrderForm + BalanceManager + Open Orders
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';
import { useToast } from '@/components/common';
import { useOrderbook, useOpenOrders, useOrderActions, useOrderFillNotifier, type TradeMode } from '../hooks';
import { useTradeCap } from '../hooks/useTradeCap';
import { useTPSLMonitor } from '../hooks/useTPSLMonitor';
import { useOrderForm, useMarket } from '../context';
import { calcLockedAmounts } from '../types';
import { OrderForm, OrderConfirmModal, SwapOrderForm, TPSLKeeperBadge } from '../components';
import { TPSLKeeperModal, isKeeperModalSeen } from '../components/TPSLKeeperModal';
import type { ScaleOrderItem } from '../components/ScaleOrderForm';
import type { PriceLevel } from '../../../lib/deepbook';

// Stable empty array reference to avoid useMemo invalidation
const EMPTY_LEVELS: PriceLevel[] = [];

export function EnablePadoInfo({ variant = 'simple' }: { variant?: 'simple' | 'pro' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <span className="relative inline-block align-middle ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-theme-text-muted hover:text-theme-text-secondary transition-colors"
        aria-label="What is Enable Pado?"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <text x="8" y="12" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="600">i</text>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-theme-bg-secondary border border-theme-border rounded-lg p-4 shadow-lg z-50 text-left">
          {variant === 'simple' ? (
            <>
              <p className="text-xs xl:text-sm font-semibold text-theme-text-primary mb-2">
                Why do I need to enable Pado?
              </p>
              <p className="text-xs xl:text-sm text-theme-text-secondary mb-2 leading-relaxed">
                On centralized exchanges, the platform holds your funds. Pado is
                a decentralized exchange where you control your own assets.
              </p>
              <p className="text-xs xl:text-sm text-theme-text-secondary mb-3 leading-relaxed">
                &ldquo;Enable Pado&rdquo; creates a secure on-chain account to hold
                your trading funds. This is a one-time setup&mdash;once enabled,
                you can start trading immediately.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs xl:text-sm font-semibold text-theme-text-primary mb-2">
                What does Enable Pado do?
              </p>
              <p className="text-xs xl:text-sm text-theme-text-secondary mb-2 leading-relaxed">
                Creates a DeepBook V3 <span className="text-theme-text-primary">BalanceManager</span> and
                a <span className="text-theme-text-primary">Unified Margin Account</span> in
                a single transaction.
              </p>
              <div className="text-xs xl:text-sm text-theme-text-secondary mb-2 leading-relaxed">
                <p className="font-medium text-theme-text-primary mb-1">BalanceManager</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>On-chain object that holds your trading balances</li>
                  <li>Supports multiple tokens (NBTC, NUSDC, etc.)</li>
                  <li>Auto-deposit from wallet when placing orders</li>
                </ul>
              </div>
              <div className="text-xs xl:text-sm text-theme-text-secondary mb-3 leading-relaxed">
                <p className="font-medium text-theme-text-primary mb-1">Margin Account</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Shared across Trading, Predictions, and Lending</li>
                  <li>Multi-collateral support (NUSDC + NBTC)</li>
                </ul>
              </div>
              <p className="text-xs xl:text-sm text-theme-text-muted mb-3 leading-relaxed">
                Comparable to CEX API key + account activation, but fully
                self-custodial on-chain.
              </p>
            </>
          )}
        </div>
      )}
    </span>
  );
}

/** Standalone Enable Pado card for use outside TradingPanel (e.g. Chat column) */
export function EnablePadoCard() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;
  const { isLoading, balanceManagerId, handleCreateBalanceManager } = useOrderActions();

  if (!isConnected || balanceManagerId) return null;

  return (
    <div className="shrink-0 bg-theme-bg-secondary rounded-lg p-4">
      <h3 className="text-sm xl:text-base font-semibold mb-3 text-theme-text-primary">Enable Pado</h3>
      <div className="text-xs xl:text-sm text-theme-text-muted mb-3">
        Enable Pado to start trading. Funds will be automatically deposited when needed.
        <EnablePadoInfo variant="pro" />
      </div>
      <button
        onClick={handleCreateBalanceManager}
        disabled={isLoading}
        className="w-full py-2 bg-pd1 hover:bg-pd1/80 disabled:bg-pd1/60 text-white rounded-lg text-sm xl:text-base font-medium transition-colors"
      >
        {isLoading ? 'Enabling...' : 'Enable Pado'}
      </button>
    </div>
  );
}

interface TradingPanelProps {
  mode?: TradeMode;
}

export function TradingPanel({ mode = 'pro' }: TradingPanelProps) {
  const isSimple = mode === 'simple';
  const { showToast } = useToast();
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;
  const walletAddress = account?.address ?? zkState?.address;

  // Market context for base token symbol
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;

  // 오더북 데이터 (가격 정보 + depth for price impact)
  const { data: orderbookData } = useOrderbook();
  const midPrice = orderbookData?.midPrice ?? 0;
  const bids = orderbookData?.orderbook?.bids ?? EMPTY_LEVELS;
  const asks = orderbookData?.orderbook?.asks ?? EMPTY_LEVELS;
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;

  // 주문 액션
  const {
    isLoading,
    balanceManagerId,
    isAutoDepositing,
    handleLimitOrder,
    handleMarketOrder,
    handleCreateBalanceManager,
  } = useOrderActions();

  // BM balance data
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const bmBalance = openOrdersData?.balance ?? { base: 0, quote: 0 };
  const openOrders = openOrdersData?.orders ?? [];

  // In-orders locked amounts (buy orders lock quote, sell orders lock base)
  const { lockedQuote, lockedBase } = calcLockedAmounts(openOrders);

  // Wallet balances for unified available balance
  const { data: multiBalance } = useMultiBalance();
  const walletBase = parseFloat(multiBalance?.tokens[baseSymbol]?.formatted ?? '0');
  const walletQuote = parseFloat(multiBalance?.tokens['NUSDC']?.formatted ?? '0');
  const availableBase = walletBase + bmBalance.base;
  const availableQuote = walletQuote + bmBalance.quote;

  // TradeCap delegation for server-side TP/SL execution
  const tradeCap = useTradeCap(balanceManagerId, walletAddress);

  // Order fill notifier — browser notification + sound when user's orders are filled
  useOrderFillNotifier({
    balanceManagerId,
    quoteDecimals: currentPool.quoteToken.decimals,
    baseDecimals: currentPool.baseToken.decimals,
  });

  // TP/SL Monitor — mount once, monitors price and auto-executes market/limit orders
  const { addOrderAsync: addTPSLOrderAsync } = useTPSLMonitor({
    executeMarketOrder: useCallback(async (orderSide: 'buy' | 'sell', quantity: number) => {
      return handleMarketOrder(orderSide, quantity);
    }, [handleMarketOrder]),
    executeLimitOrder: useCallback(async (orderSide: 'buy' | 'sell', quantity: number, limitPrice: number) => {
      return handleLimitOrder(orderSide, limitPrice, quantity);
    }, [handleLimitOrder]),
    hasBalanceManager: !!balanceManagerId,
    marketSymbol: baseSymbol as import('../../../lib/prices').TokenSymbol,
    poolId: currentPool.id,
    walletAddress,
    balanceManagerId,
    tradeCapStatus: tradeCap.status,
    tradeCapId: tradeCap.tradeCapId,
  });

  // TP/SL Keeper modal — show after first TP/SL order creation
  const [showKeeperModal, setShowKeeperModal] = useState(false);
  const hasShownKeeperModalRef = useRef(false);

  // 주문 폼 상태 (Context)
  const {
    price,
    amount,
    side,
    setSide,
    orderMode,
    executionOption,
    setExecutionOption,
    getOrderType,
    slippage,
    setSlippage,
    oneClickEnabled,
    setOneClickEnabled,
    isConfirmModalOpen,
    pendingOrderType,
    setPrice,
    setAmount,
    openConfirmModal,
    closeConfirmModal,
    resetForm,
    tpslEnabled,
    tpPrice,
    slPrice: slPriceValue,
    stopPrice,
    trailValue,
    trailMode,
    ocoEnabled,
  } = useOrderForm();

  // Create TP/SL orders after successful main order (with optional OCO linking)
  const createTPSLOrdersIfEnabled = useCallback(async (orderSide: 'buy' | 'sell', qty: number) => {
    if (!tpslEnabled) return;
    const tpValue = parseFloat(tpPrice);
    const slValue = parseFloat(slPriceValue);
    const closeSide = orderSide === 'buy' ? 'sell' : 'buy';
    const hasTP = tpValue > 0 && Number.isFinite(tpValue);
    const hasSL = slValue > 0 && Number.isFinite(slValue);

    // Generate shared OCO group ID if OCO enabled and both TP+SL are set
    const ocoGroupId = ocoEnabled && hasTP && hasSL ? crypto.randomUUID() : undefined;

    if (hasTP) {
      await addTPSLOrderAsync({ side: closeSide, quantity: qty, triggerPrice: tpValue, triggerType: 'tp', ocoGroupId, marketSymbol: baseSymbol });
    }
    if (hasSL) {
      await addTPSLOrderAsync({ side: closeSide, quantity: qty, triggerPrice: slValue, triggerType: 'sl', ocoGroupId, marketSymbol: baseSymbol });
    }

    // Show keeper modal after first TP/SL order creation (P3-1: post-order timing)
    if ((hasTP || hasSL) && !hasShownKeeperModalRef.current) {
      if (!isKeeperModalSeen(walletAddress) && tradeCap.isKeeperAvailable && tradeCap.status !== 'delegated') {
        setShowKeeperModal(true);
        hasShownKeeperModalRef.current = true;
      }
    }
  }, [tpslEnabled, tpPrice, slPriceValue, ocoEnabled, addTPSLOrderAsync, baseSymbol, walletAddress, tradeCap.isKeeperAvailable, tradeCap.status]);

  // Stop-Limit order handler — creates a conditional order in TP/SL storage
  const handleStopLimitOrder = useCallback(async (orderSide: 'buy' | 'sell') => {
    const stopPriceNum = parseFloat(stopPrice);
    const limitPriceNum = parseFloat(price);
    const amountNum = parseFloat(amount);

    if (!Number.isFinite(stopPriceNum) || stopPriceNum <= 0) return;
    if (!Number.isFinite(limitPriceNum) || limitPriceNum <= 0) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;

    await addTPSLOrderAsync({
      side: orderSide,
      quantity: amountNum,
      triggerPrice: stopPriceNum,
      triggerType: 'stop-limit',
      limitPrice: limitPriceNum,
      marketSymbol: baseSymbol,
    });
    resetForm();
  }, [stopPrice, price, amount, addTPSLOrderAsync, resetForm, baseSymbol]);

  // Trailing Stop order handler — creates a trailing-stop conditional order
  const handleTrailingStopOrder = useCallback(async (orderSide: 'buy' | 'sell') => {
    const amountNum = parseFloat(amount);
    const trail = parseFloat(trailValue);

    if (!Number.isFinite(trail) || trail <= 0) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    if (midPrice <= 0) return;

    await addTPSLOrderAsync({
      side: orderSide,
      quantity: amountNum,
      triggerPrice: midPrice, // initial reference price
      triggerType: 'trailing-stop',
      ...(trailMode === 'percent'
        ? { trailPercent: trail }
        : { trailAmount: trail }),
      highWaterMark: midPrice,
      marketSymbol: baseSymbol,
    });
    resetForm();
  }, [amount, trailValue, trailMode, midPrice, addTPSLOrderAsync, resetForm, baseSymbol]);

  // One-Click 주문 핸들러 (확인 모달 스킵)
  const handleOneClickOrder = async (type: 'buy' | 'sell') => {
    if (!price || !amount) return;

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const orderType = getOrderType();

    const result = await handleLimitOrder(type, priceNum, amountNum, orderType);

    if (result.success) {
      await createTPSLOrdersIfEnabled(type, amountNum);
      resetForm();
    }
  };

  // Unified limit order handler (One-Click or Modal)
  const handleOrderClick = async (orderSide: 'buy' | 'sell') => {
    // Stop-Limit: create conditional order (no confirmation modal needed)
    if (orderMode === 'stop-limit') {
      await handleStopLimitOrder(orderSide);
      return;
    }

    // Trailing Stop: create conditional order
    if (orderMode === 'trailing-stop') {
      await handleTrailingStopOrder(orderSide);
      return;
    }

    if (oneClickEnabled) {
      handleOneClickOrder(orderSide);
    } else {
      openConfirmModal(orderSide);
    }
  };

  // Confirm modal order execution
  const handleConfirmOrder = async () => {
    if (!price || !amount) return;

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const orderType = getOrderType();

    const result = await handleLimitOrder(pendingOrderType, priceNum, amountNum, orderType);

    closeConfirmModal();

    if (result.success) {
      await createTPSLOrdersIfEnabled(pendingOrderType, amountNum);
      resetForm();
    }
  };

  // Unified market order handler
  const handleMarketOrderClick = async (orderSide: 'buy' | 'sell') => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder(orderSide, amountNum);
    if (result.success) {
      await createTPSLOrdersIfEnabled(orderSide, amountNum);
      setAmount('');
    }
  };

  // Scale order handler — places multiple limit orders sequentially with error tracking
  const handleScaleOrders = useCallback(async (orders: ScaleOrderItem[], orderSide: 'buy' | 'sell') => {
    let successCount = 0;
    let failCount = 0;

    for (const order of orders) {
      const result = await handleLimitOrder(orderSide, order.price, order.quantity);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    if (failCount > 0 && successCount > 0) {
      showToast(`Scale order: ${successCount}/${orders.length} placed, ${failCount} failed`, 'warning');
    } else if (failCount > 0 && successCount === 0) {
      showToast(`Scale order: all ${failCount} orders failed`, 'error');
    }

    // Only reset form if at least one order succeeded
    if (successCount > 0) {
      resetForm();
    }
  }, [handleLimitOrder, resetForm, showToast]);

  // Simple mode market buy handler (receives baseAmount directly)
  const handleSimpleMarketBuy = async (baseAmount: number) => {
    const result = await handleMarketOrder('buy', baseAmount);
    return result.success;
  };

  // Simple mode market sell handler
  const handleSimpleMarketSell = async (baseAmount: number) => {
    const result = await handleMarketOrder('sell', baseAmount);
    return result.success;
  };

  // Simple Mode UI (clean, fixed-height layout)
  if (isSimple) {
    return (
      <div className="h-full">
        <div className="bg-theme-bg-secondary rounded-lg p-4 h-full flex flex-col">
          {/* Header with title and balance */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-base font-semibold text-theme-text-primary">Quick Trade</h3>
            {isConnected && (
              <span className="text-sm xl:text-base text-theme-text-muted font-mono">
                ${availableQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {/* Connect wallet banner when not connected */}
          {!isConnected && (
            <div className="mb-3 p-3 rounded-lg text-sm xl:text-base bg-theme-bg-tertiary text-theme-text-secondary text-center shrink-0">
              Connect wallet to start trading
            </div>
          )}

          {/* Enable Pado banner when connected but no BM */}
          {isConnected && !balanceManagerId && (
            <div className="mb-3 p-4 bg-theme-bg-tertiary rounded-lg text-center shrink-0">
              <div className="text-sm xl:text-base text-theme-text-secondary mb-2">
                Enable Pado to start trading
                <EnablePadoInfo />
              </div>
              <button
                onClick={handleCreateBalanceManager}
                disabled={isLoading}
                className="px-5 py-2 bg-pd1 hover:bg-pd1/80 disabled:bg-pd1/60 text-white rounded-lg text-sm xl:text-base font-medium transition-colors"
              >
                {isLoading ? 'Enabling...' : 'Enable Pado'}
              </button>
            </div>
          )}

          {/* Swap Order Form - fills remaining space */}
          <div className="flex-1 min-h-0">
            <SwapOrderForm
              midPrice={midPrice}
              bids={bids}
              asks={asks}
              onMarketBuy={handleSimpleMarketBuy}
              onMarketSell={handleSimpleMarketSell}
              disabled={!isConnected || !balanceManagerId}
              isLoading={isLoading}
              quoteBalance={availableQuote}
              baseBalance={availableBase}
            />
          </div>
        </div>
      </div>
    );
  }

  // Pro Mode UI (with auto deposit)
  return (
    <div className="h-full flex flex-col gap-4">
      {/* Order Form Card */}
      <div className="bg-theme-bg-secondary rounded-lg p-3 flex-1 min-h-0 flex flex-col">
        {/* Connect wallet banner when not connected */}
        {!isConnected && (
          <div className="mb-4 p-3 rounded text-sm xl:text-base bg-pd5 dark:bg-pd0/30 text-pd1 dark:text-pd3 border border-pd4 dark:border-pd2 text-center">
            Connect wallet to start trading
          </div>
        )}

        {/* Order Form */}
        <OrderForm
          price={price}
          amount={amount}
          onPriceChange={setPrice}
          onAmountChange={setAmount}
          onOrder={handleOrderClick}
          onMarketOrder={handleMarketOrderClick}
          disabled={!isConnected || !balanceManagerId}
          isLoading={isLoading}
          isAutoDepositing={isAutoDepositing}
          midPrice={midPrice}
          bestBid={bestBid}
          bestAsk={bestAsk}
          executionOption={executionOption}
          onExecutionOptionChange={setExecutionOption}
          slippage={slippage}
          onSlippageChange={setSlippage}
          availableQuote={availableQuote}
          availableBase={availableBase}
          lockedQuote={lockedQuote}
          lockedBase={lockedBase}
          side={side}
          onSideChange={setSide}
          bids={bids}
          asks={asks}
          onScaleOrder={handleScaleOrders}
        />

        {/* TP/SL Keeper Badge — execution mode indicator */}
        {balanceManagerId && (
          <div className="mt-2 flex justify-end">
            <TPSLKeeperBadge tradeCap={tradeCap} />
          </div>
        )}

        {/* Order Confirmation Modal */}
        <OrderConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={closeConfirmModal}
          onConfirm={handleConfirmOrder}
          orderType={pendingOrderType}
          price={price}
          amount={amount}
          isLoading={isLoading}
          executionOption={executionOption}
          midPrice={midPrice}
          onEnableOneClick={() => setOneClickEnabled(true)}
        />

        {/* TP/SL Keeper onboarding modal */}
        <TPSLKeeperModal
          isOpen={showKeeperModal}
          onClose={() => setShowKeeperModal(false)}
          tradeCap={tradeCap}
          walletAddress={walletAddress}
        />

      </div>
    </div>
  );
}
