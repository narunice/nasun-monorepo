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
import { OrderForm, OrderConfirmModal, SimpleOrderForm, TradingBalanceBar } from '../components';

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
    handleLimitOrder,
    handleMarketOrder,
    handleCreateBalanceManager,
  } = useOrderActions();

  // BM balance data
  const { data: openOrdersData } = useOpenOrders(balanceManagerId);
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
    side,
    setSide,
    executionOption,
    setExecutionOption,
    getOrderType,
    slippage,
    setSlippage,
    oneClickEnabled,
    isConfirmModalOpen,
    pendingOrderType,
    setPrice,
    setAmount,
    openConfirmModal,
    closeConfirmModal,
    resetForm,
  } = useOrderForm();

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

  // Unified limit order handler (One-Click or Modal)
  const handleOrderClick = (orderSide: 'buy' | 'sell') => {
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
      resetForm();
    }
  };

  // Unified market order handler
  const handleMarketOrderClick = async (orderSide: 'buy' | 'sell') => {
    if (!amount) return;
    const amountNum = parseFloat(amount);
    const result = await handleMarketOrder(orderSide, amountNum);
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
          <h3 className="text-lg xl:text-xl font-semibold mb-4 text-theme-text-primary">Quick Trade</h3>

          {/* Connect wallet banner when not connected */}
          {!isConnected && (
            <div className="mb-4 p-3 rounded text-sm xl:text-base bg-pd5 dark:bg-pd0/30 text-pd1 dark:text-pd3 border border-pd4 dark:border-pd2 text-center">
              Connect wallet to start trading
            </div>
          )}

          {/* Trading Balance setup for Simple mode */}
          {isConnected && !balanceManagerId && (
            <div className="mb-4 p-4 bg-theme-bg-tertiary rounded-lg text-center">
              <div className="text-sm xl:text-base text-theme-text-secondary mb-3">
                Enable Pado to start placing orders
                <EnablePadoInfo />
              </div>
              <button
                onClick={handleCreateBalanceManager}
                disabled={isLoading}
                className="px-4 py-2 bg-pd1 hover:bg-pd1/80 disabled:bg-pd1/60 text-white rounded-lg text-sm xl:text-base font-medium transition-colors"
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
      {/* Enable Pado prompt (when no BalanceManager) */}
      {isConnected && !balanceManagerId && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
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
      )}

      {/* Order Form Card */}
      <div className="bg-theme-bg-secondary rounded-lg p-3">
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
          side={side}
          onSideChange={setSide}
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

      </div>
    </div>
  );
}
