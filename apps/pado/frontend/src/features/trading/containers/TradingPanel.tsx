/**
 * TradingPanel Container
 * 주문 폼 + BalanceManager 카드 + 오픈 오더 (lg:col-span-1)
 * Simple mode: SimpleOrderForm only
 * Pro mode: Full OrderForm + BalanceManager + Open Orders
 */

import { useState } from 'react';
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
              <p className="text-sm text-theme-text-secondary mb-3">
                Enable Pado to start placing orders
              </p>
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-theme-text-primary">Trading Balance</span>
              {isAutoDepositing && (
                <span className="text-xs text-blue-400 animate-pulse">Depositing...</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* One-Click Trading Toggle */}
              <label className="flex items-center gap-2 cursor-pointer" title="Execute orders immediately without confirmation">
                <span className="text-xs text-theme-text-secondary">One-Click</span>
                <button
                  onClick={() => setOneClickEnabled(!oneClickEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    oneClickEnabled ? 'bg-purple-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      oneClickEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              {/* Auto Deposit Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-theme-text-secondary">Auto Deposit</span>
                <button
                  onClick={() => setAutoDepositEnabled(!autoDepositEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    autoDepositEnabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      autoDepositEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Balance Display */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-4">
              <span className="text-theme-text-secondary">
                <span className="text-theme-text-primary font-mono">{bmBalance.base.toFixed(4)}</span> {baseSymbol}
              </span>
              <span className="text-theme-text-secondary">
                <span className="text-theme-text-primary font-mono">{bmBalance.quote.toFixed(2)}</span> NUSDC
              </span>
            </div>
            {/* Advanced settings toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-blue-500 hover:text-blue-400"
            >
              {showAdvanced ? 'Hide Advanced' : 'Advanced'}
            </button>
          </div>

          {/* One-Click Trading Warning */}
          {oneClickEnabled && (
            <p className="text-xs text-purple-400 mt-2">
              One-Click enabled: Orders execute immediately without confirmation.
            </p>
          )}

          {/* Auto Deposit Info */}
          {autoDepositEnabled && !lastAutoDepositError && !oneClickEnabled && (
            <p className="text-xs text-theme-text-muted mt-2">
              Funds will be automatically moved from wallet when needed.
            </p>
          )}
          {!autoDepositEnabled && (
            <p className="text-xs text-yellow-500 mt-2">
              Auto deposit disabled. You may need to manually add funds before trading.
            </p>
          )}

          {/* Auto Deposit Error Fallback */}
          {lastAutoDepositError && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
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
          <p className="text-xs text-theme-text-muted mb-3">
            Enable Pado to start trading. Funds will be automatically deposited when needed.
          </p>
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
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-theme-text-primary">Place Order</h3>

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
