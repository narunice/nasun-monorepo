/**
 * TradingPanel Container
 * 주문 폼 + BalanceManager 카드 + 오픈 오더 (lg:col-span-1)
 * Simple mode: SimpleOrderForm only
 * Pro mode: Full OrderForm + BalanceManager + Open Orders
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';
import { useOrderbook, useOpenOrders, useOrderActions, type TradeMode } from '../hooks';
import { useOrderForm, useMarket } from '../context';
import {
  OrderForm,
  OrderConfirmModal,
  BalanceManagerCard,
  OpenOrders,
  PoolInfo,
  SimpleOrderForm,
  TradingBalanceBar,
} from '../components';

function EnablePadoInfo({ variant = 'simple' }: { variant?: 'simple' | 'pro' }) {
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
              <p className="text-xs font-semibold text-theme-text-primary mb-2">
                Why do I need to enable Pado?
              </p>
              <p className="text-xs text-theme-text-secondary mb-2 leading-relaxed">
                On centralized exchanges, the platform holds your funds. Pado is
                a decentralized exchange where you control your own assets.
              </p>
              <p className="text-xs text-theme-text-secondary mb-3 leading-relaxed">
                &ldquo;Enable Pado&rdquo; creates a secure on-chain account to hold
                your trading funds. This is a one-time setup&mdash;once enabled,
                you can start trading immediately.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-theme-text-primary mb-2">
                What does Enable Pado do?
              </p>
              <p className="text-xs text-theme-text-secondary mb-2 leading-relaxed">
                Creates a DeepBook V3 <span className="text-theme-text-primary">BalanceManager</span> and
                a <span className="text-theme-text-primary">Unified Margin Account</span> in
                a single transaction.
              </p>
              <div className="text-xs text-theme-text-secondary mb-2 leading-relaxed">
                <p className="font-medium text-theme-text-primary mb-1">BalanceManager</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>On-chain object that holds your trading balances</li>
                  <li>Supports multiple tokens (NBTC, NUSDC, etc.)</li>
                  <li>Auto-deposit from wallet when placing orders</li>
                </ul>
              </div>
              <div className="text-xs text-theme-text-secondary mb-3 leading-relaxed">
                <p className="font-medium text-theme-text-primary mb-1">Margin Account</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Shared across Trading, Predictions, and Lending</li>
                  <li>Multi-collateral support (NUSDC + NBTC)</li>
                </ul>
              </div>
              <p className="text-xs text-theme-text-muted mb-3 leading-relaxed">
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

interface TradingPanelProps {
  mode?: TradeMode;
}

export function TradingPanel({ mode = 'pro' }: TradingPanelProps) {
  const isSimple = mode === 'simple';
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  // Market context for base token symbol
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;

  // 오더북 데이터 (가격 정보)
  const { data: orderbookData } = useOrderbook();
  const midPrice = orderbookData?.midPrice ?? 0;
  const bestBid = orderbookData?.orderbook?.bids[0]?.price ?? 0;
  const bestAsk = orderbookData?.orderbook?.asks[0]?.price ?? 0;

  // 주문 액션
  const {
    isLoading,
    balanceManagerId,
    isAutoDepositing,
    autoDepositEnabled,
    setAutoDepositEnabled,
    lastAutoDepositError,
    handleLimitOrder,
    handleMarketOrder,
    handleCancelOrder,
    handleCreateBalanceManager,
    handleDeposit,
    handleWithdraw,
  } = useOrderActions();

  // Advanced settings (for manual deposit)
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 오픈 오더 데이터
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
  const orders = openOrdersData?.orders ?? [];
  const bmBalance = openOrdersData?.balance ?? { base: 0, quote: 0 };

  // Wallet balances for unified available balance
  const { data: multiBalance } = useMultiBalance();
  const walletBase = parseFloat(multiBalance?.tokens[baseSymbol]?.formatted ?? '0');
  const walletQuote = parseFloat(multiBalance?.tokens['NUSDC']?.formatted ?? '0');
  const availableBase = walletBase + bmBalance.base;
  const availableQuote = walletQuote + bmBalance.quote;

  // 주문 폼 상태 (Context)
  const {
    price,
    amount,
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
  } = useOrderForm();

  // One-Click warning modal
  const [showOneClickWarning, setShowOneClickWarning] = useState(false);

  const handleOneClickToggle = useCallback(() => {
    if (oneClickEnabled) {
      setOneClickEnabled(false);
    } else {
      const acknowledged = localStorage.getItem('pado:oneClickAcknowledged') === 'true';
      if (acknowledged) {
        setOneClickEnabled(true);
      } else {
        setShowOneClickWarning(true);
      }
    }
  }, [oneClickEnabled, setOneClickEnabled]);

  const confirmOneClick = useCallback(() => {
    try {
      localStorage.setItem('pado:oneClickAcknowledged', 'true');
    } catch { /* ignore */ }
    setOneClickEnabled(true);
    setShowOneClickWarning(false);
  }, [setOneClickEnabled]);

  // One-Click 주문 핸들러 (확인 모달 스킵)
  const handleOneClickOrder = async (type: 'buy' | 'sell') => {
    if (!price || !amount) return;

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const orderType = getOrderType();

    const result = await handleLimitOrder(type, priceNum, amountNum, orderType);

    if (result.success) {
      resetForm();
    }
  };

  // 주문 버튼 클릭 핸들러 (One-Click 또는 Modal)
  const handleOrderClick = (type: 'buy' | 'sell') => {
    if (oneClickEnabled) {
      handleOneClickOrder(type);
    } else {
      openConfirmModal(type);
    }
  };

  // 지정가 주문 실행
  const handleConfirmOrder = async () => {
    if (!price || !amount) return;

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    const orderType = getOrderType();

    const result = await handleLimitOrder(pendingOrderType, priceNum, amountNum, orderType);

    closeConfirmModal();

    if (result.success) {
      resetForm();
    }
  };

  // 시장가 매수
  const handleMarketBuy = async () => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder('buy', amountNum);
    if (result.success) {
      setAmount('');
    }
  };

  // 시장가 매도
  const handleMarketSell = async () => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder('sell', amountNum);
    if (result.success) {
      setAmount('');
    }
  };

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

  // Simple Mode UI
  if (isSimple) {
    return (
      <div className="space-y-4">
        <div className="bg-theme-bg-secondary rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-theme-text-primary">Quick Trade</h3>

          {/* Connect wallet banner when not connected */}
          {!isConnected && (
            <div className="mb-4 p-3 rounded text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 text-center">
              Connect wallet to start trading
            </div>
          )}

          {/* Trading Balance setup for Simple mode */}
          {isConnected && !balanceManagerId && (
            <div className="mb-4 p-4 bg-theme-bg-tertiary rounded-lg text-center">
              <div className="text-sm text-theme-text-secondary mb-3">
                Enable Pado to start placing orders
                <EnablePadoInfo />
              </div>
              <button
                onClick={handleCreateBalanceManager}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? 'Enabling...' : 'Enable Pado'}
              </button>
            </div>
          )}

          {/* Balance Bar + Faucet (shown when connected) */}
          {isConnected && (
            <div className="mb-4">
              <TradingBalanceBar
                baseSymbol={baseSymbol}
                tradingBase={bmBalance.base}
                tradingQuote={bmBalance.quote}
                mode="simple"
              />
            </div>
          )}

          {/* Simple Order Form */}
          <SimpleOrderForm
            midPrice={midPrice}
            onMarketBuy={handleSimpleMarketBuy}
            onMarketSell={handleSimpleMarketSell}
            disabled={!isConnected || !balanceManagerId}
            isLoading={isLoading}
            quoteBalance={availableQuote}
            baseBalance={availableBase}
          />
        </div>
      </div>
    );
  }

  // Pro Mode UI (with auto deposit)
  return (
    <div className="space-y-4">
      {/* Trading Status Bar */}
      {isConnected && balanceManagerId && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          {/* Row 1: Title */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-theme-text-primary whitespace-nowrap">Trading Balance</span>
            {isAutoDepositing && (
              <span className="text-xs text-blue-400 animate-pulse">Depositing...</span>
            )}
          </div>

          {/* Row 2: Balance Display */}
          <div className="flex items-center gap-4 text-sm mb-3">
            <span className="text-theme-text-secondary">
              <span className="text-theme-text-primary font-mono">{bmBalance.base.toFixed(4)}</span> {baseSymbol}
            </span>
            <span className="text-theme-text-secondary">
              <span className="text-theme-text-primary font-mono">{bmBalance.quote.toFixed(2)}</span> NUSDC
            </span>
          </div>

          {/* Row 3: Toggle groups (justify-around), each with info text below */}
          <div className="flex justify-around mb-3">
            {/* One-Click group */}
            <div className="flex flex-col items-center gap-1">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Execute orders immediately without confirmation">
                <span className="text-xs text-theme-text-muted">One-Click</span>
                <button
                  onClick={handleOneClickToggle}
                  className={`w-7 h-3.5 rounded-full transition-colors ${
                    oneClickEnabled ? 'bg-purple-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                      oneClickEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              {oneClickEnabled && (
                <p className="text-[10px] text-purple-400 text-center leading-tight">
                  Orders execute immediately
                </p>
              )}
            </div>

            {/* Auto Deposit group */}
            <div className="flex flex-col items-center gap-1">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Automatically deposit from wallet when balance is insufficient">
                <span className="text-xs text-theme-text-muted">Auto Deposit</span>
                <button
                  onClick={() => setAutoDepositEnabled(!autoDepositEnabled)}
                  className={`w-7 h-3.5 rounded-full transition-colors ${
                    autoDepositEnabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                      autoDepositEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              {autoDepositEnabled && !lastAutoDepositError && (
                <p className="text-[10px] text-theme-text-muted text-center leading-tight">
                  Auto-deposits from wallet
                </p>
              )}
              {!autoDepositEnabled && (
                <p className="text-[10px] text-yellow-500 text-center leading-tight">
                  Manual deposit required
                </p>
              )}
            </div>
          </div>

          {/* Auto Deposit Error */}
          {lastAutoDepositError && (
            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-400 mb-1">
                Auto deposit failed: {lastAutoDepositError}
              </p>
              <button
                onClick={() => setShowAdvanced(true)}
                className="text-xs text-blue-500 hover:text-blue-400 underline"
              >
                Try manual deposit
              </button>
            </div>
          )}

          {/* Advanced button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors"
            >
              Advanced
              <svg
                className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Advanced Settings (BalanceManagerCard) */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-theme-border">
              <h4 className="text-xs font-semibold text-theme-text-secondary mb-3">Manual Deposit/Withdraw</h4>
              <BalanceManagerCard
                balanceManagerId={balanceManagerId}
                balance={bmBalance}
                isLoading={isLoading}
                onCreate={handleCreateBalanceManager}
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
              />
            </div>
          )}
        </div>
      )}

      {/* Enable Pado prompt (when no BalanceManager) */}
      {isConnected && !balanceManagerId && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 text-theme-text-primary">Enable Pado</h3>
          <div className="text-xs text-theme-text-muted mb-3">
            Enable Pado to start trading. Funds will be automatically deposited when needed.
            <EnablePadoInfo variant="pro" />
          </div>
          <button
            onClick={handleCreateBalanceManager}
            disabled={isLoading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Enabling...' : 'Enable Pado'}
          </button>
        </div>
      )}

      {/* Place Order Card */}
      <div className="bg-theme-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3 text-theme-text-primary">Place Order</h3>

        {/* Connect wallet banner when not connected */}
        {!isConnected && (
          <div className="mb-4 p-3 rounded text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 text-center">
            Connect wallet to start trading
          </div>
        )}

        {/* Balance Bar + Faucet (Pro mode - shown when connected and has BalanceManager) */}
        {isConnected && balanceManagerId && (
          <div className="mb-4">
            <TradingBalanceBar
              baseSymbol={baseSymbol}
              tradingBase={bmBalance.base}
              tradingQuote={bmBalance.quote}
              mode="pro"
            />
          </div>
        )}

        {/* Order Form */}
        <OrderForm
          price={price}
          amount={amount}
          onPriceChange={setPrice}
          onAmountChange={setAmount}
          onBuy={() => handleOrderClick('buy')}
          onSell={() => handleOrderClick('sell')}
          onMarketBuy={handleMarketBuy}
          onMarketSell={handleMarketSell}
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
        />

        {/* Order Confirmation Modal */}
        <OrderConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={closeConfirmModal}
          onConfirm={handleConfirmOrder}
          orderType={pendingOrderType}
          price={price}
          amount={amount}
          isLoading={isLoading}
        />

        {/* One-Click Warning Modal */}
        {showOneClickWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-theme-bg-secondary rounded-lg p-5 max-w-sm mx-4 border border-theme-border">
              <h3 className="text-sm font-semibold text-theme-text-primary mb-3">Enable One-Click Trading</h3>
              <p className="text-xs text-theme-text-secondary mb-4 leading-relaxed">
                Orders will execute immediately without a confirmation step.
                On-chain transactions cannot be cancelled or reversed.
                Make sure you review price and amount before clicking Buy or Sell.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowOneClickWarning(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-lg bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmOneClick}
                  className="flex-1 py-2 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                >
                  Enable
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pool Info */}
        <PoolInfo />

        {/* Open Orders */}
        {isConnected && balanceManagerId && (
          <OpenOrders
            orders={orders}
            isLoading={isLoading}
            onCancel={handleCancelOrder}
          />
        )}
      </div>
    </div>
  );
}
